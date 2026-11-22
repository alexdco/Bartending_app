"use client";

import { useInfiniteQuery } from "@tanstack/react-query";
import { useLocale } from "next-intl";
import { DRINK_IDEAS_PAGE_SIZE, fetchDrinkIdeaMatches, type Locale } from "@bartendingapp/shared";
import { supabase } from "@/lib/supabase";
import { useMocktailsQuery } from "@/mocktails/use-mocktails-query";

export const drinkIdeasQueryKeyPrefix = ["drinkIdeas"] as const;

export function drinkIdeasQueryKey(locale: Locale, mocktailsOnly: boolean) {
  return [...drinkIdeasQueryKeyPrefix, locale, { mocktailsOnly }] as const;
}

// Spec 0038 AC-5: the page enables this only once the pantry loaded with at
// least one item, so an empty pantry sends no match query.
export function useDrinkIdeas({ enabled = true }: { enabled?: boolean } = {}) {
  const locale = useLocale() as Locale;
  // Spec 0063 AC-5: safe recipes only, matched on visible pantry rows.
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
