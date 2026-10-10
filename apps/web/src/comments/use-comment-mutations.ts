"use client";

import { useMutation, useQueryClient, type InfiniteData } from "@tanstack/react-query";
import {
  postComment,
  editComment,
  deleteComment,
  type Comment,
  type EditCommentPhotoInput,
  type NewCommentPhoto,
} from "@bartendingapp/shared";
import { supabase } from "@/lib/supabase";
import { recipeCommentsQueryKey } from "./use-comments";

interface CommentsPage {
  comments: Comment[];
  hasMore: boolean;
}

type CommentsData = InfiniteData<CommentsPage>;

export function usePostComment(recipeId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ body, photos = [] }: { body: string; photos?: NewCommentPhoto[] }) =>
      postComment(supabase, recipeId, { body, photos }),
    onSuccess: (result) => {
      if (!result.data) return;

      queryClient.setQueryData<CommentsData>(recipeCommentsQueryKey(recipeId), (current) => {
        if (!current) return current;
        const [firstPage, ...rest] = current.pages;
        if (!firstPage) return current;

        return {
          ...current,
          pages: [
            { ...firstPage, comments: [result.data as Comment, ...firstPage.comments] },
            ...rest,
          ],
        };
      });
    },
  });
}

export function useEditComment(recipeId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      commentId,
      body,
      photos,
    }: {
      commentId: string;
      body: string;
      photos: EditCommentPhotoInput[];
    }) => editComment(supabase, commentId, { body, photos }),
    onSuccess: (result, { commentId }) => {
      if (!result.data) {
        // Not found or not owned (already gone, or a stale view): refetch
        // rather than trust local state.
        queryClient.invalidateQueries({ queryKey: recipeCommentsQueryKey(recipeId) });
        return;
      }

      queryClient.setQueryData<CommentsData>(recipeCommentsQueryKey(recipeId), (current) => {
        if (!current) return current;
        return {
          ...current,
          pages: current.pages.map((page) => ({
            ...page,
            comments: page.comments.map((comment) =>
              comment.id === commentId
                ? {
                    ...comment,
                    body: result.data!.body,
                    photos: result.data!.photos,
                    updatedAt: result.data!.updatedAt,
                    edited: result.data!.edited,
                  }
                : comment,
            ),
          })),
        };
      });
    },
  });
}

export function useDeleteComment(recipeId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ commentId, photoPaths = [] }: { commentId: string; photoPaths?: string[] }) =>
      deleteComment(supabase, commentId, photoPaths),
    onSuccess: (result, { commentId }) => {
      if (!result.data) {
        queryClient.invalidateQueries({ queryKey: recipeCommentsQueryKey(recipeId) });
        return;
      }

      queryClient.setQueryData<CommentsData>(recipeCommentsQueryKey(recipeId), (current) => {
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
