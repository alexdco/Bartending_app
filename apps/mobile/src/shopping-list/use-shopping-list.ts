import { useQuery } from "@tanstack/react-query";
import { fetchShoppingListItems, type Locale } from "@bartendingapp/shared";
import { useActiveLocale } from "@/i18n";
import { supabase } from "@/lib/supabase";
import { useSession } from "@/auth/use-session";

export const shoppingListQueryKeyPrefix = ["shopping-list"] as const;

export function shoppingListQueryKey(locale: Locale) {
  return [...shoppingListQueryKeyPrefix, locale] as const;
}

// Same session wait as usePantry: shopping list rows are owner scoped.
export function useShoppingList() {
  const locale = useActiveLocale();
  const { session } = useSession();

  return useQuery({
    queryKey: shoppingListQueryKey(locale),
    queryFn: () => fetchShoppingListItems(supabase, locale),
    enabled: session !== null,
  });
}
