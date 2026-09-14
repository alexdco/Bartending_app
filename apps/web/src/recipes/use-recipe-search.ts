"use client";

import { useInfiniteQuery } from "@tanstack/react-query";
import { useLocale } from "next-intl";
import {
  RECIPE_SEARCH_PAGE_SIZE,
  searchRecipes,
  type AlcoholicStatusFilter,
  type Locale,
  type RecipeSearchResult,
} from "@bartendingapp/shared";
import { supabase } from "@/lib/supabase";

export interface UseRecipeSearchParams {
  query: string;
  statusFilter: AlcoholicStatusFilter | null;
  initialData?: RecipeSearchResult[];
}

export function recipeSearchQueryKey(
  query: string,
  statusFilter: AlcoholicStatusFilter | null,
  locale: Locale,
) {
  return ["recipes", "search", { query, statusFilter, locale }] as const;
}

export function useRecipeSearch({ query, statusFilter, initialData }: UseRecipeSearchParams) {
  const locale = useLocale() as Locale;

  return useInfiniteQuery({
    queryKey: recipeSearchQueryKey(query, statusFilter, locale),
    queryFn: ({ pageParam }) =>
      searchRecipes(supabase, {
        query,
        statusFilter,
        pageLimit: RECIPE_SEARCH_PAGE_SIZE,
        pageOffset: pageParam,
        locale,
      }),
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) =>
      lastPage.length < RECIPE_SEARCH_PAGE_SIZE
        ? undefined
        : allPages.length * RECIPE_SEARCH_PAGE_SIZE,
    initialData: initialData !== undefined ? { pages: [initialData], pageParams: [0] } : undefined,
  });
}
