"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocale } from "next-intl";
import {
  CLASSICS_ROW_SIZE,
  fetchClassicRecipes,
  fetchPopularByRegion,
  fetchRecipeRecommendations,
  fetchRecipesByIds,
  listPopularRegions,
  RECOMMENDATIONS_PAGE_SIZE,
  type Locale,
} from "@bartendingapp/shared";
import { supabase } from "@/lib/supabase";
import { getRecentlyViewedRecipeIds } from "@/recipes/recently-viewed-storage";
import { useMocktailsQuery } from "@/mocktails/use-mocktails-query";

export function useHomeRecommendations() {
  const [recentRecipeIds] = useState<string[]>(() => getRecentlyViewedRecipeIds());
  const locale = useLocale() as Locale;
  const { mocktailsOnly, ready } = useMocktailsQuery();

  return useQuery({
    queryKey: ["home", "recommendations", recentRecipeIds, locale, { mocktailsOnly }] as const,
    queryFn: () =>
      fetchRecipeRecommendations(supabase, {
        recentRecipeIds,
        pageLimit: RECOMMENDATIONS_PAGE_SIZE,
        locale,
        mocktailsOnly,
      }),
    enabled: ready,
  });
}

export function useHomeRecentlyViewed() {
  const [ids] = useState<string[]>(() => getRecentlyViewedRecipeIds());
  const locale = useLocale() as Locale;
  const { mocktailsOnly, ready } = useMocktailsQuery();

  return useQuery({
    queryKey: ["home", "recentlyViewed", ids, locale, { mocktailsOnly }] as const,
    queryFn: () => fetchRecipesByIds(supabase, ids, locale, { mocktailsOnly }),
    enabled: ids.length > 0 && ready,
  });
}

export function useHomePopularRegions() {
  const { mocktailsOnly, ready } = useMocktailsQuery();

  return useQuery({
    queryKey: ["home", "popularRegions", { mocktailsOnly }] as const,
    queryFn: () => listPopularRegions(supabase, { mocktailsOnly }),
    enabled: ready,
  });
}

export function useHomePopularByRegion(region: string | null) {
  const locale = useLocale() as Locale;
  const { mocktailsOnly, ready } = useMocktailsQuery();

  return useQuery({
    queryKey: ["home", "popularByRegion", region, locale, { mocktailsOnly }] as const,
    queryFn: () => fetchPopularByRegion(supabase, region as string, locale, { mocktailsOnly }),
    enabled: region !== null && ready,
  });
}

const CLASSICS_STALE_TIME_MS = 10 * 60 * 1000;

// Spec 0038 AC-4: mounted only once recommendations succeeded empty, so the
// query is sent only then. Fame only changes on a tagging run, so a long
// staleTime.
export function useHomeClassics() {
  const locale = useLocale() as Locale;
  const { mocktailsOnly, ready } = useMocktailsQuery();

  return useQuery({
    queryKey: ["classic-recipes", locale, { mocktailsOnly }] as const,
    queryFn: () =>
      fetchClassicRecipes(supabase, { locale, limit: CLASSICS_ROW_SIZE, mocktailsOnly }),
    staleTime: CLASSICS_STALE_TIME_MS,
    enabled: ready,
  });
}
