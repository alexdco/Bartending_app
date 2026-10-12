import { useQuery } from "@tanstack/react-query";
import { fetchRecipeRedirect } from "@bartendingapp/shared";
import { supabase } from "@/lib/supabase";

export function recipeRedirectQueryKey(id: string) {
  return ["recipes", "redirect", id] as const;
}

/**
 * The kept recipe's id for a hidden duplicate, else null (spec 0036, AC-2).
 * Only runs once the detail lookup came back empty.
 */
export function useRecipeRedirect(id: string, enabled: boolean) {
  return useQuery({
    queryKey: recipeRedirectQueryKey(id),
    queryFn: async () => {
      const result = await fetchRecipeRedirect(supabase, id);
      if (result.error) {
        throw new Error(result.error.message);
      }
      return result.data;
    },
    enabled,
  });
}
