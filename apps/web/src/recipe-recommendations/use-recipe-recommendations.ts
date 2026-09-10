"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchRecipeRecommendations, RECOMMENDATIONS_PAGE_SIZE } from "@bartendingapp/shared";
import { supabase } from "@/lib/supabase";
import {
  getRecentlyViewedRecipeIds,
  recordRecentlyViewedRecipe,
} from "@/recipes/recently-viewed-storage";

export function recommendationsQueryKey(
  currentRecipeId: string,
  recentRecipeIds: string[],
  pageOffset: number,
) {
  return ["recommendations", currentRecipeId, recentRecipeIds, pageOffset] as const;
}

export function useRecordRecentlyViewedRecipe(recipeId: string) {
  useEffect(() => {
    recordRecentlyViewedRecipe(recipeId);
  }, [recipeId]);
}

export function useRecipeRecommendations(currentRecipeId: string, pageOffset = 0) {
  const [recentRecipeIds] = useState(() => getRecentlyViewedRecipeIds());

  return useQuery({
    queryKey: recommendationsQueryKey(currentRecipeId, recentRecipeIds, pageOffset),
    queryFn: () =>
      fetchRecipeRecommendations(supabase, {
        currentRecipeId,
        recentRecipeIds,
        pageLimit: RECOMMENDATIONS_PAGE_SIZE,
        pageOffset,
      }),
  });
}
