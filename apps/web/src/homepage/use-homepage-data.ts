"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocale } from "next-intl";
import {
  fetchPopularByRegion,
  fetchRecipeRecommendations,
  fetchRecipesByIds,
  listPopularRegions,
  RECOMMENDATIONS_PAGE_SIZE,
  type Locale,
} from "@bartendingapp/shared";
import { supabase } from "@/lib/supabase";
import { getRecentlyViewedRecipeIds } from "@/recipes/recently-viewed-storage";

export function useHomeRecommendations() {
  const [recentRecipeIds] = useState<string[]>(() => getRecentlyViewedRecipeIds());
  const locale = useLocale() as Locale;

  return useQuery({
    queryKey: ["home", "recommendations", recentRecipeIds, locale] as const,
    queryFn: () =>
      fetchRecipeRecommendations(supabase, {
        recentRecipeIds,
        pageLimit: RECOMMENDATIONS_PAGE_SIZE,
        locale,
      }),
  });
}

export function useHomeRecentlyViewed() {
  const [ids] = useState<string[]>(() => getRecentlyViewedRecipeIds());
  const locale = useLocale() as Locale;

  return useQuery({
    queryKey: ["home", "recentlyViewed", ids, locale] as const,
    queryFn: () => fetchRecipesByIds(supabase, ids, locale),
    enabled: ids.length > 0,
  });
}

export function useHomePopularRegions() {
  return useQuery({
    queryKey: ["home", "popularRegions"] as const,
    queryFn: () => listPopularRegions(supabase),
  });
}

export function useHomePopularByRegion(region: string | null) {
  const locale = useLocale() as Locale;

  return useQuery({
    queryKey: ["home", "popularByRegion", region, locale] as const,
    queryFn: () => fetchPopularByRegion(supabase, region as string, locale),
    enabled: region !== null,
  });
}
