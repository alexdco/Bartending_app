// Comment safety (spec 0062): moderation state shared by both apps.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

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

// Reports (spec 0062 AC-6 to AC-9, AC-13) ------------------------------------

export const REPORT_REASONS = ["spam", "offensive", "sexual", "off_topic", "other"] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];

export const REPORT_NOTE_MAX_LENGTH = 500;

/** What is being reported: a whole comment, or one of its photos. */
export type ReportTarget =
  | { readonly kind: "comment"; readonly commentId: string }
  | { readonly kind: "photo"; readonly commentId: string; readonly photoId: string };

/** Trims the optional note; blank becomes null. */
export function normalizeReportNote(raw: string | null | undefined): string | null {
  const trimmed = (raw ?? "").trim();
  return trimmed.length > 0 ? trimmed : null;
}

/** "too_long" when the trimmed note is over 500 characters, else null. */
export function validateReportNote(raw: string | null | undefined): "too_long" | null {
  const note = normalizeReportNote(raw);
  return note !== null && [...note].length > REPORT_NOTE_MAX_LENGTH ? "too_long" : null;
}

export const REPORT_ERROR_REASONS = [
  "invalid_input",
  "not_signed_in",
  "not_found",
  "own_content",
  "already_reported",
  "report_limit",
] as const;

export type ReportErrorReason = (typeof REPORT_ERROR_REASONS)[number];

export type ReportContentError =
  | { readonly reason: ReportErrorReason }
  | { readonly reason: "request_failed"; readonly message: string };

/** report_content raises the bare code; anything else is request_failed. */
export function mapReportError(error: { message: string }): ReportContentError {
  const code = error.message.trim();
  const known = REPORT_ERROR_REASONS.find((reason) => reason === code);
  return known ? { reason: known } : { reason: "request_failed", message: error.message };
}

export interface ReportContentInput {
  readonly target: ReportTarget;
  readonly reason: ReportReason;
  readonly note?: string | null;
}

export type ReportContentResult =
  | {
      readonly data: { readonly reportId: string; readonly becameHidden: boolean };
      readonly error: null;
    }
  | { readonly data: null; readonly error: ReportContentError };

/** Ids only, never note text: what the counting report warning carries (AC-13). */
export interface BecameHiddenEvent {
  readonly reportId: string;
  readonly targetKind: ReportTarget["kind"];
  readonly commentId: string;
  readonly photoId: string | null;
}

export interface ReportContentOptions {
  /**
   * Called once when this report is the one that flagged its target
   * (invariant 9). Each app passes its own warning sink.
   */
  readonly onBecameHidden?: (event: BecameHiddenEvent) => void;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * Files one report through report_content. The caller hides the target from
 * its own cache on success; RLS keeps it hidden on every device (AC-8).
 */
export async function reportContent(
  client: SupabaseClient<Database>,
  input: ReportContentInput,
  options: ReportContentOptions = {},
): Promise<ReportContentResult> {
  if (validateReportNote(input.note) !== null) {
    return { data: null, error: { reason: "invalid_input" } };
  }

  const note = normalizeReportNote(input.note);
  const photoId = input.target.kind === "photo" ? input.target.photoId : null;

  const { data, error } = await client.rpc("report_content", {
    p_target_kind: input.target.kind,
    p_comment_id: input.target.commentId,
    p_reason: input.reason,
    ...(photoId !== null ? { p_photo_id: photoId } : {}),
    ...(note !== null ? { p_note: note } : {}),
  });

  if (error) {
    return { data: null, error: mapReportError(error) };
  }

  if (!isRecord(data) || typeof data.report_id !== "string") {
    return {
      data: null,
      error: { reason: "request_failed", message: "Unexpected report_content response" },
    };
  }

  const result = { reportId: data.report_id, becameHidden: data.became_hidden === true };

  if (result.becameHidden) {
    options.onBecameHidden?.({
      reportId: result.reportId,
      targetKind: input.target.kind,
      commentId: input.target.commentId,
      photoId,
    });
  }

  return { data: result, error: null };
}

/**
 * The comment list with a reported target removed: the whole comment for a
 * comment report; for a photo report, just that photo, and the comment too
 * when that leaves it with no text and no photos (AC-5, AC-8).
 */
export function withoutReportedTarget<
  T extends {
    readonly id: string;
    readonly body: string | null;
    readonly photos: readonly { readonly id: string }[];
  },
>(comments: readonly T[], target: ReportTarget): T[] {
  if (target.kind === "comment") {
    return comments.filter((comment) => comment.id !== target.commentId);
  }
  return comments.flatMap((comment) => {
    if (comment.id !== target.commentId) return [comment];
    const photos = comment.photos.filter((photo) => photo.id !== target.photoId);
    return comment.body === null && photos.length === 0 ? [] : [{ ...comment, photos }];
  });
}
