"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchRecipeDetail } from "@bartendingapp/shared";
import { supabase } from "@/lib/supabase";

export function recipeDetailQueryKey(id: string) {
  return ["recipes", "detail", id] as const;
}

export function useRecipeDetail(id: string) {
  return useQuery({
    queryKey: recipeDetailQueryKey(id),
    queryFn: () => fetchRecipeDetail(supabase, id),
  });
}
