import { useCallback, useEffect, useRef, useState } from "react";
import { randomUUID } from "expo-crypto";
import type { ImagePickerAsset } from "expo-image-picker";

import {
  COMMENT_PHOTO_MAX_COUNT,
  uploadCommentPhoto,
  type CommentPhoto,
  type EditCommentPhotoInput,
  type UploadCommentPhotoError,
} from "@bartendingapp/shared";
import { supabase } from "@/lib/supabase";
import { processPhoto, type ProcessPhotoError, type ProcessedPhoto } from "./process-photo";

export type PhotoDraftFailure =
  | { stage: "process"; reason: ProcessPhotoError }
  | { stage: "upload"; reason: UploadCommentPhotoError["reason"] };

interface ExistingPhotoDraft {
  key: string;
  kind: "existing";
  id: string;
  storagePath: string;
  width: number;
  height: number;
  altText: string;
}

interface NewPhotoDraft {
  key: string;
  kind: "new";
  status: "processing" | "ready" | "uploading" | "uploaded" | "failed";
  asset: ImagePickerAsset;
  processed: ProcessedPhoto | null;
  path: string | null;
  altText: string;
  failure: PhotoDraftFailure | null;
}

export type PhotoDraft = ExistingPhotoDraft | NewPhotoDraft;

export type UploadDraftsResult =
  { ok: true; photos: EditCommentPhotoInput[] } | { ok: false; dailyLimitReached: boolean };

function fromExisting(photo: CommentPhoto): ExistingPhotoDraft {
  return {
    key: photo.id,
    kind: "existing",
    id: photo.id,
    storagePath: photo.storagePath,
    width: photo.width,
    height: photo.height,
    altText: photo.altText ?? "",
  };
}

function toInput(draft: PhotoDraft): EditCommentPhotoInput | null {
  if (draft.kind === "existing") {
    return { kind: "existing", id: draft.id, altText: draft.altText };
  }

  if (!draft.path || !draft.processed) {
    return null;
  }

  return {
    kind: "new",
    path: draft.path,
    width: draft.processed.width,
    height: draft.processed.height,
    altText: draft.altText,
  };
}

function freshNewDraft(asset: ImagePickerAsset): NewPhotoDraft {
  return {
    key: randomUUID(),
    kind: "new",
    status: "processing",
    asset,
    processed: null,
    path: null,
    altText: "",
    failure: null,
  };
}

/**
 * The ordered photo list behind a composer or an edit form (spec 0032),
 * matching the web behavior (AC-15). New photos are processed as soon as
 * they are picked and uploaded only when the comment is submitted; nothing
 * is posted unless every photo processed and uploaded (AC-10).
 */
