"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { deleteAdminRecipe } from "@bartendingapp/shared";
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
