import { useQuery } from "@tanstack/react-query";
import { fetchPantryItems, type Locale } from "@bartendingapp/shared";
import { useActiveLocale } from "@/i18n";
import { supabase } from "@/lib/supabase";
import { useSession } from "@/auth/use-session";

export const pantryQueryKeyPrefix = ["pantry"] as const;

export function pantryQueryKey(locale: Locale) {
  return [...pantryQueryKeyPrefix, locale] as const;
}

// Pantry rows are owner scoped, so the first visit waits for the guest
// session bootstrap (ensureAnonymousSession in the root layout) instead of
// querying with no session and only recovering through retries.
export function usePantry() {
  const locale = useActiveLocale();
  const { session } = useSession();

  return useQuery({
    queryKey: pantryQueryKey(locale),
    queryFn: () => fetchPantryItems(supabase, locale),
    enabled: session !== null,
  });
}
