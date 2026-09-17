import { useMutation, useQueryClient } from "@tanstack/react-query";
import { submitRating, type RatingScore } from "@bartendingapp/shared";
import { supabase } from "@/lib/supabase";
import { myRatingQueryKey, ratingSummaryQueryKey } from "./use-ratings";

const recommendationsQueryKeyPrefix = ["recommendations"] as const;

interface MutationContext {
  previousRating: RatingScore | null | undefined;
}

export function useSubmitRating(recipeId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ score }: { score: RatingScore }) => submitRating(supabase, recipeId, score),
    onMutate: async ({ score }): Promise<MutationContext> => {
      await queryClient.cancelQueries({ queryKey: myRatingQueryKey(recipeId) });
      const previousRating = queryClient.getQueryData<RatingScore | null>(
        myRatingQueryKey(recipeId),
      );

      queryClient.setQueryData<RatingScore | null>(myRatingQueryKey(recipeId), score);

      return { previousRating };
    },
    onError: (_error, _variables, context) => {
      if (context && context.previousRating !== undefined) {
        queryClient.setQueryData(myRatingQueryKey(recipeId), context.previousRating);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: myRatingQueryKey(recipeId) });
      queryClient.invalidateQueries({ queryKey: ratingSummaryQueryKey(recipeId) });
      queryClient.invalidateQueries({ queryKey: recommendationsQueryKeyPrefix });
    },
  });
}
