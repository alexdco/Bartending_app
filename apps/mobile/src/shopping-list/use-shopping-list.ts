import { useQuery } from "@tanstack/react-query";
import { fetchShoppingListItems, type Locale } from "@bartendingapp/shared";
import { useActiveLocale } from "@/i18n";
import { supabase } from "@/lib/supabase";

export const shoppingListQueryKeyPrefix = ["shopping-list"] as const;

export function shoppingListQueryKey(locale: Locale) {
  return [...shoppingListQueryKeyPrefix, locale] as const;
}

export function useShoppingList() {
  const locale = useActiveLocale();

  return useQuery({
    queryKey: shoppingListQueryKey(locale),
    queryFn: () => fetchShoppingListItems(supabase, locale),
  });
}
