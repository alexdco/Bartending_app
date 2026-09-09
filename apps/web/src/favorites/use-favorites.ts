"use client";

import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import {
  FAVORITES_PAGE_SIZE,
  fetchFavoriteRecipeIds,
  fetchFavoriteRecipes,
} from "@bartendingapp/shared";
import { supabase } from "@/lib/supabase";

export const favoriteRecipeIdsQueryKey = ["favorites", "ids"] as const;
export const favoriteRecipesQueryKey = ["favorites", "list"] as const;

export function useFavoriteRecipeIds() {
  return useQuery({
    queryKey: favoriteRecipeIdsQueryKey,
    queryFn: () => fetchFavoriteRecipeIds(supabase),
  });
}

export function useFavoriteRecipes() {
  return useInfiniteQuery({
    queryKey: favoriteRecipesQueryKey,
    queryFn: ({ pageParam }) =>
      fetchFavoriteRecipes(supabase, {
        pageLimit: FAVORITES_PAGE_SIZE,
        pageOffset: pageParam,
      }),
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) =>
      lastPage.length < FAVORITES_PAGE_SIZE ? undefined : allPages.length * FAVORITES_PAGE_SIZE,
  });
}
