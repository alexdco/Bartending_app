import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  addPantryItem,
  buildPantryItemAddedEvent,
  removePantryItem,
  type PantryItem,
} from "@bartendingapp/shared";
import { useActiveLocale } from "@/i18n";
import { supabase } from "@/lib/supabase";
import { track } from "@/analytics/posthog-client";
import { drinkIdeasQueryKeyPrefix } from "@/drink-ideas/use-drink-ideas";
import { pantryQueryKey, pantryQueryKeyPrefix } from "./use-pantry";

const recommendationsQueryKeyPrefix = ["recommendations"] as const;

interface MutationContext {
  previousItems: PantryItem[] | undefined;
}

export function useAddPantryItem() {
  const queryClient = useQueryClient();
  const locale = useActiveLocale();
  const queryKey = pantryQueryKey(locale);

  return useMutation({
    mutationFn: ({ ingredientId }: { ingredientId: string; name: string }) =>
      addPantryItem(supabase, ingredientId),
    onMutate: async ({ ingredientId, name }): Promise<MutationContext> => {
      await queryClient.cancelQueries({ queryKey });
      const previousItems = queryClient.getQueryData<PantryItem[]>(queryKey);

      queryClient.setQueryData<PantryItem[]>(queryKey, (current) => {
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
    onSuccess: (_data, { ingredientId }) => {
      const event = buildPantryItemAddedEvent({ ingredient_id: ingredientId });
      track(event.name, event.properties);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: pantryQueryKeyPrefix });
      queryClient.invalidateQueries({ queryKey: drinkIdeasQueryKeyPrefix });
      queryClient.invalidateQueries({ queryKey: recommendationsQueryKeyPrefix });
    },
  });
}

export function useRemovePantryItem() {
  const queryClient = useQueryClient();
  const locale = useActiveLocale();
  const queryKey = pantryQueryKey(locale);

  return useMutation({
    mutationFn: ({ ingredientId }: { ingredientId: string }) =>
      removePantryItem(supabase, ingredientId),
    onMutate: async ({ ingredientId }): Promise<MutationContext> => {
      await queryClient.cancelQueries({ queryKey });
      const previousItems = queryClient.getQueryData<PantryItem[]>(queryKey);

      queryClient.setQueryData<PantryItem[]>(queryKey, (current) =>
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
      queryClient.invalidateQueries({ queryKey: pantryQueryKeyPrefix });
      queryClient.invalidateQueries({ queryKey: drinkIdeasQueryKeyPrefix });
      queryClient.invalidateQueries({ queryKey: recommendationsQueryKeyPrefix });
    },
  });
}
