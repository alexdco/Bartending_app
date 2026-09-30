"use client";

import { useInfiniteQuery } from "@tanstack/react-query";
import { COMMENTS_PAGE_SIZE, fetchRecipeComments, type Comment } from "@bartendingapp/shared";
import { supabase } from "@/lib/supabase";

export function recipeCommentsQueryKey(recipeId: string) {
  return ["comments", "list", recipeId] as const;
}

interface CommentsPage {
  comments: Comment[];
  hasMore: boolean;
}

export function useRecipeComments(recipeId: string) {
  return useInfiniteQuery({
    queryKey: recipeCommentsQueryKey(recipeId),
    queryFn: ({ pageParam }): Promise<CommentsPage> =>
      fetchRecipeComments(supabase, {
        recipeId,
        pageLimit: COMMENTS_PAGE_SIZE,
        beforeCreatedAt: pageParam?.beforeCreatedAt,
        beforeId: pageParam?.beforeId,
      }),
    initialPageParam: undefined as { beforeCreatedAt: string; beforeId: string } | undefined,
    getNextPageParam: (lastPage) => {
      if (!lastPage.hasMore) return undefined;
      const last = lastPage.comments[lastPage.comments.length - 1];
      return last ? { beforeCreatedAt: last.createdAt, beforeId: last.id } : undefined;
    },
  });
}
