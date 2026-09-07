"use client";

import { useInfiniteQuery } from "@tanstack/react-query";
import {
  RECIPE_SEARCH_PAGE_SIZE,
  searchRecipes,
  type AlcoholicStatusFilter,
  type RecipeSearchResult,
} from "@bartendingapp/shared";
import { supabase } from "@/lib/supabase";

export interface UseRecipeSearchParams {
  query: string;
  statusFilter: AlcoholicStatusFilter | null;
  initialData?: RecipeSearchResult[];
}

export function recipeSearchQueryKey(query: string, statusFilter: AlcoholicStatusFilter | null) {
  return ["recipes", "search", { query, statusFilter }] as const;
}

export function useRecipeSearch({ query, statusFilter, initialData }: UseRecipeSearchParams) {
  return useInfiniteQuery({
    queryKey: recipeSearchQueryKey(query, statusFilter),
    queryFn: ({ pageParam }) =>
      searchRecipes(supabase, {
        query,
        statusFilter,
        pageLimit: RECIPE_SEARCH_PAGE_SIZE,
        pageOffset: pageParam,
      }),
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) =>
      lastPage.length < RECIPE_SEARCH_PAGE_SIZE
        ? undefined
        : allPages.length * RECIPE_SEARCH_PAGE_SIZE,
    initialData: initialData !== undefined ? { pages: [initialData], pageParams: [0] } : undefined,
  });
}
