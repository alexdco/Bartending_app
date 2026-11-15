"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { deleteAdminRecipe, resetAdminRecipeToSource } from "@bartendingapp/shared";
import { supabase } from "@/lib/supabase";

export function useDeleteAdminRecipe() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (recipeId: string) => deleteAdminRecipe(supabase, recipeId),
    onSuccess: (result) => {
      if (result.error === null) {
        queryClient.invalidateQueries({ queryKey: ["recipes"] });
      }
    },
  });
}

/** Spec 0056 AC-6: clears a catalog recipe's lock so the next import takes it back. */
export function useResetAdminRecipe() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (recipeId: string) => resetAdminRecipeToSource(supabase, recipeId),
    onSuccess: (result) => {
      if (result.error === null) {
        queryClient.invalidateQueries({ queryKey: ["recipes"] });
      }
    },
  });
}
