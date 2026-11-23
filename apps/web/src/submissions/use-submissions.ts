"use client";

import { useEffect, useState } from "react";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocale } from "next-intl";
import {
  adminFetchRecipeSubmission,
  adminListRecipeSubmissions,
  approveRecipeSubmission,
  buildRecipeSubmissionWithdrawnEvent,
  draftSubmissionEnglish,
  fetchMyRecipeSubmission,
  fetchMyRecipeSubmissions,
  fetchSubmissionFormContext,
  findDuplicateRecipeNames,
  rejectRecipeSubmission,
  saveRecipeSubmissionWithPhoto,
  searchIngredients,
  setSubmissionBlock,
  signSubmissionPhotoUrls,
  withdrawRecipeSubmission,
  type ApproveSubmissionInput,
  type Locale,
  type RejectSubmissionInput,
  type SaveSubmissionWithPhotoInput,
  type SetSubmissionBlockInput,
  type SubmissionCursor,
  type SubmissionPhotoSize,
  type SubmissionStatus,
} from "@bartendingapp/shared";
import { track } from "@/analytics/posthog-client";
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

// The photo change and result types live in shared, beside the save they drive.
export type { SaveSubmissionWithPhotoResult, SubmissionPhotoChange } from "@bartendingapp/shared";

/** Uploads a new photo first, then saves (shared `saveRecipeSubmissionWithPhoto`, AC-8). */
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

/** One of the author's own submissions, for the edit form (AC-6). Null when missing. */
export function useMyRecipeSubmission(id: string) {
  const { isLinked } = useSession();
  return useQuery({
    queryKey: [...SUBMISSIONS_KEY, "mine-detail", id],
    queryFn: () => fetchMyRecipeSubmission(supabase, id),
    enabled: isLinked,
  });
}

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

export function useRejectRecipeSubmission() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: RejectSubmissionInput) => rejectRecipeSubmission(supabase, input),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: SUBMISSIONS_KEY });
    },
  });
}

/** AC-18: turn "Block from submitting" on or off for a submission's author. */
export function useSetSubmissionBlock() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: SetSubmissionBlockInput) => setSubmissionBlock(supabase, input),
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
 * typing pauses (AC-7). The form calls `refetch` again on submit.
 */
export function useDuplicateRecipeNames(name: string) {
  const locale = useLocale() as Locale;
  const debouncedName = useDebouncedValue(name.trim(), DUPLICATE_DEBOUNCE_MS);
  const query = useQuery({
    queryKey: [...SUBMISSIONS_KEY, "duplicates", locale, debouncedName],
    queryFn: () => findDuplicateRecipeNames(supabase, { name: debouncedName, locale }),
    enabled: debouncedName.length > 0,
    staleTime: 60 * 1000,
  });
  return {
    /** Matches for `checkedName`; empty while the name is blank. */
    matches: debouncedName.length > 0 ? (query.data ?? []) : [],
    checkedName: debouncedName,
    /** The same check, run now (on submit). */
    checkNow: (value: string) => findDuplicateRecipeNames(supabase, { name: value, locale }),
  };
}

const INGREDIENT_SUGGESTION_LIMIT = 10;
const INGREDIENT_DEBOUNCE_MS = 250;

/** Ingredient catalog names for the focused row, in the author's locale (AC-1). */
export function useSubmissionIngredientSuggestions(query: string) {
  const locale = useLocale() as Locale;
  const debouncedQuery = useDebouncedValue(query.trim(), INGREDIENT_DEBOUNCE_MS);
  return useQuery({
    queryKey: ["ingredients", "submission-suggestions", locale, debouncedQuery],
    queryFn: () =>
      searchIngredients(supabase, debouncedQuery, INGREDIENT_SUGGESTION_LIMIT, locale, {
        includeStaples: true,
      }),
    enabled: debouncedQuery.length >= 2,
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Signed URLs for private submission photos (AC-8), keyed by photo path. They
 * last an hour, so the query refreshes them well before that.
 */
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

/** AC-12: an English draft of a non English submission; saves nothing. */
export function useDraftSubmissionEnglish() {
  return useMutation({
    mutationFn: (submissionId: string) => draftSubmissionEnglish(supabase, submissionId),
  });
}
