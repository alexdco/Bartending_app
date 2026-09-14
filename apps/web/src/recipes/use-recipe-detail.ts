"use client";

import { useQuery } from "@tanstack/react-query";
import { useLocale } from "next-intl";
import { fetchRecipeDetail, type Locale } from "@bartendingapp/shared";
import { supabase } from "@/lib/supabase";

export function recipeDetailQueryKey(id: string, locale: Locale) {
  return ["recipes", "detail", id, locale] as const;
}

export function useRecipeDetail(id: string) {
  const locale = useLocale() as Locale;

  return useQuery({
    queryKey: recipeDetailQueryKey(id, locale),
    queryFn: () => fetchRecipeDetail(supabase, id, locale),
  });
}
