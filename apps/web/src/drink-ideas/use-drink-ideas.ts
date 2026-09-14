"use client";

import { useInfiniteQuery } from "@tanstack/react-query";
import { useLocale } from "next-intl";
import { DRINK_IDEAS_PAGE_SIZE, fetchDrinkIdeaMatches, type Locale } from "@bartendingapp/shared";
import { supabase } from "@/lib/supabase";

export const drinkIdeasQueryKeyPrefix = ["drinkIdeas"] as const;

export function drinkIdeasQueryKey(locale: Locale) {
  return [...drinkIdeasQueryKeyPrefix, locale] as const;
}

export function useDrinkIdeas() {
  const locale = useLocale() as Locale;

  return useInfiniteQuery({
    queryKey: drinkIdeasQueryKey(locale),
    queryFn: ({ pageParam }) =>
      fetchDrinkIdeaMatches(supabase, {
        pageLimit: DRINK_IDEAS_PAGE_SIZE,
        pageOffset: pageParam,
        locale,
      }),
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) =>
      lastPage.length < DRINK_IDEAS_PAGE_SIZE ? undefined : allPages.length * DRINK_IDEAS_PAGE_SIZE,
  });
}
