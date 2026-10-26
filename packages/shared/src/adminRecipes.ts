import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";
import { parseMeasure, type RecognizedUnit } from "./units";
import { canonicalGlass, canonicalIngredientName } from "./catalogNames";

export const ADMIN_RECIPE_NAME_MAX_LENGTH = 200;
export const ADMIN_RECIPE_INSTRUCTIONS_MAX_LENGTH = 10000;
export const ADMIN_RECIPES_PAGE_SIZE = 20;

export const ADMIN_ALCOHOLIC_STATUSES = [
  "alcoholic",
  "non_alcoholic",
  "optional",
  "unknown",
] as const;

export type AdminAlcoholicStatus = (typeof ADMIN_ALCOHOLIC_STATUSES)[number];

export interface AdminRecipeSummary {
  id: string;
  name: string;
  glass: string | null;
  alcoholicStatus: string;
  source: string;
  createdAt: string;
}

export interface FetchAdminRecipesParams {
  query?: string;
  pageLimit?: number;
  beforeCreatedAt?: string;
  beforeId?: string;
}

export interface FetchAdminRecipesResult {
  recipes: AdminRecipeSummary[];
  hasMore: boolean;
}

/**
 * Admin scoped recipe list: every non deleted recipe (catalog or admin
 * sourced), newest first, same keyset pagination shape as fetchAllComments
 * (spec 0028). A caller without is_admin gets an empty, not an error,
 * result: RLS's SELECT policy already allows any viewer to read recipes,
 * so this list's protection is entirely the admin page's own session gate.
 */
export async function fetchAdminRecipes(
  client: SupabaseClient<Database>,
  {
    query = "",
    pageLimit = ADMIN_RECIPES_PAGE_SIZE,
    beforeCreatedAt,
    beforeId,
  }: FetchAdminRecipesParams = {},
): Promise<FetchAdminRecipesResult> {
  let dbQuery = client
    .from("recipes")
    .select("id, name, glass, alcoholic_status, source, created_at")
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(pageLimit + 1);

  const trimmedQuery = query.trim();

  if (trimmedQuery) {
    dbQuery = dbQuery.ilike("name", `%${trimmedQuery}%`);
  }

  if (beforeCreatedAt && beforeId) {
    dbQuery = dbQuery.or(
      `created_at.lt.${beforeCreatedAt},and(created_at.eq.${beforeCreatedAt},id.lt.${beforeId})`,
    );
  }

  const { data, error } = await dbQuery;

  if (error) {
    throw error;
  }

  const rows = data ?? [];
  const hasMore = rows.length > pageLimit;
  const page = hasMore ? rows.slice(0, pageLimit) : rows;

  return {
    recipes: page.map((row) => ({
      id: row.id,
      name: row.name,
      glass: row.glass,
      alcoholicStatus: row.alcoholic_status,
      source: row.source,
      createdAt: row.created_at,
    })),
    hasMore,
  };
}

export interface AdminRecipeIngredient {
  name: string;
  measure: string | null;
}

export interface AdminRecipeTag {
  name: string;
}

export interface AdminRecipeDetail {
  id: string;
  name: string;
  instructions: string;
  imageUrl: string | null;
  glass: string | null;
  alcoholicStatus: string;
  region: string | null;
  source: string;
  ingredients: AdminRecipeIngredient[];
  /** Catalog tags only; taste tags are in flavorProfile. */
  tags: AdminRecipeTag[];
  /** Taste tags (tags.kind = 'taste'), sorted by name. */
  flavorProfile: AdminRecipeTag[];
}

/**
 * A direct, non locale aware read of a recipe's own canonical fields plus
 * its ingredients and tags, for pre filling the admin edit form. Deliberately
 * not fetch_recipe_detail (spec 0020's RPC): that function resolves locale
 * translations and omits tags, neither of which the admin form edits.
 */