export function usePhotoDrafts(initialPhotos: readonly CommentPhoto[] = []) {
  const [drafts, setDrafts] = useState<PhotoDraft[]>(() => initialPhotos.map(fromExisting));
  // Latest list for event handlers (capacity checks, the upload snapshot).
  const draftsRef = useRef(drafts);
  useEffect(() => {
    draftsRef.current = drafts;
  }, [drafts]);

  const updateDraft = useCallback(
    (key: string, change: (draft: NewPhotoDraft) => NewPhotoDraft) => {
      setDrafts((current) =>
        current.map((draft) => (draft.key === key && draft.kind === "new" ? change(draft) : draft)),
      );
    },
    [],
  );

  const runProcessing = useCallback(
    async (key: string, asset: ImagePickerAsset) => {
      const result = await processPhoto(asset);

      updateDraft(key, (draft) =>
        result.data
          ? { ...draft, status: "ready", processed: result.data, failure: null }
          : { ...draft, status: "failed", failure: { stage: "process", reason: result.error } },
      );
    },
    [updateDraft],
  );

  const addAssets = useCallback(
    (assets: readonly ImagePickerAsset[]) => {
      const remaining = COMMENT_PHOTO_MAX_COUNT - draftsRef.current.length;
      const added = assets.slice(0, Math.max(remaining, 0)).map(freshNewDraft);

      if (added.length === 0) return;

      setDrafts((current) => [...current, ...added]);
      added.forEach((draft) => void runProcessing(draft.key, draft.asset));
    },
    [runProcessing],
  );

  const replace = useCallback(
    (key: string, asset: ImagePickerAsset) => {
      const replacement = freshNewDraft(asset);
      setDrafts((current) => current.map((draft) => (draft.key === key ? replacement : draft)));
      void runProcessing(replacement.key, asset);
    },
    [runProcessing],
  );

  const remove = useCallback((key: string) => {
    setDrafts((current) => current.filter((draft) => draft.key !== key));
  }, []);

  const move = useCallback((key: string, offset: -1 | 1) => {
    setDrafts((current) => {
      const from = current.findIndex((draft) => draft.key === key);
      const to = from + offset;
      if (from < 0 || to < 0 || to >= current.length) return current;
      const next = [...current];
      [next[from], next[to]] = [next[to]!, next[from]!];
      return next;
    });
  }, []);

  const setAltText = useCallback((key: string, altText: string) => {
    setDrafts((current) =>
      current.map((draft) => (draft.key === key ? { ...draft, altText } : draft)),
    );
  }, []);

  const retryProcessing = useCallback(
    (key: string) => {
      const draft = draftsRef.current.find((item) => item.key === key);
      if (draft?.kind !== "new") return;
      updateDraft(key, (item) => ({ ...item, status: "processing", failure: null }));
      void runProcessing(key, draft.asset);
    },
    [runProcessing, updateDraft],
  );

  /**
   * Uploads every processed photo that has no stored file yet (a new uuid per
   * attempt, retries included). Already uploaded photos are not uploaded
   * again, so a retry only re-sends the ones that failed.
   */
  const uploadPending = useCallback(
    async (userId: string): Promise<UploadDraftsResult> => {
      const snapshot = draftsRef.current;

      const isBlocked = snapshot.some(
        (draft) =>
          draft.kind === "new" &&
          (draft.status === "processing" || draft.failure?.stage === "process"),
      );
      if (isBlocked) return { ok: false, dailyLimitReached: false };

      const pending = snapshot.filter(
        (draft): draft is NewPhotoDraft => draft.kind === "new" && !draft.path && !!draft.processed,
      );

      pending.forEach((draft) =>
        updateDraft(draft.key, (item) => ({ ...item, status: "uploading", failure: null })),
      );

      const results = await Promise.all(
        pending.map(async (draft) => ({
          key: draft.key,
          result: await uploadCommentPhoto(supabase, {
            userId,
            objectId: randomUUID(),
            bytes: draft.processed!.bytes,
          }),
        })),
      );

      const uploadedPaths = new Map(
        results.flatMap(({ key, result }) => (result.data ? [[key, result.data.path]] : [])),
      );

      results.forEach(({ key, result }) =>
        updateDraft(key, (item) =>
          result.data
            ? { ...item, status: "uploaded", path: result.data.path }
            : {
                ...item,
                status: "failed",
                failure: { stage: "upload", reason: result.error.reason },
              },
        ),
      );

      const failed = results.filter(({ result }) => result.error);
      if (failed.length > 0) {
        return {
          ok: false,
          dailyLimitReached: failed.some(({ result }) => result.error?.reason === "daily_limit"),
        };
      }

      const photos = snapshot
        .map((draft) =>
          draft.kind === "new" && uploadedPaths.has(draft.key)
            ? toInput({ ...draft, path: uploadedPaths.get(draft.key)! })
            : toInput(draft),
        )
        .filter((input): input is EditCommentPhotoInput => input !== null);

      return { ok: true, photos };
    },
    [updateDraft],
  );

  const reset = useCallback((photos: readonly CommentPhoto[] = []) => {
    setDrafts(photos.map(fromExisting));
  }, []);

  return {
    drafts,
    canAddMore: drafts.length < COMMENT_PHOTO_MAX_COUNT,
    remainingSlots: COMMENT_PHOTO_MAX_COUNT - drafts.length,
    isProcessing: drafts.some((draft) => draft.kind === "new" && draft.status === "processing"),
    addAssets,
    replace,
    remove,
    move,
    setAltText,
    retryProcessing,
    uploadPending,
    reset,
  };
}
