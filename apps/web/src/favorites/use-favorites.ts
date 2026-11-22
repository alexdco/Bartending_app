"use client";

import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { useLocale } from "next-intl";
import {
  FAVORITES_PAGE_SIZE,
  fetchFavoriteRecipeIds,
  fetchFavoriteRecipes,
  type Locale,
} from "@bartendingapp/shared";
import { supabase } from "@/lib/supabase";
import { useMocktailsQuery } from "@/mocktails/use-mocktails-query";

export const favoriteRecipeIdsQueryKey = ["favorites", "ids"] as const;

export function favoriteRecipesQueryKey(locale: Locale, mocktailsOnly: boolean) {
  return ["favorites", "list", locale, { mocktailsOnly }] as const;
}

export function useFavoriteRecipeIds() {
  return useQuery({
    queryKey: favoriteRecipeIdsQueryKey,
    queryFn: () => fetchFavoriteRecipeIds(supabase),
  });
}

export function useFavoriteRecipes() {
  const locale = useLocale() as Locale;
  // Spec 0063 AC-5: unsafe favorites stay stored but are not returned.
  const { mocktailsOnly, ready } = useMocktailsQuery();

  return useInfiniteQuery({
    queryKey: favoriteRecipesQueryKey(locale, mocktailsOnly),
    queryFn: ({ pageParam }) =>
      fetchFavoriteRecipes(supabase, {
        pageLimit: FAVORITES_PAGE_SIZE,
        pageOffset: pageParam,
        locale,
        mocktailsOnly,
      }),
    enabled: ready,
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) =>
      lastPage.length < FAVORITES_PAGE_SIZE ? undefined : allPages.length * FAVORITES_PAGE_SIZE,
  });
}
