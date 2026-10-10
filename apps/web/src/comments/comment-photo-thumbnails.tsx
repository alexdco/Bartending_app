"use client";

import { useState } from "react";
import Image from "next/image";
import { commentPhotoLabel, getCommentPhotoUrl, type CommentPhoto } from "@bartendingapp/shared";
import { supabase } from "@/lib/supabase";
import { CommentPhotoViewer } from "./comment-photo-viewer";

/** Thumbnail height in px; width follows the stored aspect ratio. */
const THUMBNAIL_HEIGHT = 112;

export interface CommentPhotoThumbnailsProps {
  photos: readonly CommentPhoto[];
  displayName: string | null;
}

/**
 * A comment's photos as a row of thumbnails under its text (spec 0032
 * AC-9). Each thumbnail's box is sized from the stored width and height, so
 * nothing shifts as images load. Opens the full size viewer.
 */
export function CommentPhotoThumbnails({ photos, displayName }: CommentPhotoThumbnailsProps) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  if (photos.length === 0) return null;

  return (
    <>
      <ul className="flex flex-wrap gap-two">
        {photos.map((photo, index) => {
          const width = Math.round((photo.width / photo.height) * THUMBNAIL_HEIGHT);
          return (
            <li key={photo.id}>
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
      />
    </>
  );
}
