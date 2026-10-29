import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";
import { ALLERGENS, toAllergenList, type Allergen } from "./allergens";

// Admin ingredient allergen editor (spec 0043 AC-11).

export const ADMIN_INGREDIENTS_PAGE_SIZE = 50;

export interface AdminIngredient {
  id: string;
  name: string;
  /** Null = not reviewed yet, empty = reviewed, none. */
  allergens: readonly Allergen[] | null;
}

export interface FetchAdminIngredientsParams {
  query?: string;
  notReviewedOnly?: boolean;
  /** Zero based. */
  page?: number;
  pageSize?: number;
}

export interface FetchAdminIngredientsResult {
  ingredients: AdminIngredient[];
  total: number;
}

/** Escapes the ILIKE wildcards (% and _) and the escape character itself. */
export function escapeLikePattern(text: string): string {
  return text.replace(/[\\%_]/g, (char) => `\\${char}`);
}

/**
 * One page of ingredients by English name, with an optional "not reviewed"
 * filter. A plain table read: the ingredients_select policy lets anyone read
 * ingredients, so the page's own admin gate is the protection here.
 */
export async function fetchAdminIngredients(
  client: SupabaseClient<Database>,
  {
    query = "",
    notReviewedOnly = false,
    page = 0,
    pageSize = ADMIN_INGREDIENTS_PAGE_SIZE,
  }: FetchAdminIngredientsParams = {},
): Promise<FetchAdminIngredientsResult> {
  let dbQuery = client
    .from("ingredients")
    .select("id, name, allergens", { count: "exact" })
    .order("name")
    .order("id")
    .range(page * pageSize, page * pageSize + pageSize - 1);

  const trimmedQuery = query.trim();

  if (trimmedQuery) {
    dbQuery = dbQuery.ilike("name", `%${escapeLikePattern(trimmedQuery)}%`);
  }

  if (notReviewedOnly) {
    dbQuery = dbQuery.is("allergens", null);
  }

  const { data, error, count } = await dbQuery;

  if (error) {
    throw error;
  }

  return {
    ingredients: (data ?? []).map((row) => ({
      id: row.id,
      name: row.name,
      allergens: toAllergenList(row.allergens),
    })),
    total: count ?? 0,
  };
}

/** One row's checkboxes: "none" and the allergen boxes are mutually exclusive. */
export interface AllergenSelection {
  readonly none: boolean;
  readonly allergens: readonly Allergen[];
}

export function selectionFromAllergens(allergens: readonly Allergen[] | null): AllergenSelection {
  return { none: allergens !== null && allergens.length === 0, allergens: allergens ?? [] };
}

/** Checking an allergen turns "none" off; the list stays in ALLERGENS order. */
export function toggleAllergen(
  selection: AllergenSelection,
  allergen: Allergen,
): AllergenSelection {
  const checked = selection.allergens.includes(allergen);
  return {
    none: false,
    allergens: ALLERGENS.filter((a) =>
      a === allergen ? !checked : selection.allergens.includes(a),
    ),
  };
}

/** Checking "none" clears every allergen box. */
export function toggleNone(selection: AllergenSelection): AllergenSelection {
  return selection.none
    ? { none: false, allergens: selection.allergens }
    : { none: true, allergens: [] };
}

/** Only a reviewed state can be saved, so the app never writes null. */
export function canSaveSelection(selection: AllergenSelection): boolean {
  return selection.none || selection.allergens.length > 0;
}

export type SetIngredientAllergensResult =
  | { data: true; error: null }
  | { data: null; error: { reason: "request_failed"; message: string } };

/** Thin wrapper over admin_set_ingredient_allergens (is_admin checked in the RPC). */
export async function setIngredientAllergens(
  client: SupabaseClient<Database>,
  ingredientId: string,
  selection: AllergenSelection,
): Promise<SetIngredientAllergensResult> {
  const { error } = await client.rpc("admin_set_ingredient_allergens", {
    p_ingredient_id: ingredientId,
    p_allergens: selection.none ? [] : [...selection.allergens],
  });

  if (error) {
    return { data: null, error: { reason: "request_failed", message: error.message } };
  }

  return { data: true, error: null };
}
