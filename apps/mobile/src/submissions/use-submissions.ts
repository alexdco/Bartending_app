import { useEffect, useState } from "react";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  buildRecipeSubmissionWithdrawnEvent,
  fetchMyRecipeSubmission,
  fetchMyRecipeSubmissions,
  fetchSubmissionFormContext,
  findDuplicateRecipeNames,
  saveRecipeSubmissionWithPhoto,
  signSubmissionPhotoUrls,
  withdrawRecipeSubmission,
  type SaveSubmissionWithPhotoInput,
  type SubmissionCursor,
  type SubmissionPhotoSize,
} from "@bartendingapp/shared";

import { track } from "@/analytics/posthog-client";
import { profileQueryKey } from "@/auth/use-preferences";
import { useSession } from "@/auth/use-session";
import { useActiveLocale } from "@/i18n";
import { supabase } from "@/lib/supabase";

// Spec 0064 on mobile: the same shared calls as web, behind TanStack hooks.
const SUBMISSIONS_KEY = ["recipe-submissions"] as const;

/** The signed in author's submissions, newest first (AC-1, AC-6). */
export function useMyRecipeSubmissions() {
  const locale = useActiveLocale();
  const { isLinked } = useSession();
  return useInfiniteQuery({
    queryKey: [...SUBMISSIONS_KEY, "mine", locale],
    queryFn: ({ pageParam }) => fetchMyRecipeSubmissions(supabase, { cursor: pageParam, locale }),
    initialPageParam: null as SubmissionCursor | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    enabled: isLinked,
  });
}

/** Whether the form must ask for a display name, and whether the author is blocked (AC-3, AC-18). */
export function useSubmissionFormContext() {
  const { session, isLinked } = useSession();
  return useQuery({
    queryKey: [...SUBMISSIONS_KEY, "form-context", session?.user.id ?? null],
    queryFn: () => fetchSubmissionFormContext(supabase),
    enabled: isLinked,
  });
}

/** One of the author's own submissions, for the edit screen (AC-6). Null when missing. */
export function useMyRecipeSubmission(id: string) {
  const { isLinked } = useSession();
  return useQuery({
    queryKey: [...SUBMISSIONS_KEY, "mine-detail", id],
    queryFn: () => fetchMyRecipeSubmission(supabase, id),
    enabled: isLinked,
  });
}

/** Uploads a new photo first, then saves (AC-1, AC-6, AC-8). */
export function useSaveRecipeSubmission() {
  const queryClient = useQueryClient();
  const { session } = useSession();
  return useMutation({
    mutationFn: (input: SaveSubmissionWithPhotoInput) =>
      saveRecipeSubmissionWithPhoto(supabase, session?.user.id ?? null, input),
    onSuccess: (result) => {
      if (result.error) return;
      void queryClient.invalidateQueries({ queryKey: SUBMISSIONS_KEY });
      // A first submission may have saved the display name too.
      void queryClient.invalidateQueries({ queryKey: profileQueryKey });
    },
  });
}

/** Withdraws a pending or rejected submission and removes its photo (AC-6). */
export function useWithdrawRecipeSubmission() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => withdrawRecipeSubmission(supabase, id),
    onSuccess: (result) => {
      if (result.error) return;
      const event = buildRecipeSubmissionWithdrawnEvent();
      track(event.name, event.properties);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: SUBMISSIONS_KEY });
    },
  });
}

function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timeout = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timeout);
  }, [value, delayMs]);
  return debounced;
}

const DUPLICATE_DEBOUNCE_MS = 500;

/**
 * Catalog recipes whose name exactly matches the typed name, checked once
 * typing pauses (AC-7). The form calls `checkNow` again on submit.
 */
export function useDuplicateRecipeNames(name: string) {
  const locale = useActiveLocale();
  const debouncedName = useDebouncedValue(name.trim(), DUPLICATE_DEBOUNCE_MS);
  const query = useQuery({
    queryKey: [...SUBMISSIONS_KEY, "duplicates", locale, debouncedName],
    queryFn: () => findDuplicateRecipeNames(supabase, { name: debouncedName, locale }),
    enabled: debouncedName.length > 0,
    staleTime: 60 * 1000,
  });
  return {
    matches: debouncedName.length > 0 ? (query.data ?? []) : [],
    checkedName: debouncedName,
    checkNow: (value: string) => findDuplicateRecipeNames(supabase, { name: value, locale }),
  };
}

/** Signed URLs (one hour) for private submission photos, keyed by photo path (AC-8). */
export function useSubmissionPhotoUrls(
  photoPaths: readonly (string | null)[],
  size: SubmissionPhotoSize,
) {
  const paths = [...new Set(photoPaths.filter((path): path is string => path !== null))].sort();
  return useQuery({
    queryKey: ["submission-photo-urls", size, paths],
    queryFn: () => signSubmissionPhotoUrls(supabase, paths, size),
    enabled: paths.length > 0,
    staleTime: 45 * 60 * 1000,
    refetchInterval: 45 * 60 * 1000,
  });
}
