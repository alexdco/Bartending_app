"use client";

import { useInfiniteQuery } from "@tanstack/react-query";
import { DRINK_IDEAS_PAGE_SIZE, fetchDrinkIdeaMatches } from "@bartendingapp/shared";
import { supabase } from "@/lib/supabase";

export const drinkIdeasQueryKey = ["drinkIdeas"] as const;

export function useDrinkIdeas() {
  return useInfiniteQuery({
    queryKey: drinkIdeasQueryKey,
    queryFn: ({ pageParam }) =>
      fetchDrinkIdeaMatches(supabase, {
        pageLimit: DRINK_IDEAS_PAGE_SIZE,
        pageOffset: pageParam,
      }),
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) =>
      lastPage.length < DRINK_IDEAS_PAGE_SIZE ? undefined : allPages.length * DRINK_IDEAS_PAGE_SIZE,
  });
}
