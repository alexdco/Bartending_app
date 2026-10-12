import { useQuery } from "@tanstack/react-query";
import {
  CLASSICS_ROW_SIZE,
  fetchClassicRecipes,
  fetchPopularByRegion,
  fetchRecipeRecommendations,
  fetchRecipesByIds,
  listPopularRegions,
  RECOMMENDATIONS_PAGE_SIZE,
} from "@bartendingapp/shared";
import { useActiveLocale } from "@/i18n";
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
  const locale = useActiveLocale();

  const recommendationsQuery = useQuery({
    queryKey: ["home", "recommendations", recentRecipeIds, locale] as const,
    queryFn: () =>
      fetchRecipeRecommendations(supabase, {
        recentRecipeIds,
        pageLimit: RECOMMENDATIONS_PAGE_SIZE,
        locale,
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
  const locale = useActiveLocale();

  const recipesQuery = useQuery({
    queryKey: ["home", "recentlyViewed", ids, locale] as const,
    queryFn: () => fetchRecipesByIds(supabase, ids, locale),
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
  const locale = useActiveLocale();

  return useQuery({
    queryKey: ["home", "popularByRegion", region, locale] as const,
    queryFn: () => fetchPopularByRegion(supabase, region as string, locale),
    enabled: region !== null,
  });
}

const CLASSICS_STALE_TIME_MS = 10 * 60 * 1000;

// Spec 0038 AC-4: mounted only once recommendations succeeded empty, so the
// query is sent only then. Fame only changes on a tagging run, so a long
// staleTime.
export function useHomeClassics() {
  const locale = useActiveLocale();

  return useQuery({
    queryKey: ["classic-recipes", locale] as const,
    queryFn: () => fetchClassicRecipes(supabase, { locale, limit: CLASSICS_ROW_SIZE }),
    staleTime: CLASSICS_STALE_TIME_MS,
  });
}
