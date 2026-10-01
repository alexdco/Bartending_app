"use client";

import { useMutation, useQueryClient, type InfiniteData } from "@tanstack/react-query";
import { deleteComment, type AdminComment } from "@bartendingapp/shared";
import { supabase } from "@/lib/supabase";
import { adminCommentsQueryKey } from "./use-admin-comments";

interface AdminCommentsPage {
  comments: AdminComment[];
  hasMore: boolean;
}

type AdminCommentsData = InfiniteData<AdminCommentsPage>;

export function useDeleteAdminComment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ commentId }: { commentId: string }) => deleteComment(supabase, commentId),
    onSuccess: (result, { commentId }) => {
      if (!result.data) {
        queryClient.invalidateQueries({ queryKey: adminCommentsQueryKey() });
        return;
      }

      queryClient.setQueryData<AdminCommentsData>(adminCommentsQueryKey(), (current) => {
        if (!current) return current;
        return {
          ...current,
          pages: current.pages.map((page) => ({
            ...page,
            comments: page.comments.filter((comment) => comment.id !== commentId),
          })),
        };
      });
    },
  });
}
