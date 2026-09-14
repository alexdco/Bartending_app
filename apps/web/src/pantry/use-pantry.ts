"use client";

import { useQuery } from "@tanstack/react-query";
import { useLocale } from "next-intl";
import { fetchPantryItems, type Locale } from "@bartendingapp/shared";
import { supabase } from "@/lib/supabase";

export const pantryQueryKeyPrefix = ["pantry"] as const;

export function pantryQueryKey(locale: Locale) {
  return [...pantryQueryKeyPrefix, locale] as const;
}

export function usePantry() {
  const locale = useLocale() as Locale;

  return useQuery({
    queryKey: pantryQueryKey(locale),
    queryFn: () => fetchPantryItems(supabase, locale),
  });
}
