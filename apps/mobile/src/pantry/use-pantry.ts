import { useQuery } from "@tanstack/react-query";
import { fetchPantryItems, type Locale } from "@bartendingapp/shared";
import { useActiveLocale } from "@/i18n";
import { supabase } from "@/lib/supabase";

export const pantryQueryKeyPrefix = ["pantry"] as const;

export function pantryQueryKey(locale: Locale) {
  return [...pantryQueryKeyPrefix, locale] as const;
}

export function usePantry() {
  const locale = useActiveLocale();

  return useQuery({
    queryKey: pantryQueryKey(locale),
    queryFn: () => fetchPantryItems(supabase, locale),
  });
}
