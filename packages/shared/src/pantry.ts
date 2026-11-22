import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";
import { DEFAULT_LOCALE, type Locale } from "./locale";

export interface PantryItem {
  ingredientId: string;
  name: string;
}

export async function fetchPantryItems(
  client: SupabaseClient<Database>,
  locale: Locale = DEFAULT_LOCALE,
  { mocktailsOnly = false }: { mocktailsOnly?: boolean } = {},
): Promise<PantryItem[]> {
  // Mocktails only mode hides rows outside the visible ingredients; they stay
  // stored (spec 0063 AC-7). Omitted when false (AC-17).
  const { data, error } = await client.rpc("fetch_pantry_items", {
    p_locale: locale,
    ...(mocktailsOnly ? { p_mocktails_only: true } : {}),
  });

  if (error) {
    throw error;
  }

  return (data ?? []).map((row) => ({
    ingredientId: row.ingredient_id,
    name: row.name,
  }));
}

export async function addPantryItem(
  client: SupabaseClient<Database>,
  ingredientId: string,
): Promise<void> {
  const { data: sessionData, error: sessionError } = await client.auth.getSession();

  if (sessionError) {
    throw sessionError;
  }

  const userId = sessionData.session?.user.id;

  if (!userId) {
    throw new Error("No active session; cannot add a pantry item.");
  }

  const { error } = await client
    .from("pantry_items")
    .upsert(
      { user_id: userId, ingredient_id: ingredientId },
      { onConflict: "user_id,ingredient_id", ignoreDuplicates: true },
    );

  if (error) {
    throw error;
  }
}

export async function removePantryItem(
  client: SupabaseClient<Database>,
  ingredientId: string,
): Promise<void> {
  const { error } = await client.from("pantry_items").delete().eq("ingredient_id", ingredientId);

  if (error) {
    throw error;
  }
}

export interface IngredientSearchResult {
  id: string;
  name: string;
}

export interface SearchIngredientsOptions {
  /**
   * Offer staples (Ice, Water). False for the pantry and shopping list,
   * which never hold a staple; true for recipe forms (spec 0036, AC-10, AC-13).
   */
  includeStaples?: boolean;
  /** Mocktails only mode (spec 0063 AC-7): only mocktail visible ingredients. */
  mocktailsOnly?: boolean;
}

export async function searchIngredients(
  client: SupabaseClient<Database>,
  query: string,
  resultLimit = 20,
  locale: Locale = DEFAULT_LOCALE,
  { includeStaples = false, mocktailsOnly = false }: SearchIngredientsOptions = {},
): Promise<IngredientSearchResult[]> {
  const { data, error } = await client.rpc("search_ingredients", {
    query,
    result_limit: resultLimit,
    locale,
    include_staples: includeStaples,
    // Mocktails only mode (spec 0063); omitted when false (AC-17).
    ...(mocktailsOnly ? { mocktails_only: true } : {}),
  });

  if (error) {
    throw error;
  }

  return data ?? [];
}
