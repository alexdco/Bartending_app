import { useInfiniteQuery } from "@tanstack/react-query";
import {
  RECIPE_SEARCH_PAGE_SIZE,
  searchRecipes,
  type AlcoholicStatusFilter,
  type Locale,
  type SearchSort,
} from "@bartendingapp/shared";
import { useActiveLocale } from "@/i18n";
import { supabase } from "@/lib/supabase";
import { useMocktailsQuery } from "@/mocktails/mocktails-context";

export interface UseRecipeSearchParams {
  query: string;
  statusFilter: AlcoholicStatusFilter | null;
  sort: SearchSort;
}

export function recipeSearchQueryKey(
  query: string,
  statusFilter: AlcoholicStatusFilter | null,
  locale: Locale,
  sort: SearchSort,
  mocktailsOnly: boolean,
) {
  // Spec 0063 AC-5: the mode is part of the key.
  return ["recipes", "search", { query, statusFilter, locale, sort, mocktailsOnly }] as const;
}

export function useRecipeSearch({ query, statusFilter, sort }: UseRecipeSearchParams) {
  const locale = useActiveLocale();
  const { mocktailsOnly, ready } = useMocktailsQuery();
  // In the mode the status filter is ignored, whatever state holds (AC-5).
  const effectiveStatus = mocktailsOnly ? null : statusFilter;

  return useInfiniteQuery({
    queryKey: recipeSearchQueryKey(query, effectiveStatus, locale, sort, mocktailsOnly),
    queryFn: ({ pageParam }) =>
      searchRecipes(supabase, {
        query,
        statusFilter: effectiveStatus,
        pageLimit: RECIPE_SEARCH_PAGE_SIZE,
        pageOffset: pageParam,
        locale,
        sort,
        mocktailsOnly,
      }),
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) =>
      lastPage.length < RECIPE_SEARCH_PAGE_SIZE
        ? undefined
        : allPages.length * RECIPE_SEARCH_PAGE_SIZE,
    enabled: ready,
  });
}
