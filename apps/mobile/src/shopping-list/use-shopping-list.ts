import { useQuery } from "@tanstack/react-query";
import { fetchShoppingListItems, type Locale } from "@bartendingapp/shared";
import { useActiveLocale } from "@/i18n";
import { supabase } from "@/lib/supabase";
import { useSession } from "@/auth/use-session";
import { useMocktailsQuery } from "@/mocktails/mocktails-context";

export const shoppingListQueryKeyPrefix = ["shopping-list"] as const;

// Spec 0063 AC-5, AC-7: the mode is part of the key, so a full list is never
// shown in mocktails only mode.
export function shoppingListQueryKey(locale: Locale, mocktailsOnly: boolean) {
  return [...shoppingListQueryKeyPrefix, locale, { mocktailsOnly }] as const;
}

// Same session wait as usePantry: shopping list rows are owner scoped.
export function useShoppingList() {
  const locale = useActiveLocale();
  const { session } = useSession();
  const { mocktailsOnly, ready } = useMocktailsQuery();

  return useQuery({
    queryKey: shoppingListQueryKey(locale, mocktailsOnly),
    queryFn: () => fetchShoppingListItems(supabase, locale, { mocktailsOnly }),
    enabled: session !== null && ready,
  });
}
