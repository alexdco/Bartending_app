"use client";

import Image from "next/image";

const THUMBNAIL_SIZE = 64;

/**
 * A square photo thumbnail for a submission row: a signed URL from the
 * private bucket, or an approved recipe's public card. Signed URLs carry a
 * token, so the image never goes through the optimizer. Renders nothing
 * without a URL, so rows without a photo keep their text layout.
 */
export function SubmissionThumbnail({ url, alt }: { url: string | null; alt: string }) {
  if (!url) return null;
  return (
    <div
      className="relative shrink-0 overflow-hidden rounded-small border border-border bg-surface-selected"
      style={{ width: THUMBNAIL_SIZE, height: THUMBNAIL_SIZE }}
    >
      <Image
        src={url}
        alt={alt}
        fill
        sizes={`${THUMBNAIL_SIZE}px`}
        unoptimized
        className="object-cover"
      />
    </div>
  );
}
