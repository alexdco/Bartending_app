"use client";

import { useMutation, useQueryClient, type InfiniteData } from "@tanstack/react-query";
import { adminDeleteCommentPhoto, deleteComment, type AdminComment } from "@bartendingapp/shared";
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
    mutationFn: ({ commentId, photoPaths = [] }: { commentId: string; photoPaths?: string[] }) =>
      deleteComment(supabase, commentId, photoPaths),
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

/**
 * Removes one photo from a comment (spec 0032 AC-11). When that leaves the
 * comment with no text and no photos, the database deletes the comment too,
 * and it leaves the list here as well.
 */
export function useDeleteAdminCommentPhoto() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ photoId }: { commentId: string; photoId: string }) =>
      adminDeleteCommentPhoto(supabase, photoId),
    onSuccess: (result, { commentId, photoId }) => {
      if (!result.data) {
        queryClient.invalidateQueries({ queryKey: adminCommentsQueryKey() });
        return;
      }

      const { commentDeleted } = result.data;

      queryClient.setQueryData<AdminCommentsData>(adminCommentsQueryKey(), (current) => {
        if (!current) return current;
        return {
          ...current,
          pages: current.pages.map((page) => ({
            ...page,
            comments: commentDeleted
              ? page.comments.filter((comment) => comment.id !== commentId)
              : page.comments.map((comment) =>
                  comment.id === commentId
                    ? {
                        ...comment,
                        photos: comment.photos
                          .filter((photo) => photo.id !== photoId)
                          .map((photo, position) => ({ ...photo, position })),
                      }
                    : comment,
                ),
          })),
        };
      });
    },
  });
}
