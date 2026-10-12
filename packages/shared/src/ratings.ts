import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

export type RatingScore = 1 | 2 | 3 | 4 | 5;

export function isValidRatingScore(value: number): value is RatingScore {
  return Number.isInteger(value) && value >= 1 && value <= 5;
}

export interface RatingSummary {
  average: number | null;
  count: number;
}

// One decimal, in the caller's locale (spec 0038 AC-7): "4.2" in en, "4,2" in es.
export const RATING_AVERAGE_FORMAT = {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
} as const;

export type RatingDisplay =
  | { readonly kind: "none" }
  | { readonly kind: "rated"; readonly average: string; readonly count: number };

// Decides how the rating summary reads (spec 0038 AC-7): zero ratings show
// no display stars, only the "no ratings yet" copy; otherwise stars plus the
// locale formatted average and count. `formatAverage` is the app's locale
// number formatter applied with RATING_AVERAGE_FORMAT.
export function ratingDisplay(
  summary: RatingSummary | undefined,
  formatAverage: (average: number) => string,
): RatingDisplay {
  if (!summary || summary.count === 0 || summary.average === null) {
    return { kind: "none" };
  }
  return { kind: "rated", average: formatAverage(summary.average), count: summary.count };
}

export async function fetchRatingSummary(
  client: SupabaseClient<Database>,
  recipeId: string,
): Promise<RatingSummary> {
  const { data, error } = await client
    .rpc("recipe_rating_summary", { p_recipe_id: recipeId })
    .single();

  if (error) {
    throw error;
  }

  return { average: data?.average ?? null, count: data?.count ?? 0 };
}

export async function fetchMyRating(
  client: SupabaseClient<Database>,
  recipeId: string,
): Promise<RatingScore | null> {
  const { data, error } = await client
    .from("ratings")
    .select("score")
    .eq("recipe_id", recipeId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return (data?.score as RatingScore | undefined) ?? null;
}

export async function submitRating(
  client: SupabaseClient<Database>,
  recipeId: string,
  score: RatingScore,
): Promise<void> {
  if (!isValidRatingScore(score)) {
    throw new Error("Rating score must be an integer between 1 and 5.");
  }

  const { data: sessionData, error: sessionError } = await client.auth.getSession();

  if (sessionError) {
    throw sessionError;
  }

  const userId = sessionData.session?.user.id;

  if (!userId) {
    throw new Error("No active session; cannot submit a rating.");
  }

  const { error } = await client
    .from("ratings")
    .upsert({ user_id: userId, recipe_id: recipeId, score }, { onConflict: "user_id,recipe_id" });

  if (error) {
    throw error;
  }
}
