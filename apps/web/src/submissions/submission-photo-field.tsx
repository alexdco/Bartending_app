"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import Image from "next/image";
import { RECIPE_IMAGE_ACCEPTED_TYPES } from "@bartendingapp/shared";
import { Button } from "@/components/button";
import { Text } from "@/components/text";
import { processRecipeImage, type ProcessRecipeImageError } from "@/admin/process-recipe-image";
import type { SubmissionPhotoChange } from "./use-submissions";

const ACCEPT = RECIPE_IMAGE_ACCEPTED_TYPES.join(",");
const PREVIEW_SIZE = 160;

type SubmissionsTranslator = ReturnType<typeof useTranslations<"submissions">>;

function processErrorMessage(t: SubmissionsTranslator, error: ProcessRecipeImageError): string {
  switch (error) {
    case "unsupported_type":
      return t("photoErrorUnsupportedType");
    case "too_large":
      return t("photoErrorTooLarge");
    case "too_small":
      return t("photoErrorTooSmall");
    case "webp_unsupported":
      return t("photoErrorWebpUnsupported");
    case "decode_failed":
      return t("photoErrorDecodeFailed");
  }
}

export interface SubmissionPhotoFieldProps {
  /** A signed URL for the photo the submission already has, or null. */
  currentUrl: string | null;
  /** Whether the submission already has a photo (its URL may still be loading). */
  hasCurrent: boolean;
  change: SubmissionPhotoChange;
  onChange: (change: SubmissionPhotoChange) => void;
  disabled?: boolean;
}

/**
 * Attach, replace, or remove the one optional photo (spec 0064 AC-8). Picking
 * runs the spec 0041 crop right away (center square, metadata stripped, a
 * hero WebP up to 1000px plus a 400px card), so a bad file is rejected before
 * the save; the pair uploads to the private bucket when the form saves.
 */
export function SubmissionPhotoField({
  currentUrl,
  hasCurrent,
  change,
  onChange,
  disabled = false,
}: SubmissionPhotoFieldProps) {
  const t = useTranslations("submissions");
  const inputRef = useRef<HTMLInputElement>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const newPreviewUrl = useMemo(
    () =>
      // The canvas crop always yields Blobs.
      change.kind === "replace" && change.image.card instanceof Blob
        ? URL.createObjectURL(change.image.card)
        : null,
    [change],
  );

  useEffect(
    () => () => {
      if (newPreviewUrl) URL.revokeObjectURL(newPreviewUrl);
    },
    [newPreviewUrl],
  );

  const previewUrl =
    change.kind === "replace" ? newPreviewUrl : change.kind === "keep" ? currentUrl : null;
  const hasPhoto = change.kind === "replace" || (change.kind === "keep" && hasCurrent);

  async function handleFile(file: File) {
    setIsProcessing(true);
    setError(null);
    const result = await processRecipeImage(file);
    setIsProcessing(false);

    if (result.error) {
      setError(processErrorMessage(t, result.error));
      return;
    }

    onChange({ kind: "replace", image: result.data });
  }

  return (
    <div className="flex flex-col gap-two">
      <Text variant="label" id="submission-photo-label">
        {t("photo")}
      </Text>
      <Text variant="bodySmall" muted id="submission-photo-hint">
        {t("photoHint")}
      </Text>

      <div
        className="relative shrink-0 overflow-hidden rounded-small border border-border bg-surface-selected"
        style={{ width: PREVIEW_SIZE, height: PREVIEW_SIZE }}
      >
        {previewUrl ? (
          // A signed or blob URL: never through the image optimizer.
          <Image
            src={previewUrl}
            alt={t("photoPreviewAlt")}
            fill
            sizes={`${PREVIEW_SIZE}px`}
            unoptimized
            className="object-cover"
          />
        ) : (
          <span className="flex h-full items-center justify-center p-two text-center text-body-small text-text-muted">
            {hasPhoto ? t("photoLoading") : t("noPhoto")}
          </span>
        )}
      </div>

      {change.kind === "remove" && hasCurrent && (
        <Text variant="bodySmall" muted role="status">
          {t("photoWillBeRemoved")}
        </Text>
      )}
      {isProcessing && (
        <Text variant="bodySmall" muted role="status">
          {t("photoPreparing")}
        </Text>
      )}
      {error && (
        <Text variant="bodySmall" className="text-danger" role="alert">
          {error}
        </Text>
      )}

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        hidden
        aria-labelledby="submission-photo-label"
        aria-describedby="submission-photo-hint"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void handleFile(file);
          event.target.value = "";
        }}
      />

      <div className="flex flex-wrap gap-two">
        <Button
          type="button"
          variant="secondary"
          disabled={disabled || isProcessing}
          onClick={() => inputRef.current?.click()}
        >
          {hasPhoto ? t("replacePhoto") : t("choosePhoto")}
        </Button>
        {hasPhoto && (
          <Button
            type="button"
            variant="secondary"
            disabled={disabled || isProcessing}
            onClick={() => {
              setError(null);
              onChange({ kind: "remove" });
            }}
          >
            {t("removePhoto")}
          </Button>
        )}
        {change.kind !== "keep" && hasCurrent && (
          <Button
            type="button"
            variant="secondary"
            disabled={disabled || isProcessing}
            onClick={() => {
              setError(null);
              onChange({ kind: "keep" });
            }}
          >
            {t("undoPhotoChange")}
          </Button>
        )}
      </div>
    </div>
  );
}
