"use client";

import { useInfiniteQuery } from "@tanstack/react-query";
import { useLocale } from "next-intl";
import {
  RECIPE_SEARCH_PAGE_SIZE,
  searchRecipes,
  type AlcoholicStatusFilter,
  type Locale,
  type RecipeSearchResult,
  type SearchSort,
} from "@bartendingapp/shared";
import { supabase } from "@/lib/supabase";

export interface UseRecipeSearchParams {
  query: string;
  statusFilter: AlcoholicStatusFilter | null;
  sort: SearchSort;
  /** Mocktails only mode (spec 0063 AC-5). Part of the query key. */
  mocktailsOnly: boolean;
  /** False while the mode is unknown, so no unflagged list is fetched (AC-19). */
  enabled: boolean;
  initialData?: RecipeSearchResult[];
}

export function recipeSearchQueryKey(
  query: string,
  statusFilter: AlcoholicStatusFilter | null,
  locale: Locale,
  sort: SearchSort,
  mocktailsOnly: boolean,
) {
  return ["recipes", "search", { query, statusFilter, locale, sort, mocktailsOnly }] as const;
}

export function useRecipeSearch({
  query,
  statusFilter,
  sort,
  mocktailsOnly,
  enabled,
  initialData,
}: UseRecipeSearchParams) {
  const locale = useLocale() as Locale;

  return useInfiniteQuery({
    queryKey: recipeSearchQueryKey(query, statusFilter, locale, sort, mocktailsOnly),
    queryFn: ({ pageParam }) =>
      searchRecipes(supabase, {
        query,
        statusFilter,
        pageLimit: RECIPE_SEARCH_PAGE_SIZE,
        pageOffset: pageParam,
        locale,
        sort,
        mocktailsOnly,
      }),
    enabled,
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) =>
      lastPage.length < RECIPE_SEARCH_PAGE_SIZE
        ? undefined
        : allPages.length * RECIPE_SEARCH_PAGE_SIZE,
    initialData: initialData !== undefined ? { pages: [initialData], pageParams: [0] } : undefined,
  });
}
