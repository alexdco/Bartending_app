"use client";

import { useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import Image from "next/image";
import { getCommentPhotoUrl, type CommentPhoto } from "@bartendingapp/shared";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/button";
import { Text } from "@/components/text";
import { useCommentPhotoLabel } from "./use-comment-photo-label";

export interface CommentPhotoViewerProps {
  photos: readonly CommentPhoto[];
  displayName: string | null;
  /** Index of the open photo, or null when closed. */
  openIndex: number | null;
  onChangeIndex: (index: number) => void;
  onClose: () => void;
}

/**
 * Full size viewer for one comment's photos (spec 0032 AC-9). A native
 * modal dialog gives focus trapping, Escape to close, and focus return to
 * the thumbnail that opened it.
 */
export function CommentPhotoViewer({
  photos,
  displayName,
  openIndex,
  onChangeIndex,
  onClose,
}: CommentPhotoViewerProps) {
  const t = useTranslations("comments");
  const commentPhotoLabel = useCommentPhotoLabel();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const photo = openIndex === null ? undefined : photos[openIndex];

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (photo && !dialog.open) {
      dialog.showModal();
    } else if (!photo && dialog.open) {
      dialog.close();
    }
  }, [photo]);

  const hasPrevious = openIndex !== null && openIndex > 0;
  const hasNext = openIndex !== null && openIndex < photos.length - 1;

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDialogElement>) => {
    if (openIndex === null) return;
    if (event.key === "ArrowLeft" && hasPrevious) {
      event.preventDefault();
      onChangeIndex(openIndex - 1);
    } else if (event.key === "ArrowRight" && hasNext) {
      event.preventDefault();
      onChangeIndex(openIndex + 1);
    }
  };

  const label = photo ? commentPhotoLabel(photo, photos.length, displayName) : "";

  return (
    // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- native modal <dialog>: ArrowLeft/Right page the photos and a backdrop click closes it; Escape and the buttons inside cover keyboard use.
    <dialog
      ref={dialogRef}
      aria-label={label}
      onClose={onClose}
      onKeyDown={handleKeyDown}
      onClick={(event) => {
        // A click on the backdrop (the dialog element itself) closes it.
        if (event.target === event.currentTarget) onClose();
      }}
      className="m-auto max-h-[95vh] w-[min(95vw,1100px)] rounded-medium bg-surface p-0 text-text backdrop:bg-black/80"
    >
      {photo && openIndex !== null && (
        <div className="flex flex-col gap-two p-three">
          <div className="flex items-center justify-between gap-two">
            <Text variant="bodySmall" muted aria-live="polite">
              {openIndex + 1} / {photos.length}
            </Text>
            <Button variant="secondary" onClick={onClose}>
              {t("close")}
            </Button>
          </div>
          <div
            className="relative mx-auto w-full"
            style={{ aspectRatio: `${photo.width} / ${photo.height}`, maxHeight: "75vh" }}
          >
            <Image
              src={getCommentPhotoUrl(supabase, photo.storagePath)}
              alt={label}
              fill
              sizes="(min-width: 1100px) 1100px, 95vw"
              className="object-contain"
            />
          </div>
          {photo.altText && (
            <Text variant="bodySmall" muted>
              {photo.altText}
            </Text>
          )}
          {photos.length > 1 && (
            <div className="flex justify-between gap-two">
              <Button
                variant="secondary"
                disabled={!hasPrevious}
                onClick={() => onChangeIndex(openIndex - 1)}
              >
                {t("previous")}
              </Button>
              <Button
                variant="secondary"
                disabled={!hasNext}
                onClick={() => onChangeIndex(openIndex + 1)}
              >
                {t("next")}
              </Button>
            </div>
          )}
        </div>
      )}
    </dialog>
  );
}