export async function fetchAdminRecipeDetail(
  client: SupabaseClient<Database>,
  id: string,
): Promise<AdminRecipeDetail | null> {
  const { data, error } = await client
    .from("recipes")
    .select(
      `id, name, instructions, image_url, glass, alcoholic_status, region, source,
       recipe_ingredients ( measure, sort_order, ingredients ( name ) ),
       recipe_tags ( tags ( name, kind ) )`,
    )
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data) {
    return null;
  }

  const ingredients = [...data.recipe_ingredients]
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((ri) => ({ name: ri.ingredients.name, measure: ri.measure }));

  const tags = data.recipe_tags
    .filter((rt) => rt.tags.kind === "catalog")
    .map((rt) => ({ name: rt.tags.name }));

  const flavorProfile = data.recipe_tags
    .filter((rt) => rt.tags.kind === "taste")
    .map((rt) => ({ name: rt.tags.name }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return {
    id: data.id,
    name: data.name,
    instructions: data.instructions,
    imageUrl: data.image_url,
    glass: data.glass,
    alcoholicStatus: data.alcoholic_status,
    region: data.region,
    source: data.source,
    ingredients,
    tags,
    flavorProfile,
  };
}

export type AdminRecipeFormIngredient = { name: string; measure: string | null };
export type AdminRecipeFormTag = { name: string };

export interface AdminRecipeFormValues {
  recipeId: string | null;
  name: string;
  instructions: string;
  imageUrl: string | null;
  glass: string | null;
  alcoholicStatus: AdminAlcoholicStatus;
  region: string | null;
  ingredients: AdminRecipeFormIngredient[];
  tags: AdminRecipeFormTag[];
  /**
   * Null leaves the recipe's flavor profile as it is (a new recipe then gets
   * classify-recipes' tags). An array replaces it and locks it against
   * reclassification, so send one only when the admin touched the picker.
   */
  flavorProfile: AdminRecipeFormTag[] | null;
}

export type AdminRecipeValidationError =
  | { field: "name"; reason: "required" | "too_long" }
  | { field: "instructions"; reason: "required" | "too_long" }
  | { field: "alcoholicStatus"; reason: "invalid" }
  | { field: "ingredients"; reason: "required" };

/**
 * Mirrors admin_upsert_recipe's own checks (AC-8) so an invalid submission
 * is caught before the round trip, not only inside the function.
 */
export function validateAdminRecipeForm(
  values: AdminRecipeFormValues,
): AdminRecipeValidationError[] {
  const errors: AdminRecipeValidationError[] = [];
  const trimmedName = values.name.trim();
  const trimmedInstructions = values.instructions.trim();

  if (trimmedName.length === 0) {
    errors.push({ field: "name", reason: "required" });
  } else if (trimmedName.length > ADMIN_RECIPE_NAME_MAX_LENGTH) {
    errors.push({ field: "name", reason: "too_long" });
  }

  if (trimmedInstructions.length === 0) {
    errors.push({ field: "instructions", reason: "required" });
  } else if (trimmedInstructions.length > ADMIN_RECIPE_INSTRUCTIONS_MAX_LENGTH) {
    errors.push({ field: "instructions", reason: "too_long" });
  }

  if (!ADMIN_ALCOHOLIC_STATUSES.includes(values.alcoholicStatus)) {
    errors.push({ field: "alcoholicStatus", reason: "invalid" });
  }

  const nonEmptyIngredients = values.ingredients.filter((i) => i.name.trim().length > 0);

  if (nonEmptyIngredients.length === 0) {
    errors.push({ field: "ingredients", reason: "required" });
  }

  return errors;
}

export type SaveAdminRecipeError =
  | { reason: "validation"; errors: AdminRecipeValidationError[] }
  | { reason: "request_failed"; message: string };

export type SaveAdminRecipeResult =
  { data: { id: string }; error: null } | { data: null; error: SaveAdminRecipeError };

// A type alias, not an interface, so it stays assignable to the RPC's Json arg.
export type AdminIngredientPayload = {
  name: string;
  measure: string | null;
  sortOrder: number;
  amount_value: number | null;
  amount_unit: RecognizedUnit | null;
};

/**
 * Builds the admin_upsert_recipe ingredient payload, parsing each trimmed
 * measure with the shared parser so an admin save keeps the recipe's unit
 * toggle and batch panel working (spec 0035 AC-8). An unparsed line sends
 * both amount fields as null. Names get the catalog casing rule, so an admin
 * save never flips a shared ingredient's name back (spec 0036 AC-7).
 */
export function toAdminIngredientPayload(
  ingredients: readonly AdminRecipeFormIngredient[],
): AdminIngredientPayload[] {
  return ingredients.map((ingredient, index) => {
    const measure = ingredient.measure?.trim() || null;
    const parsed = parseMeasure(measure);
    return {
      name: canonicalIngredientName(ingredient.name),
      measure,
      sortOrder: index,
      amount_value: parsed?.value ?? null,
      amount_unit: parsed?.unit ?? null,
    };
  });
}

/**
 * Splits pasted text into tag or flavor names for the admin form's paste to
 * fill: one name per line or comma separated item, trimmed, with a leading
 * list bullet dropped, blanks skipped, and case insensitive repeats removed.
 */
export function splitNameList(text: string): string[] {
  const names = text
    .split(/[\r\n,]+/)
    .map((item) => item.trim().replace(/^[-*•·–]\s*/, ""))
    .filter((item) => item.length > 0);

  return names.filter(
    (name, index) =>
      names.findIndex((other) => other.toLowerCase() === name.toLowerCase()) === index,
  );
}

/**
 * Thin wrapper over the admin_upsert_recipe RPC (spec 0030): resolves or
 * creates each ingredient/tag/flavor by normalized name and replaces the recipe's
 * join rows in one transaction, so a save either fully succeeds or fully
 * fails (AC-8).
 */
export async function saveAdminRecipe(
  client: SupabaseClient<Database>,
  values: AdminRecipeFormValues,
): Promise<SaveAdminRecipeResult> {
  const errors = validateAdminRecipeForm(values);

  if (errors.length > 0) {
    return { data: null, error: { reason: "validation", errors } };
  }

  const nonEmptyIngredients = values.ingredients.filter((i) => i.name.trim().length > 0);
  const nonEmptyTags = values.tags.filter((t) => t.name.trim().length > 0);
  const flavorNames = values.flavorProfile
    ? [...new Set(values.flavorProfile.map((f) => f.name.trim()).filter((n) => n.length > 0))]
    : null;

  // The generated RPC Args type marks these text params non-nullable (a
  // Supabase type generator limitation for plpgsql functions), but the
  // underlying Postgres function accepts null for all of them.
  const { data, error } = await client.rpc("admin_upsert_recipe", {
    p_recipe_id: values.recipeId,
    p_name: values.name.trim(),
    p_instructions: values.instructions.trim(),
    p_image_url: values.imageUrl?.trim() || null,
    p_glass: canonicalGlass(values.glass),
    p_alcoholic_status: values.alcoholicStatus,
    p_region: values.region?.trim() || null,
    p_ingredients: toAdminIngredientPayload(nonEmptyIngredients),
    p_tags: nonEmptyTags.map((tag) => ({ name: tag.name.trim() })),
    p_flavor_profile: flavorNames,
  } as Database["public"]["Functions"]["admin_upsert_recipe"]["Args"]);

  if (error) {
    return { data: null, error: { reason: "request_failed", message: error.message } };
  }

  return { data: { id: data as unknown as string }, error: null };
}

export type DeleteAdminRecipeResult =
  | { data: true; error: null }
  | {
      data: null;
      error: { reason: "request_failed"; message: string };
    };

export async function deleteAdminRecipe(
  client: SupabaseClient<Database>,
  recipeId: string,
): Promise<DeleteAdminRecipeResult> {
  const { error } = await client.rpc("admin_delete_recipe", { p_recipe_id: recipeId });

  if (error) {
    return { data: null, error: { reason: "request_failed", message: error.message } };
  }

  return { data: true, error: null };
}

/**
 * Distinct, sorted glass names already used by non deleted recipes, for the
 * admin form's glass autocomplete. recipes.glass is free text (no lookup
 * table), so reusing an existing spelling is the only guard against near
 * duplicates like "Highball" vs "Highball glass".
 */
export async function fetchAdminGlassNames(client: SupabaseClient<Database>): Promise<string[]> {
  const { data, error } = await client
    .from("recipes")
    .select("glass")
    .is("deleted_at", null)
    .not("glass", "is", null);

  if (error) {
    throw error;
  }

  const names = (data ?? [])
    .map((row) => row.glass?.trim() ?? "")
    .filter((glass) => glass.length > 0);

  return [...new Set(names)].sort((a, b) => a.localeCompare(b));
}

/**
 * Every existing catalog tag name, sorted, for the admin form's tag
 * autocomplete. admin_upsert_recipe resolves tags by normalized name, so
 * reusing an existing spelling links the existing tag instead of creating a
 * near duplicate. Taste tags are left out: the Flavor profile picker owns them.
 */
export async function fetchAdminTagNames(client: SupabaseClient<Database>): Promise<string[]> {
  const { data, error } = await client
    .from("tags")
    .select("name")
    .eq("kind", "catalog")
    .order("name");

  if (error) {
    throw error;
  }

  return (data ?? []).map((row) => row.name);
}

/**
 * Every existing flavor profile name (taste tags), sorted, for the admin
 * form's flavor autocomplete. A name that isn't listed is created as a new
 * taste tag on save.
 */
export async function fetchAdminFlavorNames(client: SupabaseClient<Database>): Promise<string[]> {
  const { data, error } = await client
    .from("tags")
    .select("name")
    .eq("kind", "taste")
    .order("name");

  if (error) {
    throw error;
  }

  return (data ?? []).map((row) => row.name);
}
