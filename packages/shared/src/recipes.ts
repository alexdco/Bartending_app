import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

export type AlcoholicStatusFilter = "alcoholic" | "non_alcoholic" | "optional";

export interface RecipeSearchResult {
  id: string;
  name: string;
  imageUrl: string | null;
  alcoholicStatus: string;
}

export interface RecipeSearchParams {
  query?: string;
  statusFilter?: AlcoholicStatusFilter | null;
  pageLimit?: number;
  pageOffset?: number;
}

export const RECIPE_SEARCH_PAGE_SIZE = 20;

export async function searchRecipes(
  client: SupabaseClient<Database>,
  {
    query = "",
    statusFilter = null,
    pageLimit = RECIPE_SEARCH_PAGE_SIZE,
    pageOffset = 0,
  }: RecipeSearchParams = {},
): Promise<RecipeSearchResult[]> {
  const { data, error } = await client.rpc("search_recipes", {
    query,
    status_filter: statusFilter ?? undefined,
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
  }));
}

export interface RecipeSitemapEntry {
  id: string;
  name: string;
}

export async function listAllRecipesForSitemap(
  client: SupabaseClient<Database>,
): Promise<RecipeSitemapEntry[]> {
  const { data, error } = await client.from("recipes").select("id, name").is("deleted_at", null);

  if (error) {
    throw error;
  }

  return data ?? [];
}

export interface RecipeIngredientDetail {
  ingredientId: string;
  name: string;
  measure: string | null;
  sortOrder: number;
}

export interface RecipeDetail {
  id: string;
  name: string;
  instructions: string;
  imageUrl: string | null;
  alcoholicStatus: string;
  glass: string | null;
  ingredients: RecipeIngredientDetail[];
  isFavorited: boolean;
}

export async function fetchRecipeDetail(
  client: SupabaseClient<Database>,
  id: string,
): Promise<RecipeDetail | null> {
  const { data, error } = await client
    .from("recipes")
    .select(
      `id, name, instructions, image_url, alcoholic_status, glass,
       recipe_ingredients (
         ingredient_id, measure, sort_order,
         ingredients ( name )
       ),
       favorites ( recipe_id )`,
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

  const ingredients = (data.recipe_ingredients ?? [])
    .map((ri) => ({
      ingredientId: ri.ingredient_id,
      name: ri.ingredients?.name ?? "",
      measure: ri.measure,
      sortOrder: ri.sort_order,
    }))
    .sort((a, b) => a.sortOrder - b.sortOrder);

  return {
    id: data.id,
    name: data.name,
    instructions: data.instructions,
    imageUrl: data.image_url,
    alcoholicStatus: data.alcoholic_status,
    glass: data.glass,
    ingredients,
    isFavorited: (data.favorites ?? []).length > 0,
  };
}

export async function fetchRecipesByIds(
  client: SupabaseClient<Database>,
  ids: string[],
): Promise<RecipeSearchResult[]> {
  if (ids.length === 0) {
    return [];
  }

  const { data, error } = await client
    .from("recipes")
    .select("id, name, image_url, alcoholic_status")
    .in("id", ids)
    .is("deleted_at", null);

  if (error) {
    throw error;
  }

  const byId = new Map(
    (data ?? []).map((row) => [
      row.id,
      {
        id: row.id,
        name: row.name,
        imageUrl: row.image_url,
        alcoholicStatus: row.alcoholic_status,
      },
    ]),
  );

  return ids.flatMap((id) => {
    const recipe = byId.get(id);
    return recipe ? [recipe] : [];
  });
}
