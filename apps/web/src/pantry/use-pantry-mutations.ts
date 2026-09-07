"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { addPantryItem, removePantryItem, type PantryItem } from "@bartendingapp/shared";
import { supabase } from "@/lib/supabase";
import { pantryQueryKey } from "./use-pantry";

interface MutationContext {
  previousItems: PantryItem[] | undefined;
}

export function useAddPantryItem() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ ingredientId }: { ingredientId: string; name: string }) =>
      addPantryItem(supabase, ingredientId),
    onMutate: async ({ ingredientId, name }): Promise<MutationContext> => {
      await queryClient.cancelQueries({ queryKey: pantryQueryKey });
      const previousItems = queryClient.getQueryData<PantryItem[]>(pantryQueryKey);

      queryClient.setQueryData<PantryItem[]>(pantryQueryKey, (current) => {
        const items = current ?? [];
        if (items.some((item) => item.ingredientId === ingredientId)) {
          return items;
        }
        return [...items, { ingredientId, name }];
      });

      return { previousItems };
    },
    onError: (_error, _variables, context) => {
      if (context?.previousItems) {
        queryClient.setQueryData(pantryQueryKey, context.previousItems);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: pantryQueryKey });
    },
  });
}

export function useRemovePantryItem() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ ingredientId }: { ingredientId: string }) =>
      removePantryItem(supabase, ingredientId),
    onMutate: async ({ ingredientId }): Promise<MutationContext> => {
      await queryClient.cancelQueries({ queryKey: pantryQueryKey });
      const previousItems = queryClient.getQueryData<PantryItem[]>(pantryQueryKey);

      queryClient.setQueryData<PantryItem[]>(pantryQueryKey, (current) =>
        (current ?? []).filter((item) => item.ingredientId !== ingredientId),
      );

      return { previousItems };
    },
    onError: (_error, _variables, context) => {
      if (context?.previousItems) {
        queryClient.setQueryData(pantryQueryKey, context.previousItems);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: pantryQueryKey });
    },
  });
}
