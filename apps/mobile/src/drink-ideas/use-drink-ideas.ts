import { useInfiniteQuery } from "@tanstack/react-query";
import { DRINK_IDEAS_PAGE_SIZE, fetchDrinkIdeaMatches, type Locale } from "@bartendingapp/shared";
import { useActiveLocale } from "@/i18n";
import { supabase } from "@/lib/supabase";
import { useMocktailsQuery } from "@/mocktails/mocktails-context";

export const drinkIdeasQueryKeyPrefix = ["drinkIdeas"] as const;

// Spec 0063 AC-5: the mode is part of the key.
export function drinkIdeasQueryKey(locale: Locale, mocktailsOnly: boolean) {
  return [...drinkIdeasQueryKeyPrefix, locale, { mocktailsOnly }] as const;
}

// Spec 0038 AC-5: the Drink ideas screen enables this only once the pantry
// loaded with at least one item, so an empty pantry sends no match query.
export function useDrinkIdeas({ enabled = true }: { enabled?: boolean } = {}) {
  const locale = useActiveLocale();
  const { mocktailsOnly, ready } = useMocktailsQuery();

  return useInfiniteQuery({
    queryKey: drinkIdeasQueryKey(locale, mocktailsOnly),
    queryFn: ({ pageParam }) =>
      fetchDrinkIdeaMatches(supabase, {
        pageLimit: DRINK_IDEAS_PAGE_SIZE,
        pageOffset: pageParam,
        locale,
        mocktailsOnly,
      }),
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) =>
      lastPage.length < DRINK_IDEAS_PAGE_SIZE ? undefined : allPages.length * DRINK_IDEAS_PAGE_SIZE,
    enabled: enabled && ready,
  });
}
