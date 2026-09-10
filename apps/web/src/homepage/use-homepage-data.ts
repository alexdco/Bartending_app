"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  fetchPopularByRegion,
  fetchRecipeRecommendations,
  fetchRecipesByIds,
  listPopularRegions,
  RECOMMENDATIONS_PAGE_SIZE,
} from "@bartendingapp/shared";
import { supabase } from "@/lib/supabase";
import { getRecentlyViewedRecipeIds } from "@/recipes/recently-viewed-storage";

export function useHomeRecommendations() {
  const [recentRecipeIds] = useState<string[]>(() => getRecentlyViewedRecipeIds());

  return useQuery({
    queryKey: ["home", "recommendations", recentRecipeIds] as const,
    queryFn: () =>
      fetchRecipeRecommendations(supabase, {
        recentRecipeIds,
        pageLimit: RECOMMENDATIONS_PAGE_SIZE,
      }),
  });
}

export function useHomeRecentlyViewed() {
  const [ids] = useState<string[]>(() => getRecentlyViewedRecipeIds());

  return useQuery({
    queryKey: ["home", "recentlyViewed", ids] as const,
    queryFn: () => fetchRecipesByIds(supabase, ids),
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
  return useQuery({
    queryKey: ["home", "popularByRegion", region] as const,
    queryFn: () => fetchPopularByRegion(supabase, region as string),
    enabled: region !== null,
  });
}
