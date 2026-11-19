"use client";

import { useState } from "react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { getCommentPhotoUrl, moderationNote, type CommentPhoto } from "@bartendingapp/shared";
import { Text } from "@/components/text";
import { supabase } from "@/lib/supabase";
import { CommentPhotoViewer } from "./comment-photo-viewer";
import { useCommentPhotoLabel } from "./use-comment-photo-label";

/** Thumbnail height in px; width follows the stored aspect ratio. */
const THUMBNAIL_HEIGHT = 112;

export interface CommentPhotoThumbnailsProps {
  photos: readonly CommentPhoto[];
  displayName: string | null;
  /** Set when the viewer may report these photos (not their author). */
  onReportPhoto?: (photoId: string) => void;
}

/**
 * A comment's photos as a row of thumbnails under its text (spec 0032
 * AC-9). Each thumbnail's box is sized from the stored width and height, so
 * nothing shifts as images load. Opens the full size viewer.
 *
 * A photo not yet approved carries a caption ("Checking photo" or "Hidden
 * while under review", spec 0062 AC-1, AC-10). Only its author and the admin
 * ever receive such a photo; RLS hides it from everyone else.
 */
export function CommentPhotoThumbnails({
  photos,
  displayName,
  onReportPhoto,
}: CommentPhotoThumbnailsProps) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const commentPhotoLabel = useCommentPhotoLabel();
  const t = useTranslations("comments");

  if (photos.length === 0) return null;

  return (
    <>
      <ul className="flex flex-wrap gap-two">
        {photos.map((photo, index) => {
          const width = Math.round((photo.width / photo.height) * THUMBNAIL_HEIGHT);
          const note = moderationNote(photo.moderationStatus);
          return (
            <li key={photo.id} className="flex flex-col gap-one" style={{ width }}>
              <button
                type="button"
                onClick={() => setOpenIndex(index)}
                className="block overflow-hidden rounded-small border border-border focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                style={{ width, height: THUMBNAIL_HEIGHT }}
              >
                <Image
                  src={getCommentPhotoUrl(supabase, photo.storagePath)}
                  alt={commentPhotoLabel(photo, photos.length, displayName)}
                  width={width}
                  height={THUMBNAIL_HEIGHT}
                  sizes={`${width}px`}
                  className="h-full w-full object-cover"
                />
              </button>
              {note && (
                <Text variant="bodySmall" muted>
                  {note === "checking" ? t("checkingPhoto") : t("underReview")}
                </Text>
              )}
            </li>
          );
        })}
      </ul>
      <CommentPhotoViewer
        photos={photos}
        displayName={displayName}
        openIndex={openIndex}
        onChangeIndex={setOpenIndex}
        onClose={() => setOpenIndex(null)}
        onReportPhoto={onReportPhoto}
      />
    </>
  );
}
