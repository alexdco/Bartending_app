import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";
import { DEFAULT_LOCALE, type Locale } from "./locale";
import type { RecipeSearchResult } from "./recipes";

export const HOMEPAGE_CAROUSEL_LIMIT = 10;

// Home "Classics to start with" row size (spec 0038 AC-4).
export const CLASSICS_ROW_SIZE = 10;

const SESSION_ERROR_CODE = "28000";

export function isSessionError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === SESSION_ERROR_CODE
  );
}

// The highest fame live recipes, for the home classics row shown when a
// visitor has no recommendations yet (spec 0038 AC-4). Empty when nothing
// has a fame score.
export async function fetchClassicRecipes(
  client: SupabaseClient<Database>,
  { locale = DEFAULT_LOCALE, limit = CLASSICS_ROW_SIZE }: { locale?: Locale; limit?: number } = {},
): Promise<RecipeSearchResult[]> {
  const { data, error } = await client.rpc("classic_recipes", {
    page_limit: limit,
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
