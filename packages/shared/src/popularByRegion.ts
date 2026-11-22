import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";
import { DEFAULT_LOCALE, type Locale } from "./locale";

export interface PopularRecipe {
  id: string;
  name: string;
  /** The English recipes.name, only for slugs (spec 0048 AC-9). */
  baseName: string;
  imageUrl: string | null;
  alcoholicStatus: string;
  popularityRank: number;
}

/** Mocktails only mode (spec 0063): only mocktail safe recipes, filtered in SQL. */
export interface MocktailsOnlyOption {
  mocktailsOnly?: boolean;
}

export async function listPopularRegions(
  client: SupabaseClient<Database>,
  { mocktailsOnly = false }: MocktailsOnlyOption = {},
): Promise<string[]> {
  // Mocktails only mode keeps only regions with a safe recipe (spec 0063 AC-5).
  const { data, error } = mocktailsOnly
    ? await client.rpc("list_popular_regions", { mocktails_only: true })
    : await client.rpc("list_popular_regions");

  if (error) {
    throw error;
  }

  return (data ?? []).map((row) => row.region_name);
}

export async function fetchPopularByRegion(
  client: SupabaseClient<Database>,
  region: string,
  locale: Locale = DEFAULT_LOCALE,
  { mocktailsOnly = false }: MocktailsOnlyOption = {},
): Promise<PopularRecipe[]> {
  const { data, error } = await client.rpc("popular_recipes_by_region", {
    region_filter: region,
    locale,
    // Mocktails only mode (spec 0063); omitted when false (AC-17).
    ...(mocktailsOnly ? { mocktails_only: true } : {}),
  });

  if (error) {
    throw error;
  }

  return (data ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    imageUrl: row.image_url,
    alcoholicStatus: row.alcoholic_status,
    baseName: row.base_name,
    popularityRank: row.popularity_rank,
  }));
}
