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
  initialData?: RecipeSearchResult[];
}

export function recipeSearchQueryKey(
  query: string,
  statusFilter: AlcoholicStatusFilter | null,
  locale: Locale,
  sort: SearchSort,
) {
  return ["recipes", "search", { query, statusFilter, locale, sort }] as const;
}

export function useRecipeSearch({ query, statusFilter, sort, initialData }: UseRecipeSearchParams) {
  const locale = useLocale() as Locale;

  return useInfiniteQuery({
    queryKey: recipeSearchQueryKey(query, statusFilter, locale, sort),
    queryFn: ({ pageParam }) =>
      searchRecipes(supabase, {
        query,
        statusFilter,
        pageLimit: RECIPE_SEARCH_PAGE_SIZE,
        pageOffset: pageParam,
        locale,
        sort,
      }),
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) =>
      lastPage.length < RECIPE_SEARCH_PAGE_SIZE
        ? undefined
        : allPages.length * RECIPE_SEARCH_PAGE_SIZE,
    initialData: initialData !== undefined ? { pages: [initialData], pageParams: [0] } : undefined,
  });
}
