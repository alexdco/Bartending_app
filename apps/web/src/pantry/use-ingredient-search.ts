"use client";

import { useQuery } from "@tanstack/react-query";
import { useLocale } from "next-intl";
import { searchIngredients, type Locale } from "@bartendingapp/shared";
import { supabase } from "@/lib/supabase";
import { useMocktailsQuery } from "@/mocktails/use-mocktails-query";

export function ingredientSearchQueryKey(
  query: string,
  locale: Locale,
  includeStaples: boolean,
  mocktailsOnly: boolean,
) {
  return ["ingredients", "search", query, locale, includeStaples, { mocktailsOnly }] as const;
}

/**
 * Staples (Ice, Water) are left out by default for the pantry and shopping
 * list; recipe forms pass `includeStaples: true` (spec 0036, AC-10, AC-13).
 */
export function useIngredientSearch(query: string, { includeStaples = false } = {}) {
  const locale = useLocale() as Locale;
  // Spec 0063 AC-7: only mocktail visible ingredients in the mode.
  const { mocktailsOnly, ready } = useMocktailsQuery();

  return useQuery({
    queryKey: ingredientSearchQueryKey(query, locale, includeStaples, mocktailsOnly),
    queryFn: () =>
      searchIngredients(supabase, query, 20, locale, { includeStaples, mocktailsOnly }),
    enabled: ready,
  });
}
