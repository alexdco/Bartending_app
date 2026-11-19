"use client";

import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ADMIN_REVIEW_PAGE_SIZE,
  adminClearModeration,
  adminDeleteCommentPhoto,
  deleteComment,
  fetchAdminReviewCount,
  fetchAdminReviewQueue,
  type AdminReviewCursor,
  type ReportTarget,
} from "@bartendingapp/shared";
import { supabase } from "@/lib/supabase";
import { adminCommentsQueryKey } from "./use-admin-comments";

export function adminReviewQueueKey() {
  return ["comments", "admin-review"] as const;
}

export function adminReviewCountKey() {
  return ["comments", "admin-review-count"] as const;
}

/** The Needs review tab (spec 0062 AC-11). */
export function useAdminReviewQueue() {
  return useInfiniteQuery({
    queryKey: adminReviewQueueKey(),
    queryFn: ({ pageParam }) => fetchAdminReviewQueue(supabase, pageParam, ADMIN_REVIEW_PAGE_SIZE),
    initialPageParam: null as AdminReviewCursor | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  });
}

/** The nav badge: distinct comments needing review. */
export function useAdminReviewCount() {
  return useQuery({
    queryKey: adminReviewCountKey(),
    queryFn: () => fetchAdminReviewCount(supabase),
    refetchInterval: 60_000,
  });
}

export type ReviewAction =
  | { readonly kind: "clear"; readonly target: ReportTarget }
  | {
      readonly kind: "remove";
      readonly target: ReportTarget;
      readonly photoPaths: readonly string[];
    };

/**
 * Clear approves one target and resolves its reports; Remove reuses the
 * existing admin delete paths, whose triggers resolve the reports as removed
 * (AC-12). Either way the queue, the badge, and the All comments list refetch.
 */
export function useAdminReviewAction() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (action: ReviewAction): Promise<boolean> => {
      if (action.kind === "clear") {
        const result = await adminClearModeration(supabase, action.target);
        return result.data !== null;
      }
      if (action.target.kind === "comment") {
        const result = await deleteComment(supabase, action.target.commentId, action.photoPaths);
        return result.data !== null;
      }
      const result = await adminDeleteCommentPhoto(supabase, action.target.photoId);
      return result.data !== null;
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: adminReviewQueueKey() });
      void queryClient.invalidateQueries({ queryKey: adminReviewCountKey() });
      void queryClient.invalidateQueries({ queryKey: adminCommentsQueryKey() });
    },
  });
}
