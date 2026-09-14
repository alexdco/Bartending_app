"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocale } from "next-intl";
import {
  fetchRecipeRecommendations,
  RECOMMENDATIONS_PAGE_SIZE,
  type Locale,
} from "@bartendingapp/shared";
import { supabase } from "@/lib/supabase";
import {
  getRecentlyViewedRecipeIds,
  recordRecentlyViewedRecipe,
} from "@/recipes/recently-viewed-storage";

export function recommendationsQueryKey(
  currentRecipeId: string,
  recentRecipeIds: string[],
  pageOffset: number,
  locale: Locale,
) {
  return ["recommendations", currentRecipeId, recentRecipeIds, pageOffset, locale] as const;
}

export function useRecordRecentlyViewedRecipe(recipeId: string) {
  useEffect(() => {
    recordRecentlyViewedRecipe(recipeId);
  }, [recipeId]);
}

export function useRecipeRecommendations(currentRecipeId: string, pageOffset = 0) {
  const [recentRecipeIds] = useState(() => getRecentlyViewedRecipeIds());
  const locale = useLocale() as Locale;

  return useQuery({
    queryKey: recommendationsQueryKey(currentRecipeId, recentRecipeIds, pageOffset, locale),
    queryFn: () =>
      fetchRecipeRecommendations(supabase, {
        currentRecipeId,
        recentRecipeIds,
        pageLimit: RECOMMENDATIONS_PAGE_SIZE,
        pageOffset,
        locale,
      }),
  });
}
