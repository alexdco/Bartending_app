import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";
import { DEFAULT_LOCALE, type Locale } from "./locale";

export interface PopularRecipe {
  id: string;
  name: string;
  imageUrl: string | null;
  alcoholicStatus: string;
  popularityRank: number;
}

export async function listPopularRegions(client: SupabaseClient<Database>): Promise<string[]> {
  const { data, error } = await client.rpc("list_popular_regions");

  if (error) {
    throw error;
  }

  return (data ?? []).map((row) => row.region_name);
}

export async function fetchPopularByRegion(
  client: SupabaseClient<Database>,
  region: string,
  locale: Locale = DEFAULT_LOCALE,
): Promise<PopularRecipe[]> {
  const { data, error } = await client.rpc("popular_recipes_by_region", {
    region_filter: region,
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
    popularityRank: row.popularity_rank,
  }));
}
