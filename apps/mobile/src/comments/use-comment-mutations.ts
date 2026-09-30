import { useMutation, useQueryClient, type InfiniteData } from "@tanstack/react-query";
import { postComment, editComment, deleteComment, type Comment } from "@bartendingapp/shared";
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
    mutationFn: ({ body }: { body: string }) => postComment(supabase, recipeId, body),
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
    mutationFn: ({ commentId, body }: { commentId: string; body: string }) =>
      editComment(supabase, commentId, body),
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
            comments: page.comments.map((comment) =>
              comment.id === commentId
                ? {
                    ...comment,
                    body: result.data!.body,
                    updatedAt: result.data!.updatedAt,
                    edited: true,
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
    mutationFn: ({ commentId }: { commentId: string }) => deleteComment(supabase, commentId),
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
