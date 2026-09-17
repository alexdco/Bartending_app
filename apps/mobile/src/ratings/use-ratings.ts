import { useQuery } from "@tanstack/react-query";
import { fetchMyRating, fetchRatingSummary } from "@bartendingapp/shared";
import { supabase } from "@/lib/supabase";

export function myRatingQueryKey(recipeId: string) {
  return ["ratings", "mine", recipeId] as const;
}

export function ratingSummaryQueryKey(recipeId: string) {
  return ["ratings", "summary", recipeId] as const;
}

export function useMyRating(recipeId: string, enabled: boolean) {
  return useQuery({
    queryKey: myRatingQueryKey(recipeId),
    queryFn: () => fetchMyRating(supabase, recipeId),
    enabled,
  });
}

export function useRatingSummary(recipeId: string) {
  return useQuery({
    queryKey: ratingSummaryQueryKey(recipeId),
    queryFn: () => fetchRatingSummary(supabase, recipeId),
  });
}
