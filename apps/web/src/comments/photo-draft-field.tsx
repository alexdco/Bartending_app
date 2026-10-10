"use client";

import { useRef } from "react";
import Image from "next/image";
import {
  COMMENT_PHOTO_ACCEPTED_TYPES,
  COMMENT_PHOTO_ALT_MAX_LENGTH,
  COMMENT_PHOTO_DAILY_LIMIT,
  COMMENT_PHOTO_MAX_COUNT,
  getCommentPhotoUrl,
} from "@bartendingapp/shared";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/button";
import { Text } from "@/components/text";
import type { PhotoDraft, PhotoDraftFailure, usePhotoDrafts } from "./use-photo-drafts";

const ACCEPT = [...COMMENT_PHOTO_ACCEPTED_TYPES, ".heic", ".heif"].join(",");
const PREVIEW_SIZE = 96;

export function photoFailureMessage(failure: PhotoDraftFailure): string {
  switch (failure.reason) {
    case "unsupported_type":
      return "This file type isn't supported. Use JPEG, PNG, WebP, or HEIC.";
    case "original_too_large":
      return "This photo is over 25 MB. Pick a smaller one.";
    case "processing_failed":
      return "Couldn't process this photo.";
    case "too_large":
      return "This photo is too large to upload.";
    case "wrong_type":
      return "This photo couldn't be uploaded.";
    case "daily_limit":
      return `Daily photo limit reached (${COMMENT_PHOTO_DAILY_LIMIT} a day). Try again tomorrow.`;
    case "request_failed":
      return "Upload failed. Check your connection and retry.";
  }
}

function statusMessage(draft: PhotoDraft): string | null {
  if (draft.kind === "existing") return null;
  if (draft.failure) return photoFailureMessage(draft.failure);
  if (draft.status === "processing") return "Preparing...";
  if (draft.status === "uploading") return "Uploading...";
  return null;
}

function previewSrc(draft: PhotoDraft): string | null {
  return draft.kind === "existing"
    ? getCommentPhotoUrl(supabase, draft.storagePath)
    : draft.previewUrl;
}

export interface PhotoDraftFieldProps {
  photos: ReturnType<typeof usePhotoDrafts>;
  disabled?: boolean;
  /** Retries a failed upload by submitting again; only failed photos are re-sent. */
  onRetryUpload: () => void;
}

/**
 * Pick, preview, reorder, replace, remove, and describe up to 3 photos
 * (spec 0032 AC-1, AC-4, AC-5, AC-10). Shared by the composer and the edit
 * form.
 */
export function PhotoDraftField({ photos, disabled = false, onRetryUpload }: PhotoDraftFieldProps) {
  const addInputRef = useRef<HTMLInputElement>(null);
  const replaceInputRef = useRef<HTMLInputElement>(null);
  const replaceKeyRef = useRef<string | null>(null);

  return (
    <div className="flex flex-col gap-two">
      {photos.drafts.length > 0 && (
        <ol className="flex flex-col gap-two" aria-label="Attached photos">
          {photos.drafts.map((draft, index) => {
            const src = previewSrc(draft);
            const message = statusMessage(draft);
            const failure = draft.kind === "new" ? draft.failure : null;
            const position = `photo ${index + 1}`;

            return (
              <li
                key={draft.key}
                className="flex flex-col gap-two rounded-small border border-border p-two sm:flex-row"
              >
                <div
                  className="relative shrink-0 overflow-hidden rounded-small bg-surface-selected"
                  style={{ width: PREVIEW_SIZE, height: PREVIEW_SIZE }}
                >
                  {src && (
                    <Image
                      src={src}
                      alt=""
                      fill
                      sizes={`${PREVIEW_SIZE}px`}
                      unoptimized={draft.kind === "new"}
                      className="object-cover"
                    />
                  )}
                </div>
                <div className="flex min-w-0 flex-1 flex-col gap-one">
                  <label className="flex flex-col gap-one">
                    <span className="text-label font-medium text-text">
                      Alt text for {position} (optional)
                    </span>
                    <input
                      type="text"
                      value={draft.altText}
                      maxLength={COMMENT_PHOTO_ALT_MAX_LENGTH}
                      disabled={disabled}
                      onChange={(event) => photos.setAltText(draft.key, event.target.value)}
                      placeholder="Describe the photo"
                      className="rounded-small border border-border bg-surface px-three py-one text-body-small text-text placeholder:text-text-muted"
                    />
                  </label>
                  {message && (
                    <Text
                      variant="bodySmall"
                      muted={!failure}
                      className={failure ? "text-danger" : ""}
                      role={failure ? "alert" : "status"}
                    >
                      {message}
                    </Text>
                  )}
                  <div className="flex flex-wrap gap-one">
                    <Button
                      type="button"
                      variant="secondary"
                      className="px-two py-one"
                      disabled={disabled || index === 0}
                      onClick={() => photos.move(draft.key, -1)}
                      aria-label={`Move ${position} left`}
                    >
                      Move left
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      className="px-two py-one"
                      disabled={disabled || index === photos.drafts.length - 1}
                      onClick={() => photos.move(draft.key, 1)}
                      aria-label={`Move ${position} right`}
                    >
                      Move right
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      className="px-two py-one"
                      disabled={disabled}
                      onClick={() => {
                        replaceKeyRef.current = draft.key;
                        replaceInputRef.current?.click();
                      }}
                      aria-label={`Replace ${position}`}
                    >
                      Replace
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      className="px-two py-one"
                      disabled={disabled}
                      onClick={() => photos.remove(draft.key)}
                      aria-label={`Remove ${position}`}
                    >
                      Remove
                    </Button>
                    {failure &&
                      failure.reason !== "unsupported_type" &&
                      failure.reason !== "original_too_large" && (
                        <Button
                          type="button"
                          className="px-two py-one"
                          disabled={disabled}
                          onClick={() =>
                            failure.stage === "process"
                              ? photos.retryProcessing(draft.key)
                              : onRetryUpload()
                          }
                          aria-label={`Retry ${position}`}
                        >
                          Retry
                        </Button>
                      )}
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      )}

      <input
        ref={addInputRef}
        type="file"
        accept={ACCEPT}
        multiple
        hidden
        onChange={(event) => {
          photos.addFiles(Array.from(event.target.files ?? []));
          event.target.value = "";
        }}
      />
      <input
        ref={replaceInputRef}
        type="file"
        accept={ACCEPT}
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file && replaceKeyRef.current) photos.replace(replaceKeyRef.current, file);
          replaceKeyRef.current = null;
          event.target.value = "";
        }}
      />

      {photos.canAddMore ? (
        <Button
          type="button"
          variant="secondary"
          className="self-start"
          disabled={disabled}
          onClick={() => addInputRef.current?.click()}
        >
          Add photo ({photos.drafts.length}/{COMMENT_PHOTO_MAX_COUNT})
        </Button>
      ) : (
        <Text variant="bodySmall" muted>
          {COMMENT_PHOTO_MAX_COUNT} photos max.
        </Text>
      )}
    </div>
  );
}
