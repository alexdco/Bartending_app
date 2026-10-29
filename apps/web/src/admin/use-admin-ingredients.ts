"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  fetchAdminIngredients,
  setIngredientAllergens,
  type AllergenSelection,
} from "@bartendingapp/shared";
import { supabase } from "@/lib/supabase";

const ADMIN_INGREDIENTS_KEY = ["ingredients", "admin-list"] as const;

export function useAdminIngredients(query: string, notReviewedOnly: boolean, page: number) {
  return useQuery({
    queryKey: [...ADMIN_INGREDIENTS_KEY, query, notReviewedOnly, page],
    queryFn: () => fetchAdminIngredients(supabase, { query, notReviewedOnly, page }),
    placeholderData: keepPreviousData,
  });
}

/**
 * Saves one row (spec 0043 AC-11). The list is marked stale without a
 * refetch, so a saved row stays in view (even under the "not reviewed"
 * filter) until the next page change or filter change.
 */
export function useSetIngredientAllergens(ingredientId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (selection: AllergenSelection) =>
      setIngredientAllergens(supabase, ingredientId, selection),
    onSuccess: (result) => {
      if (!result.error) {
        queryClient.invalidateQueries({ queryKey: ADMIN_INGREDIENTS_KEY, refetchType: "none" });
      }
    },
  });
}
