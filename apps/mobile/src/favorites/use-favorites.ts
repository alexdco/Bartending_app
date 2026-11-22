import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import {
  FAVORITES_PAGE_SIZE,
  fetchFavoriteRecipeIds,
  fetchFavoriteRecipes,
  type Locale,
} from "@bartendingapp/shared";
import { useActiveLocale } from "@/i18n";
import { supabase } from "@/lib/supabase";
import { useMocktailsQuery } from "@/mocktails/mocktails-context";

export const favoriteRecipeIdsQueryKey = ["favorites", "ids"] as const;

// Spec 0063 AC-5: the mode is part of the key.
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
  const locale = useActiveLocale();
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
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) =>
      lastPage.length < FAVORITES_PAGE_SIZE ? undefined : allPages.length * FAVORITES_PAGE_SIZE,
    enabled: ready,
  });
}
