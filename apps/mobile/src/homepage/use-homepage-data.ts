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

const recentlyViewedIdsQueryKey = ["home", "recentlyViewedIds"] as const;

function useRecentlyViewedIds() {
  return useQuery({
    queryKey: recentlyViewedIdsQueryKey,
    queryFn: getRecentlyViewedRecipeIds,
  });
}

export function useHomeRecommendations() {
  const idsQuery = useRecentlyViewedIds();
  const recentRecipeIds = idsQuery.data ?? [];

  const recommendationsQuery = useQuery({
    queryKey: ["home", "recommendations", recentRecipeIds] as const,
    queryFn: () =>
      fetchRecipeRecommendations(supabase, {
        recentRecipeIds,
        pageLimit: RECOMMENDATIONS_PAGE_SIZE,
      }),
    enabled: idsQuery.isSuccess,
  });

  return {
    ...recommendationsQuery,
    isPending: idsQuery.isPending || recommendationsQuery.isPending,
    error: idsQuery.error ?? recommendationsQuery.error,
  };
}

export function useHomeRecentlyViewed() {
  const idsQuery = useRecentlyViewedIds();
  const ids = idsQuery.data ?? [];

  const recipesQuery = useQuery({
    queryKey: ["home", "recentlyViewed", ids] as const,
    queryFn: () => fetchRecipesByIds(supabase, ids),
    enabled: idsQuery.isSuccess && ids.length > 0,
  });

  return {
    ...recipesQuery,
    isPending: idsQuery.isPending || (ids.length > 0 && recipesQuery.isPending),
    error: idsQuery.error ?? recipesQuery.error,
    hasIds: ids.length > 0,
  };
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
