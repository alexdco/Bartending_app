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
