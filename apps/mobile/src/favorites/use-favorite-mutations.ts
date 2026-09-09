import { useMutation, useQueryClient } from "@tanstack/react-query";
import { addFavorite, buildRecipeFavoritedEvent, removeFavorite } from "@bartendingapp/shared";
import { supabase } from "@/lib/supabase";
import { track } from "@/analytics/posthog-client";
import { favoriteRecipeIdsQueryKey } from "./use-favorites";

const favoritesQueryKeyPrefix = ["favorites"] as const;
const recommendationsQueryKeyPrefix = ["recommendations"] as const;

interface MutationContext {
  previousIds: string[] | undefined;
}

function invalidateFavorites(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: favoritesQueryKeyPrefix });
  queryClient.invalidateQueries({ queryKey: recommendationsQueryKeyPrefix });
}

export function useAddFavorite() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ recipeId }: { recipeId: string }) => addFavorite(supabase, recipeId),
    onMutate: async ({ recipeId }): Promise<MutationContext> => {
      await queryClient.cancelQueries({ queryKey: favoriteRecipeIdsQueryKey });
      const previousIds = queryClient.getQueryData<string[]>(favoriteRecipeIdsQueryKey);

      queryClient.setQueryData<string[]>(favoriteRecipeIdsQueryKey, (current) => {
        const ids = current ?? [];
        return ids.includes(recipeId) ? ids : [...ids, recipeId];
      });

      return { previousIds };
    },
    onError: (_error, _variables, context) => {
      if (context?.previousIds) {
        queryClient.setQueryData(favoriteRecipeIdsQueryKey, context.previousIds);
      }
    },
    onSuccess: (_data, { recipeId }) => {
      const event = buildRecipeFavoritedEvent({ recipe_id: recipeId, is_favorited: true });
      track(event.name, event.properties);
    },
    onSettled: () => invalidateFavorites(queryClient),
  });
}

export function useRemoveFavorite() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ recipeId }: { recipeId: string }) => removeFavorite(supabase, recipeId),
    onMutate: async ({ recipeId }): Promise<MutationContext> => {
      await queryClient.cancelQueries({ queryKey: favoriteRecipeIdsQueryKey });
      const previousIds = queryClient.getQueryData<string[]>(favoriteRecipeIdsQueryKey);

      queryClient.setQueryData<string[]>(favoriteRecipeIdsQueryKey, (current) =>
        (current ?? []).filter((id) => id !== recipeId),
      );

      return { previousIds };
    },
    onError: (_error, _variables, context) => {
      if (context?.previousIds) {
        queryClient.setQueryData(favoriteRecipeIdsQueryKey, context.previousIds);
      }
    },
    onSuccess: (_data, { recipeId }) => {
      const event = buildRecipeFavoritedEvent({ recipe_id: recipeId, is_favorited: false });
      track(event.name, event.properties);
    },
    onSettled: () => invalidateFavorites(queryClient),
  });
}

export function useToggleFavorite() {
  const addFavoriteMutation = useAddFavorite();
  const removeFavoriteMutation = useRemoveFavorite();

  return {
    toggle: (recipeId: string, isFavorited: boolean) =>
      isFavorited
        ? removeFavoriteMutation.mutate({ recipeId })
        : addFavoriteMutation.mutate({ recipeId }),
    isPending: addFavoriteMutation.isPending || removeFavoriteMutation.isPending,
  };
}
