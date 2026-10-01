"use client";

import { useInfiniteQuery } from "@tanstack/react-query";
import { COMMENTS_PAGE_SIZE, fetchAllComments, type AdminComment } from "@bartendingapp/shared";
import { supabase } from "@/lib/supabase";

export function adminCommentsQueryKey() {
  return ["comments", "admin-list"] as const;
}

interface AdminCommentsPage {
  comments: AdminComment[];
  hasMore: boolean;
}

export function useAdminComments() {
  return useInfiniteQuery({
    queryKey: adminCommentsQueryKey(),
    queryFn: ({ pageParam }): Promise<AdminCommentsPage> =>
      fetchAllComments(supabase, {
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
