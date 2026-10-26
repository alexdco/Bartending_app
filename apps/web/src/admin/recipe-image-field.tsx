"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import Image from "next/image";
import { RECIPE_IMAGE_ACCEPTED_TYPES } from "@bartendingapp/shared";
import { Button } from "@/components/button";
import { Text } from "@/components/text";
import {
  processRecipeImage,
  type ProcessRecipeImageError,
  type ProcessedRecipeImage,
} from "./process-recipe-image";

const ACCEPT = RECIPE_IMAGE_ACCEPTED_TYPES.join(",");
const PREVIEW_SIZE = 160;

/** What saving the form should do to the recipe's image. */
export type RecipeImageChange =
  { kind: "keep" } | { kind: "remove" } | { kind: "replace"; image: ProcessedRecipeImage };

type AdminTranslator = ReturnType<typeof useTranslations<"admin">>;

function processErrorMessage(t: AdminTranslator, error: ProcessRecipeImageError): string {
  switch (error) {
    case "unsupported_type":
      return t("imageErrorUnsupportedType");
    case "too_large":
      return t("imageErrorTooLarge");
    case "too_small":
      return t("imageErrorTooSmall");
    case "webp_unsupported":
      return t("imageErrorWebpUnsupported");
    case "decode_failed":
      return t("imageErrorDecodeFailed");
  }
}

export interface RecipeImageFieldProps {
  /** The recipe's current image URL (hero), or null. */
  currentUrl: string | null;
  change: RecipeImageChange;
  onChange: (change: RecipeImageChange) => void;
  disabled?: boolean;
}

/**
 * Pick, preview, replace, or remove a recipe image (spec 0041 AC-2 to AC-5).
 * Picking processes the file right away so a bad file is rejected before the
 * save; nothing uploads until the form saves.
 */
export function RecipeImageField({
  currentUrl,
  change,
  onChange,
  disabled = false,
}: RecipeImageFieldProps) {
  const t = useTranslations("admin");
  const inputRef = useRef<HTMLInputElement>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const newPreviewUrl = useMemo(
    () => (change.kind === "replace" ? URL.createObjectURL(change.image.hero) : null),
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
      <Text variant="label">{t("image")}</Text>
      <Text variant="bodySmall" muted>
        {t("imageHint")}
      </Text>

      <div
        className="relative shrink-0 overflow-hidden rounded-small border border-border bg-surface-selected"
        style={{ width: PREVIEW_SIZE, height: PREVIEW_SIZE }}
      >
        {previewUrl ? (
          <Image
            src={previewUrl}
            alt={t("imagePreviewAlt")}
            fill
            sizes={`${PREVIEW_SIZE}px`}
            unoptimized
            className="object-cover"
          />
        ) : (
          <span className="flex h-full items-center justify-center p-two text-center text-body-small text-text-muted">
            {t("noImage")}
          </span>
        )}
      </div>

      {change.kind === "remove" && currentUrl && (
        <Text variant="bodySmall" muted role="status">
          {t("imageWillBeRemoved")}
        </Text>
      )}
      {isProcessing && (
        <Text variant="bodySmall" muted role="status">
          {t("imagePreparing")}
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
          {previewUrl ? t("replaceImage") : t("chooseImage")}
        </Button>
        {previewUrl && (
          <Button
            type="button"
            variant="secondary"
            disabled={disabled || isProcessing}
            onClick={() => {
              setError(null);
              onChange({ kind: "remove" });
            }}
          >
            {t("removeImage")}
          </Button>
        )}
        {change.kind !== "keep" && (
          <Button
            type="button"
            variant="secondary"
            disabled={disabled || isProcessing}
            onClick={() => {
              setError(null);
              onChange({ kind: "keep" });
            }}
          >
            {t("undoImageChange")}
          </Button>
        )}
      </div>
    </div>
  );
}
