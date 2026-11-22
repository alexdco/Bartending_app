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
import { useMocktailsQuery } from "@/mocktails/mocktails-context";

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
  const { mocktailsOnly, ready } = useMocktailsQuery();

  const recommendationsQuery = useQuery({
    queryKey: ["home", "recommendations", recentRecipeIds, locale, { mocktailsOnly }] as const,
    queryFn: () =>
      fetchRecipeRecommendations(supabase, {
        recentRecipeIds,
        pageLimit: RECOMMENDATIONS_PAGE_SIZE,
        locale,
        mocktailsOnly,
      }),
    enabled: idsQuery.isSuccess && ready,
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
  const { mocktailsOnly, ready } = useMocktailsQuery();

  const recipesQuery = useQuery({
    queryKey: ["home", "recentlyViewed", ids, locale, { mocktailsOnly }] as const,
    queryFn: () => fetchRecipesByIds(supabase, ids, locale, { mocktailsOnly }),
    enabled: idsQuery.isSuccess && ids.length > 0 && ready,
  });

  return {
    ...recipesQuery,
    isPending: idsQuery.isPending || (ids.length > 0 && recipesQuery.isPending),
    error: idsQuery.error ?? recipesQuery.error,
    hasIds: ids.length > 0,
  };
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
  const locale = useActiveLocale();
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
  const locale = useActiveLocale();
  const { mocktailsOnly, ready } = useMocktailsQuery();

  return useQuery({
    queryKey: ["classic-recipes", locale, { mocktailsOnly }] as const,
    queryFn: () =>
      fetchClassicRecipes(supabase, { locale, limit: CLASSICS_ROW_SIZE, mocktailsOnly }),
    enabled: ready,
    staleTime: CLASSICS_STALE_TIME_MS,
  });
}
