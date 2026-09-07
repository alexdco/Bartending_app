"use client";

import { useQuery } from "@tanstack/react-query";
import { searchIngredients } from "@bartendingapp/shared";
import { supabase } from "@/lib/supabase";

export function ingredientSearchQueryKey(query: string) {
  return ["ingredients", "search", query] as const;
}

export function useIngredientSearch(query: string) {
  return useQuery({
    queryKey: ingredientSearchQueryKey(query),
    queryFn: () => searchIngredients(supabase, query),
  });
}
