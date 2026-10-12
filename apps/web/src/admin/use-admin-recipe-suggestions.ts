"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchAdminGlassNames, fetchAdminTagNames, searchIngredients } from "@bartendingapp/shared";
import { supabase } from "@/lib/supabase";

const INGREDIENT_SUGGESTION_LIMIT = 10;
const INGREDIENT_SEARCH_DEBOUNCE_MS = 250;

export function adminIngredientSuggestionsQueryKey(query: string) {
  return ["ingredients", "admin-suggestions", query] as const;
}

export const adminGlassNamesQueryKey = ["recipes", "admin-glass-names"] as const;

export const adminTagNamesQueryKey = ["tags", "admin-names"] as const;

function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timeout = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timeout);
  }, [value, delayMs]);

  return debounced;
}

/**
 * Existing ingredient names matching what the admin is typing. Always the
 * canonical English name (locale "en"), since admin_upsert_recipe resolves
 * ingredients by normalized canonical name; picking a translated name would
 * create a duplicate ingredient instead of reusing the existing one.
 */
export function useAdminIngredientSuggestions(query: string) {
  const debouncedQuery = useDebouncedValue(query.trim(), INGREDIENT_SEARCH_DEBOUNCE_MS);

  return useQuery({
    queryKey: adminIngredientSuggestionsQueryKey(debouncedQuery),
    queryFn: () =>
      searchIngredients(supabase, debouncedQuery, INGREDIENT_SUGGESTION_LIMIT, "en", {
        includeStaples: true,
      }),
    enabled: debouncedQuery.length >= 2,
    staleTime: 5 * 60 * 1000,
  });
}

export function useAdminGlassNames() {
  return useQuery({
    queryKey: adminGlassNamesQueryKey,
    queryFn: () => fetchAdminGlassNames(supabase),
    staleTime: 5 * 60 * 1000,
  });
}

export function useAdminTagNames() {
  return useQuery({
    queryKey: adminTagNamesQueryKey,
    queryFn: () => fetchAdminTagNames(supabase),
    staleTime: 5 * 60 * 1000,
  });
}
