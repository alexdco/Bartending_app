"use client";

import { useQuery } from "@tanstack/react-query";
import { useLocale } from "next-intl";
import { fetchShoppingListItems, type Locale } from "@bartendingapp/shared";
import { supabase } from "@/lib/supabase";

export const shoppingListQueryKeyPrefix = ["shopping-list"] as const;

export function shoppingListQueryKey(locale: Locale) {
  return [...shoppingListQueryKeyPrefix, locale] as const;
}

export function useShoppingList() {
  const locale = useLocale() as Locale;

  return useQuery({
    queryKey: shoppingListQueryKey(locale),
    queryFn: () => fetchShoppingListItems(supabase, locale),
  });
}
