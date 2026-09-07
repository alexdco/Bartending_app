import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

export interface MissingIngredient {
  id: string;
  name: string;
}

export interface DrinkIdeaMatch {
  id: string;
  name: string;
  imageUrl: string | null;
  alcoholicStatus: string;
  missingRatio: number;
  missingIngredients: MissingIngredient[];
}

export interface DrinkIdeaMatchParams {
  maxRatio?: number;
  pageLimit?: number;
  pageOffset?: number;
}

export const DRINK_IDEAS_PAGE_SIZE = 20;
export const DRINK_IDEAS_MAX_RATIO = 0.25;

export async function fetchDrinkIdeaMatches(
  client: SupabaseClient<Database>,
  {
    maxRatio = DRINK_IDEAS_MAX_RATIO,
    pageLimit = DRINK_IDEAS_PAGE_SIZE,
    pageOffset = 0,
  }: DrinkIdeaMatchParams = {},
): Promise<DrinkIdeaMatch[]> {
  const { data, error } = await client.rpc("match_recipes_to_pantry", {
    max_ratio: maxRatio,
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
    missingRatio: row.missing_ratio,
    missingIngredients: (row.missing_ingredients as MissingIngredient[] | null) ?? [],
  }));
}

const MISSING_INGREDIENTS_DISPLAY_CAP = 3;

export function formatMissingIngredients(names: string[]): string {
  if (names.length <= MISSING_INGREDIENTS_DISPLAY_CAP) {
    return names.join(", ");
  }

  const shown = names.slice(0, MISSING_INGREDIENTS_DISPLAY_CAP);
  const remaining = names.length - MISSING_INGREDIENTS_DISPLAY_CAP;
  return `${shown.join(", ")} +${remaining} more`;
}
