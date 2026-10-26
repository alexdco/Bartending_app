import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";
import { DEFAULT_LOCALE, SUPPORTED_LOCALES, type Locale } from "./locale";
import { toRecognizedUnit, type RecognizedUnit } from "./units";
import type { IngredientCategory } from "./batch";

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
  locale?: Locale;
}

export const RECIPE_SEARCH_PAGE_SIZE = 20;

export async function searchRecipes(
  client: SupabaseClient<Database>,
  {
    query = "",
    statusFilter = null,
    pageLimit = RECIPE_SEARCH_PAGE_SIZE,
    pageOffset = 0,
    locale = DEFAULT_LOCALE,
  }: RecipeSearchParams = {},
): Promise<RecipeSearchResult[]> {
  const { data, error } = await client.rpc("search_recipes", {
    query,
    status_filter: statusFilter ?? undefined,
    page_limit: pageLimit,
    page_offset: pageOffset,
    locale,
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
  /** Locale resolved name per supported locale, falling back to the English name (AC-2). */
  namesByLocale: Record<Locale, string>;
}

/**
 * One direct query joining recipes to recipe_translations, rather than
 * fetch_recipe_detail per recipe per locale: sitemap generation reads every
 * recipe in every locale at once, not one recipe for one caller (spec 0020).
 */
export async function listAllRecipesForSitemap(
  client: SupabaseClient<Database>,
): Promise<RecipeSitemapEntry[]> {
  const { data, error } = await client
    .from("recipes")
    .select("id, name, recipe_translations ( locale, name )")
    .is("deleted_at", null);

  if (error) {
    throw error;
  }

  return (data ?? []).map((row) => {
    const namesByLocale = Object.fromEntries(
      SUPPORTED_LOCALES.map((locale) => [locale, row.name]),
    ) as Record<Locale, string>;

    for (const translation of row.recipe_translations) {
      if (translation.locale !== DEFAULT_LOCALE) {
        namesByLocale[translation.locale as Locale] = translation.name;
      }
    }

    return { id: row.id, namesByLocale };
  });
}

export interface RecipeIngredientDetail {
  ingredientId: string;
  name: string;
  measure: string | null;
  sortOrder: number;
  /** Null when `measure` could not be parsed into a number + recognized unit (AC-3). */
  amountValue: number | null;
  amountUnit: RecognizedUnit | null;
  /** Null until the ingredient is Haiku classified (spec 0022, AC-4, AC-9). */
  category: IngredientCategory | null;
  /** Always on hand (Ice, Water): no pantry or shopping list buttons (spec 0036, AC-10). */
  isStaple: boolean;
}

export interface RecipeDetail {
  id: string;
  name: string;
  instructions: string;
  imageUrl: string | null;
  alcoholicStatus: string;
  glass: string | null;
  ingredients: RecipeIngredientDetail[];
  /**
   * Flavor profile: the recipe's taste tags (tags.kind = 'taste'), already
   * localized and sorted by the RPC. Empty until classify-recipes has run.
   */
  flavorProfile: string[];
  isFavorited: boolean;
  /** Imported from TheCocktailDB (not custom or admin): show its credit (spec 0041 AC-14). */
  isCocktailDbRecipe: boolean;
}

interface RecipeDetailIngredientRow {
  ingredient_id: string;
  name: string;
  measure: string | null;
  sort_order: number;
  amount_value: number | null;
  amount_unit: string | null;
  category: IngredientCategory | null;
  is_staple?: boolean;
}

export async function fetchRecipeDetail(
  client: SupabaseClient<Database>,
  id: string,
  locale: Locale = DEFAULT_LOCALE,
): Promise<RecipeDetail | null> {
  const { data, error } = await client
    .rpc("fetch_recipe_detail", { p_id: id, p_locale: locale })
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data) {
    return null;
  }

  const ingredients = ((data.ingredients as RecipeDetailIngredientRow[] | null) ?? [])
    .map((ri) => ({
      ingredientId: ri.ingredient_id,
      name: ri.name,
      measure: ri.measure,
      sortOrder: ri.sort_order,
      amountValue: ri.amount_value,
      amountUnit: toRecognizedUnit(ri.amount_unit),
      category: ri.category,
      isStaple: ri.is_staple ?? false,
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
    flavorProfile: data.taste_tags ?? [],
    isFavorited: data.is_favorited,
    isCocktailDbRecipe: data.is_cocktaildb_recipe,
  };
}

export async function fetchRecipesByIds(
  client: SupabaseClient<Database>,
  ids: string[],
  locale: Locale = DEFAULT_LOCALE,
): Promise<RecipeSearchResult[]> {
  if (ids.length === 0) {
    return [];
  }

  const { data, error } = await client.rpc("fetch_recipes_by_ids", {
    p_ids: ids,
    p_locale: locale,
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

export type FetchRecipeRedirectResult =
  | { data: string | null; error: null }
  | { data: null; error: { reason: "request_failed"; message: string } };

/**
 * The kept recipe's id when `recipeId` is a hidden duplicate (spec 0036,
 * AC-2), else null. One hop: callers never follow the result again.
 */
export async function fetchRecipeRedirect(
  client: SupabaseClient<Database>,
  recipeId: string,
): Promise<FetchRecipeRedirectResult> {
  const { data, error } = await client.rpc("resolve_recipe_redirect", {
    p_recipe_id: recipeId,
  });

  if (error) {
    return { data: null, error: { reason: "request_failed", message: error.message } };
  }

  return { data: data ?? null, error: null };
}
