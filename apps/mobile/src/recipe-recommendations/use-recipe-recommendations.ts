import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  fetchRecipeRecommendations,
  RECOMMENDATIONS_PAGE_SIZE,
  type Locale,
} from "@bartendingapp/shared";
import { useActiveLocale } from "@/i18n";
import { supabase } from "@/lib/supabase";
import {
  getRecentlyViewedRecipeIds,
  recordRecentlyViewedRecipe,
} from "@/recipes/recently-viewed-storage";

const recentlyViewedRecipeIdsQueryKey = ["recentlyViewedRecipeIds"] as const;

export function recommendationsQueryKey(
  currentRecipeId: string,
  recentRecipeIds: string[],
  pageOffset: number,
  locale: Locale,
) {
  return ["recommendations", currentRecipeId, recentRecipeIds, pageOffset, locale] as const;
}

export function useRecordRecentlyViewedRecipe(recipeId: string) {
  const queryClient = useQueryClient();

  useEffect(() => {
    recordRecentlyViewedRecipe(recipeId).then(() => {
      queryClient.invalidateQueries({ queryKey: recentlyViewedRecipeIdsQueryKey });
    });
  }, [recipeId, queryClient]);
}

function useRecentlyViewedRecipeIds() {
  return useQuery({
    queryKey: recentlyViewedRecipeIdsQueryKey,
    queryFn: getRecentlyViewedRecipeIds,
  });
}

export function useRecipeRecommendations(currentRecipeId: string, pageOffset = 0) {
  const recentRecipeIdsQuery = useRecentlyViewedRecipeIds();
  const recentRecipeIds = recentRecipeIdsQuery.data ?? [];
  const locale = useActiveLocale();

  const recommendationsQuery = useQuery({
    queryKey: recommendationsQueryKey(currentRecipeId, recentRecipeIds, pageOffset, locale),
    queryFn: () =>
      fetchRecipeRecommendations(supabase, {
        currentRecipeId,
        recentRecipeIds,
        pageLimit: RECOMMENDATIONS_PAGE_SIZE,
        pageOffset,
        locale,
      }),
    enabled: recentRecipeIdsQuery.isSuccess,
  });

  return {
    ...recommendationsQuery,
    isPending: recentRecipeIdsQuery.isPending || recommendationsQuery.isPending,
    error: recentRecipeIdsQuery.error ?? recommendationsQuery.error,
  };
}
