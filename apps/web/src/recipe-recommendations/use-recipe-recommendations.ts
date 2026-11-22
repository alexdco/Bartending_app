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
import { useMocktailsQuery } from "@/mocktails/use-mocktails-query";

export function recommendationsQueryKey(
  currentRecipeId: string,
  recentRecipeIds: string[],
  pageOffset: number,
  locale: Locale,
  mocktailsOnly: boolean,
) {
  return [
    "recommendations",
    currentRecipeId,
    recentRecipeIds,
    pageOffset,
    locale,
    { mocktailsOnly },
  ] as const;
}

export function useRecordRecentlyViewedRecipe(recipeId: string) {
  useEffect(() => {
    recordRecentlyViewedRecipe(recipeId);
  }, [recipeId]);
}

export function useRecipeRecommendations(currentRecipeId: string, pageOffset = 0) {
  const [recentRecipeIds] = useState(() => getRecentlyViewedRecipeIds());
  const locale = useLocale() as Locale;
  // Spec 0063 AC-5: more like this and recommendations hold only safe recipes.
  const { mocktailsOnly, ready } = useMocktailsQuery();

  return useQuery({
    queryKey: recommendationsQueryKey(
      currentRecipeId,
      recentRecipeIds,
      pageOffset,
      locale,
      mocktailsOnly,
    ),
    queryFn: () =>
      fetchRecipeRecommendations(supabase, {
        currentRecipeId,
        recentRecipeIds,
        pageLimit: RECOMMENDATIONS_PAGE_SIZE,
        pageOffset,
        locale,
        mocktailsOnly,
      }),
    enabled: ready,
  });
}
