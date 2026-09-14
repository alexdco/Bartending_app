import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";
import { DEFAULT_LOCALE, type Locale } from "./locale";
import { RECIPE_SEARCH_PAGE_SIZE, type RecipeSearchResult } from "./recipes";

export const FAVORITES_PAGE_SIZE = RECIPE_SEARCH_PAGE_SIZE;

export async function fetchFavoriteRecipeIds(client: SupabaseClient<Database>): Promise<string[]> {
  const { data, error } = await client.from("favorites").select("recipe_id");

  if (error) {
    throw error;
  }

  return (data ?? []).map((row) => row.recipe_id);
}

export async function addFavorite(
  client: SupabaseClient<Database>,
  recipeId: string,
): Promise<void> {
  const { data: sessionData, error: sessionError } = await client.auth.getSession();

  if (sessionError) {
    throw sessionError;
  }

  const userId = sessionData.session?.user.id;

  if (!userId) {
    throw new Error("No active session; cannot add a favorite.");
  }

  const { error } = await client
    .from("favorites")
    .upsert(
      { user_id: userId, recipe_id: recipeId },
      { onConflict: "user_id,recipe_id", ignoreDuplicates: true },
    );

  if (error) {
    throw error;
  }
}

export async function removeFavorite(
  client: SupabaseClient<Database>,
  recipeId: string,
): Promise<void> {
  const { error } = await client.from("favorites").delete().eq("recipe_id", recipeId);

  if (error) {
    throw error;
  }
}

export interface FetchFavoriteRecipesParams {
  pageLimit?: number;
  pageOffset?: number;
  locale?: Locale;
}

export async function fetchFavoriteRecipes(
  client: SupabaseClient<Database>,
  {
    pageLimit = FAVORITES_PAGE_SIZE,
    pageOffset = 0,
    locale = DEFAULT_LOCALE,
  }: FetchFavoriteRecipesParams = {},
): Promise<RecipeSearchResult[]> {
  const { data, error } = await client.rpc("fetch_favorite_recipes", {
    p_locale: locale,
    p_page_limit: pageLimit,
    p_page_offset: pageOffset,
  });

  if (error) {
    throw error;
  }

  return (data ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    imageUrl: row.image_url,
    alcoholicStatus: row.alcoholic_status,
  }));
}
