"use client";

import { useQuery } from "@tanstack/react-query";
import { useLocale } from "next-intl";
import { searchIngredients, type Locale } from "@bartendingapp/shared";
import { supabase } from "@/lib/supabase";

export function ingredientSearchQueryKey(query: string, locale: Locale) {
  return ["ingredients", "search", query, locale] as const;
}

export function useIngredientSearch(query: string) {
  const locale = useLocale() as Locale;

  return useQuery({
    queryKey: ingredientSearchQueryKey(query, locale),
    queryFn: () => searchIngredients(supabase, query, 20, locale),
  });
}
