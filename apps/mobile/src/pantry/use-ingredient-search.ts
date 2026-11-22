import { useQuery } from "@tanstack/react-query";
import { searchIngredients, type Locale } from "@bartendingapp/shared";
import { useActiveLocale } from "@/i18n";
import { supabase } from "@/lib/supabase";
import { useMocktailsQuery } from "@/mocktails/mocktails-context";

// Spec 0063 AC-5, AC-7: the mode is part of the key.
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
  const locale = useActiveLocale();
  const { mocktailsOnly, ready } = useMocktailsQuery();

  return useQuery({
    queryKey: ingredientSearchQueryKey(query, locale, includeStaples, mocktailsOnly),
    queryFn: () =>
      searchIngredients(supabase, query, 20, locale, { includeStaples, mocktailsOnly }),
    enabled: ready,
  });
}
