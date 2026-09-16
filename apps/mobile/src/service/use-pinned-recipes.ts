import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchPinnedRecipes, pinRecipe, reorderPins, unpinRecipe } from "@bartendingapp/shared";
import { supabase } from "@/lib/supabase";

export const pinnedRecipesQueryKey = ["pinned-recipes"] as const;

export function usePinnedRecipes() {
  return useQuery({
    queryKey: pinnedRecipesQueryKey,
    queryFn: () => fetchPinnedRecipes(supabase),
  });
}

export function usePinRecipe() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (target: { recipeId: string } | { barRecipeId: string }) =>
      pinRecipe(supabase, target),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: pinnedRecipesQueryKey });
    },
  });
}

export function useUnpinRecipe() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (pinId: string) => unpinRecipe(supabase, pinId),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: pinnedRecipesQueryKey });
    },
  });
}

export function useReorderPins() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (orderedPinIds: string[]) => reorderPins(supabase, orderedPinIds),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: pinnedRecipesQueryKey });
    },
  });
}
