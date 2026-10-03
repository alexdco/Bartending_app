"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocale } from "next-intl";
import {
  addShoppingListItem,
  buyShoppingListItem,
  removeShoppingListItem,
  type Locale,
  type ShoppingListItem,
} from "@bartendingapp/shared";
import { supabase } from "@/lib/supabase";
import { pantryQueryKeyPrefix } from "@/pantry/use-pantry";
import { shoppingListQueryKey, shoppingListQueryKeyPrefix } from "./use-shopping-list";

interface MutationContext {
  previousItems: ShoppingListItem[] | undefined;
}

export function useAddShoppingListItem() {
  const queryClient = useQueryClient();
  const locale = useLocale() as Locale;
  const queryKey = shoppingListQueryKey(locale);

  return useMutation({
    mutationFn: ({ ingredientId }: { ingredientId: string; name: string }) =>
      addShoppingListItem(supabase, ingredientId),
    onMutate: async ({ ingredientId, name }): Promise<MutationContext> => {
      await queryClient.cancelQueries({ queryKey });
      const previousItems = queryClient.getQueryData<ShoppingListItem[]>(queryKey);

      queryClient.setQueryData<ShoppingListItem[]>(queryKey, (current) => {
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
        queryClient.setQueryData(queryKey, context.previousItems);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: shoppingListQueryKeyPrefix });
    },
  });
}

export function useRemoveShoppingListItem() {
  const queryClient = useQueryClient();
  const locale = useLocale() as Locale;
  const queryKey = shoppingListQueryKey(locale);

  return useMutation({
    mutationFn: ({ ingredientId }: { ingredientId: string }) =>
      removeShoppingListItem(supabase, ingredientId),
    onMutate: async ({ ingredientId }): Promise<MutationContext> => {
      await queryClient.cancelQueries({ queryKey });
      const previousItems = queryClient.getQueryData<ShoppingListItem[]>(queryKey);

      queryClient.setQueryData<ShoppingListItem[]>(queryKey, (current) =>
        (current ?? []).filter((item) => item.ingredientId !== ingredientId),
      );

      return { previousItems };
    },
    onError: (_error, _variables, context) => {
      if (context?.previousItems) {
        queryClient.setQueryData(queryKey, context.previousItems);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: shoppingListQueryKeyPrefix });
    },
  });
}

export function useBuyShoppingListItem() {
  const queryClient = useQueryClient();
  const locale = useLocale() as Locale;
  const queryKey = shoppingListQueryKey(locale);

  return useMutation({
    mutationFn: ({ ingredientId }: { ingredientId: string }) =>
      buyShoppingListItem(supabase, ingredientId),
    onMutate: async ({ ingredientId }): Promise<MutationContext> => {
      await queryClient.cancelQueries({ queryKey });
      const previousItems = queryClient.getQueryData<ShoppingListItem[]>(queryKey);

      queryClient.setQueryData<ShoppingListItem[]>(queryKey, (current) =>
        (current ?? []).filter((item) => item.ingredientId !== ingredientId),
      );

      return { previousItems };
    },
    onError: (_error, _variables, context) => {
      if (context?.previousItems) {
        queryClient.setQueryData(queryKey, context.previousItems);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: shoppingListQueryKeyPrefix });
      queryClient.invalidateQueries({ queryKey: pantryQueryKeyPrefix });
    },
  });
}
