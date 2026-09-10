import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

export interface RecommendedRecipe {
  id: string;
  name: string;
  imageUrl: string | null;
  alcoholicStatus: string;
  score: number;
}

export interface RecipeRecommendationsParams {
  recentRecipeIds?: string[];
  currentRecipeId?: string;
  pageLimit?: number;
  pageOffset?: number;
}

export const RECOMMENDATIONS_PAGE_SIZE = 20;

export async function fetchRecipeRecommendations(
  client: SupabaseClient<Database>,
  {
    recentRecipeIds = [],
    currentRecipeId,
    pageLimit = RECOMMENDATIONS_PAGE_SIZE,
    pageOffset = 0,
  }: RecipeRecommendationsParams = {},
): Promise<RecommendedRecipe[]> {
  const { data, error } = await client.rpc("recommend_recipes", {
    recent_recipe_ids: recentRecipeIds,
    current_recipe_id: currentRecipeId,
    page_limit: pageLimit,
    page_offset: pageOffset,
  });

  if (error) {
    throw error;
  }

  return (data ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    imageUrl: row.image_url,
    alcoholicStatus: row.alcoholic_status,
    score: row.score,
  }));
}
