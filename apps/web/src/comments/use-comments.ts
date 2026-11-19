"use client";

import { useInfiniteQuery } from "@tanstack/react-query";
import {
  COMMENTS_PAGE_SIZE,
  PENDING_PHOTO_REFETCH_MS,
  fetchRecipeComments,
  hasPendingPhotos,
  type Comment,
} from "@bartendingapp/shared";
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
    // Spec 0062: while a photo is being checked, poll so the author's
    // "Checking photo" caption clears once screening lands.
    refetchInterval: (query) =>
      hasPendingPhotos(query.state.data?.pages.flatMap((page) => page.comments) ?? [])
        ? PENDING_PHOTO_REFETCH_MS
        : false,
  });
}
