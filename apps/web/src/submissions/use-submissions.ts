"use client";

import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocale } from "next-intl";
import {
  adminFetchRecipeSubmission,
  adminListRecipeSubmissions,
  approveRecipeSubmission,
  fetchMyRecipeSubmissions,
  fetchSubmissionFormContext,
  saveRecipeSubmission,
  type ApproveSubmissionInput,
  type SaveRecipeSubmissionInput,
  type SubmissionCursor,
  type SubmissionStatus,
} from "@bartendingapp/shared";
import { useSession } from "@/auth/use-session";
import { supabase } from "@/lib/supabase";

const SUBMISSIONS_KEY = ["recipe-submissions"] as const;

export const mySubmissionsQueryKey = (locale: string) =>
  [...SUBMISSIONS_KEY, "mine", locale] as const;

/** The signed in author's submissions, newest first (spec 0064 AC-1, AC-6). */
export function useMyRecipeSubmissions() {
  const locale = useLocale();
  const { isLinked } = useSession();
  return useInfiniteQuery({
    queryKey: mySubmissionsQueryKey(locale),
    queryFn: ({ pageParam }) => fetchMyRecipeSubmissions(supabase, { cursor: pageParam, locale }),
    initialPageParam: null as SubmissionCursor | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    enabled: isLinked,
  });
}

/** Whether the form must ask for a display name, and whether the author is blocked. */
export function useSubmissionFormContext() {
  const { session, isLinked } = useSession();
  return useQuery({
    queryKey: [...SUBMISSIONS_KEY, "form-context", session?.user.id ?? null],
    queryFn: () => fetchSubmissionFormContext(supabase),
    enabled: isLinked,
  });
}

export function useSaveRecipeSubmission() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: SaveRecipeSubmissionInput) => saveRecipeSubmission(supabase, input),
    onSuccess: (result) => {
      if (result.error) return;
      void queryClient.invalidateQueries({ queryKey: SUBMISSIONS_KEY });
      // A first submission may have saved the display name too.
      void queryClient.invalidateQueries({ queryKey: ["profile"] });
    },
  });
}

export const adminSubmissionsQueryKey = (status: SubmissionStatus) =>
  [...SUBMISSIONS_KEY, "admin-list", status] as const;

export function useAdminRecipeSubmissions(status: SubmissionStatus) {
  return useInfiniteQuery({
    queryKey: adminSubmissionsQueryKey(status),
    queryFn: ({ pageParam }) => adminListRecipeSubmissions(supabase, { status, cursor: pageParam }),
    initialPageParam: null as SubmissionCursor | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  });
}

export function useAdminRecipeSubmission(id: string) {
  return useQuery({
    queryKey: [...SUBMISSIONS_KEY, "admin-detail", id],
    queryFn: () => adminFetchRecipeSubmission(supabase, id),
  });
}

export function useApproveRecipeSubmission() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: ApproveSubmissionInput) => approveRecipeSubmission(supabase, input),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: SUBMISSIONS_KEY });
    },
  });
}
