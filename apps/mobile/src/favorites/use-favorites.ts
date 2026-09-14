import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import {
  FAVORITES_PAGE_SIZE,
  fetchFavoriteRecipeIds,
  fetchFavoriteRecipes,
  type Locale,
} from "@bartendingapp/shared";
import { useActiveLocale } from "@/i18n";
import { supabase } from "@/lib/supabase";

export const favoriteRecipeIdsQueryKey = ["favorites", "ids"] as const;

export function favoriteRecipesQueryKey(locale: Locale) {
  return ["favorites", "list", locale] as const;
}

export function useFavoriteRecipeIds() {
  return useQuery({
    queryKey: favoriteRecipeIdsQueryKey,
    queryFn: () => fetchFavoriteRecipeIds(supabase),
  });
}

export function useFavoriteRecipes() {
  const locale = useActiveLocale();

  return useInfiniteQuery({
    queryKey: favoriteRecipesQueryKey(locale),
    queryFn: ({ pageParam }) =>
      fetchFavoriteRecipes(supabase, {
        pageLimit: FAVORITES_PAGE_SIZE,
        pageOffset: pageParam,
        locale,
      }),
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) =>
      lastPage.length < FAVORITES_PAGE_SIZE ? undefined : allPages.length * FAVORITES_PAGE_SIZE,
  });
}
