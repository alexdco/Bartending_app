"use client";

import { useRef } from "react";
import { useTranslations } from "next-intl";
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

type CommentsTranslator = ReturnType<typeof useTranslations<"comments">>;

function photoFailureMessage(t: CommentsTranslator, failure: PhotoDraftFailure): string {
  switch (failure.reason) {
    case "unsupported_type":
      return t("photoUnsupportedType");
    case "original_too_large":
      return t("photoOriginalTooLarge");
    case "processing_failed":
      return t("photoProcessingFailed");
    case "too_large":
      return t("photoTooLarge");
    case "wrong_type":
      return t("photoWrongType");
    case "daily_limit":
      return t("photoDailyLimit", { limit: COMMENT_PHOTO_DAILY_LIMIT });
    case "request_failed":
      return t("photoRequestFailed");
  }
}

function statusMessage(t: CommentsTranslator, draft: PhotoDraft): string | null {
  if (draft.kind === "existing") return null;
  if (draft.failure) return photoFailureMessage(t, draft.failure);
  if (draft.status === "processing") return t("photoPreparing");
  if (draft.status === "uploading") return t("photoUploading");
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
  const t = useTranslations("comments");
  const tCommon = useTranslations("common");
  const addInputRef = useRef<HTMLInputElement>(null);
  const replaceInputRef = useRef<HTMLInputElement>(null);
  const replaceKeyRef = useRef<string | null>(null);

  return (
    <div className="flex flex-col gap-two">
      {photos.drafts.length > 0 && (
        <ol className="flex flex-col gap-two" aria-label={t("attachedPhotos")}>
          {photos.drafts.map((draft, index) => {
            const src = previewSrc(draft);
            const message = statusMessage(t, draft);
            const failure = draft.kind === "new" ? draft.failure : null;
            const number = index + 1;

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
                      {t("altTextLabel", { number })}
                    </span>
                    <input
                      type="text"
                      value={draft.altText}
                      maxLength={COMMENT_PHOTO_ALT_MAX_LENGTH}
                      disabled={disabled}
                      onChange={(event) => photos.setAltText(draft.key, event.target.value)}
                      placeholder={t("altTextPlaceholder")}
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
                      aria-label={t("moveLeftLabel", { number })}
                    >
                      {t("moveLeft")}
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      className="px-two py-one"
                      disabled={disabled || index === photos.drafts.length - 1}
                      onClick={() => photos.move(draft.key, 1)}
                      aria-label={t("moveRightLabel", { number })}
                    >
                      {t("moveRight")}
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
                      aria-label={t("replaceLabel", { number })}
                    >
                      {t("replace")}
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      className="px-two py-one"
                      disabled={disabled}
                      onClick={() => photos.remove(draft.key)}
                      aria-label={t("removeLabel", { number })}
                    >
                      {tCommon("remove")}
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
                          aria-label={t("retryLabel", { number })}
                        >
                          {tCommon("retry")}
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
          {t("addPhoto", { count: photos.drafts.length, max: COMMENT_PHOTO_MAX_COUNT })}
        </Button>
      ) : (
        <Text variant="bodySmall" muted>
          {t("photosMax", { max: COMMENT_PHOTO_MAX_COUNT })}
        </Text>
      )}
    </div>
  );
}
