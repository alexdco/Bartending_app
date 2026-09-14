import { useInfiniteQuery } from "@tanstack/react-query";
import {
  RECIPE_SEARCH_PAGE_SIZE,
  searchRecipes,
  type AlcoholicStatusFilter,
  type Locale,
} from "@bartendingapp/shared";
import { useActiveLocale } from "@/i18n";
import { supabase } from "@/lib/supabase";

export interface UseRecipeSearchParams {
  query: string;
  statusFilter: AlcoholicStatusFilter | null;
}

export function recipeSearchQueryKey(
  query: string,
  statusFilter: AlcoholicStatusFilter | null,
  locale: Locale,
) {
  return ["recipes", "search", { query, statusFilter, locale }] as const;
}

export function useRecipeSearch({ query, statusFilter }: UseRecipeSearchParams) {
  const locale = useActiveLocale();

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
  });
}
