"use client";

import { useQuery } from "@tanstack/react-query";
import { useLocale } from "next-intl";
import { fetchPantryItems, type Locale } from "@bartendingapp/shared";
import { supabase } from "@/lib/supabase";
import { useSession } from "@/auth/use-session";
import { useMocktailsQuery } from "@/mocktails/use-mocktails-query";

export const pantryQueryKeyPrefix = ["pantry"] as const;

// Spec 0063 AC-5: the mode is part of the key, so a full pantry is never
// shown in mocktails only mode.
export function pantryQueryKey(locale: Locale, mocktailsOnly: boolean) {
  return [...pantryQueryKeyPrefix, locale, { mocktailsOnly }] as const;
}

// Pantry rows are owner scoped, so the first visit waits for the guest
// session bootstrap (ensureAnonymousSession in Providers) instead of
// querying with no session and only recovering through retries.
export function usePantry() {
  const locale = useLocale() as Locale;
  const { session } = useSession();
  const { mocktailsOnly, ready } = useMocktailsQuery();

  return useQuery({
    queryKey: pantryQueryKey(locale, mocktailsOnly),
    queryFn: () => fetchPantryItems(supabase, locale, { mocktailsOnly }),
    enabled: session !== null && ready,
  });
}
