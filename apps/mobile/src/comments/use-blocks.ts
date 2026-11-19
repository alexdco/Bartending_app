import { useMutation, useQuery, useQueryClient, type InfiniteData } from "@tanstack/react-query";
import {
  blockUser,
  fetchBlockedUsers,
  unblockUser,
  withoutAuthor,
  type Comment,
} from "@bartendingapp/shared";
import { supabase } from "@/lib/supabase";
import { useSession } from "@/auth/use-session";

interface CommentsPage {
  comments: Comment[];
  hasMore: boolean;
}

export function blockedUsersQueryKey() {
  return ["blocked-users"] as const;
}

/** Every recipe's comment list: a block or unblock changes what each shows. */
const COMMENT_LISTS_KEY = ["comments", "list"] as const;

/** The Blocked people list on the account page (spec 0062 AC-15). */
export function useBlockedUsers() {
  const { isLinked } = useSession();
  return useQuery({
    queryKey: blockedUsersQueryKey(),
    queryFn: () => fetchBlockedUsers(supabase),
    enabled: isLinked,
  });
}

/**
 * Blocks a comment author (AC-14): their comments leave every loaded list at
 * once, then the lists refetch so RLS has the final word.
 */
export function useBlockUser() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (blockedId: string) => blockUser(supabase, blockedId),
    onSuccess: (result, blockedId) => {
      if (!result.data) return;

      queryClient.setQueriesData<InfiniteData<CommentsPage>>(
        { queryKey: COMMENT_LISTS_KEY },
        (current) =>
          current && {
            ...current,
            pages: current.pages.map((page) => ({
              ...page,
              comments: withoutAuthor(page.comments, blockedId),
            })),
          },
      );
      void queryClient.invalidateQueries({ queryKey: COMMENT_LISTS_KEY });
      void queryClient.invalidateQueries({ queryKey: blockedUsersQueryKey() });
    },
  });
}

/** Unblocks from the account page; that person's content shows again (AC-15). */
export function useUnblockUser() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (blockedId: string) => unblockUser(supabase, blockedId),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: blockedUsersQueryKey() });
      void queryClient.invalidateQueries({ queryKey: COMMENT_LISTS_KEY });
    },
  });
}
