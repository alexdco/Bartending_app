// Comment safety (spec 0062): moderation state shared by both apps.

export const MODERATION_STATUSES = ["pending", "approved", "flagged"] as const;

/**
 * `pending`: a photo not screened yet. `approved`: visible to everyone.
 * `flagged`: hidden until the admin clears or removes it. A non author only
 * ever receives `approved` rows (RLS hides the rest); the author sees their
 * own rows with the real status, which drives the "Checking photo" and
 * "Hidden while under review" notes.
 */
export type ModerationStatus = (typeof MODERATION_STATUSES)[number];

export function parseModerationStatus(value: unknown): ModerationStatus {
  return typeof value === "string" && (MODERATION_STATUSES as readonly string[]).includes(value)
    ? (value as ModerationStatus)
    : "approved";
}

/** How often a comment list refetches while one of its photos is still being checked. */
export const PENDING_PHOTO_REFETCH_MS = 15_000;

/** Whether any loaded comment still has a photo waiting for screening. */
export function hasPendingPhotos(
  comments: readonly {
    readonly photos: readonly { readonly moderationStatus: ModerationStatus }[];
  }[],
): boolean {
  return comments.some((comment) =>
    comment.photos.some((photo) => photo.moderationStatus === "pending"),
  );
}

/** The note an author sees on their own content, or null when it is visible to everyone. */
export type ModerationNote = "checking" | "under_review" | null;

export function moderationNote(status: ModerationStatus): ModerationNote {
  switch (status) {
    case "pending":
      return "checking";
    case "flagged":
      return "under_review";
    case "approved":
      return null;
  }
}
