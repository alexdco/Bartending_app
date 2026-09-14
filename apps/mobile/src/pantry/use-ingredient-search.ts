import { useQuery } from "@tanstack/react-query";
import { searchIngredients, type Locale } from "@bartendingapp/shared";
import { useActiveLocale } from "@/i18n";
import { supabase } from "@/lib/supabase";

export function ingredientSearchQueryKey(query: string, locale: Locale) {
  return ["ingredients", "search", query, locale] as const;
}

export function useIngredientSearch(query: string) {
  const locale = useActiveLocale();

  return useQuery({
    queryKey: ingredientSearchQueryKey(query, locale),
    queryFn: () => searchIngredients(supabase, query, 20, locale),
  });
}
