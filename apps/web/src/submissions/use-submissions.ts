"use client";

import { useEffect, useState } from "react";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocale } from "next-intl";
import {
  adminFetchRecipeSubmission,
  adminListRecipeSubmissions,
  approveRecipeSubmission,
  draftSubmissionEnglish,
  fetchMyRecipeSubmission,
  fetchMyRecipeSubmissions,
  fetchSubmissionFormContext,
  findDuplicateRecipeNames,
  rejectRecipeSubmission,
  saveRecipeSubmission,
  searchIngredients,
  setSubmissionBlock,
  signSubmissionPhotoUrls,
  uploadSubmissionPhoto,
  withdrawRecipeSubmission,
  type ApproveSubmissionInput,
  type Locale,
  type RejectSubmissionInput,
  type RecipeImagePair,
  type SaveRecipeSubmissionInput,
  type SaveRecipeSubmissionResult,
  type SetSubmissionBlockInput,
  type SubmissionCursor,
  type SubmissionPhotoSize,
  type SubmissionStatus,
  type UploadRecipeImageError,
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

/** What saving the form does to the submission's photo (AC-8). */
export type SubmissionPhotoChange =
  { kind: "keep" } | { kind: "remove" } | { kind: "replace"; image: RecipeImagePair };

export interface SaveSubmissionWithPhotoInput extends Omit<
  SaveRecipeSubmissionInput,
  "photoPath" | "replacedPhotoPath"
> {
  /** The row's current photo path (null for a new submission or no photo). */
  currentPhotoPath: string | null;
  photo: SubmissionPhotoChange;
}

export type SaveSubmissionWithPhotoResult =
  | SaveRecipeSubmissionResult
  | { data: null; error: { reason: "photo_failed"; upload: UploadRecipeImageError } };

/**
 * Uploads a new photo first (under the submission id, so the save can name
 * its path), then saves. A replaced or removed photo's files are removed once
 * the save succeeds. A photo uploaded for a save that then fails stays until
 * the daily cleanup, or is reused when the same picture is saved again.
 */
export function useSaveRecipeSubmission() {
  const queryClient = useQueryClient();
  const { session } = useSession();
  return useMutation({
    mutationFn: async ({
      currentPhotoPath,
      photo,
      ...input
    }: SaveSubmissionWithPhotoInput): Promise<SaveSubmissionWithPhotoResult> => {
      let photoPath = photo.kind === "keep" ? currentPhotoPath : null;

      if (photo.kind === "replace") {
        const userId = session?.user.id;
        if (!userId) {
          return {
            data: null,
            error: { reason: "photo_failed", upload: { reason: "forbidden" } },
          };
        }
        const upload = await uploadSubmissionPhoto(supabase, userId, input.id, photo.image);
        if (upload.error) {
          return { data: null, error: { reason: "photo_failed", upload: upload.error } };
        }
        photoPath = upload.data.photoPath;
      }

      return saveRecipeSubmission(supabase, {
        ...input,
        photoPath,
        replacedPhotoPath: currentPhotoPath,
      });
    },
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
