"use client";

import { useQuery } from "@tanstack/react-query";
import { useLocale } from "next-intl";
import { fetchShoppingListItems, type Locale } from "@bartendingapp/shared";
import { supabase } from "@/lib/supabase";
import { useSession } from "@/auth/use-session";
import { useMocktailsQuery } from "@/mocktails/use-mocktails-query";

export const shoppingListQueryKeyPrefix = ["shopping-list"] as const;

// Spec 0063 AC-5: the mode is part of the key.
export function shoppingListQueryKey(locale: Locale, mocktailsOnly: boolean) {
  return [...shoppingListQueryKeyPrefix, locale, { mocktailsOnly }] as const;
}

// Same session wait as usePantry: shopping list rows are owner scoped.
export function useShoppingList() {
  const locale = useLocale() as Locale;
  const { session } = useSession();
  const { mocktailsOnly, ready } = useMocktailsQuery();

  return useQuery({
    queryKey: shoppingListQueryKey(locale, mocktailsOnly),
    queryFn: () => fetchShoppingListItems(supabase, locale, { mocktailsOnly }),
    enabled: session !== null && ready,
  });
}
