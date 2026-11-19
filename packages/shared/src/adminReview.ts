// Admin review queue for comment safety (spec 0062 AC-11, AC-12). Web only
// today (admin stays web only, spec 0028), but platform neutral like the rest.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "./database.types";
import { parseCommentFromJson, type Comment } from "./comments";
import {
  parseModerationStatus,
  REPORT_REASONS,
  type ModerationStatus,
  type ReportReason,
  type ReportTarget,
} from "./moderation";

export const FLAG_REASONS = ["screening", "screening_failed", "reports"] as const;
export type FlagReason = (typeof FLAG_REASONS)[number];

export const SCREENING_CATEGORIES = [
  "nudity_sexual",
  "gore_violence",
  "hate_symbols",
  "illegal_drugs",
  "minor_with_alcohol",
  "personal_info",
] as const;
export type ScreeningCategory = (typeof SCREENING_CATEGORIES)[number];

export const ADMIN_REVIEW_PAGE_SIZE = 20;

/** One thing in a review row the admin can Clear or Remove on its own. */
export interface AdminReviewTarget {
  readonly target: ReportTarget;
  readonly moderationStatus: ModerationStatus;
  readonly flagReason: FlagReason | null;
  readonly flagCategories: readonly ScreeningCategory[];
  readonly openReportCounts: Readonly<Partial<Record<ReportReason, number>>>;
  readonly notes: readonly string[];
}

export interface AdminReviewRow {
  readonly comment: Comment;
  readonly recipeName: string;
  /** 0: something is hidden. 1: only open reports. */
  readonly reviewGroup: number;
  readonly targets: readonly AdminReviewTarget[];
}

export interface AdminReviewCursor {
  readonly reviewGroup: number;
  readonly sortAt: string;
  readonly id: string;
}

export interface AdminReviewPage {
  readonly rows: readonly AdminReviewRow[];
  readonly nextCursor: AdminReviewCursor | null;
}

type JsonRecord = { [key: string]: Json | undefined };

const isRecord = (value: Json | undefined): value is JsonRecord =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const asString = (value: Json | undefined): string | null =>
  typeof value === "string" ? value : null;

const asStrings = (value: Json | undefined): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];

const pick = <T extends string>(allowed: readonly T[], value: string | null): T | null =>
  value !== null && (allowed as readonly string[]).includes(value) ? (value as T) : null;

function parseTarget(value: Json, commentId: string): AdminReviewTarget | null {
  if (!isRecord(value)) return null;
  const kind = asString(value.target_kind);
  const photoId = asString(value.photo_id);

  const target: ReportTarget | null =
    kind === "comment"
      ? { kind: "comment", commentId }
      : kind === "photo" && photoId !== null
        ? { kind: "photo", commentId, photoId }
        : null;
  if (!target) return null;

  const counts = isRecord(value.open_report_counts) ? value.open_report_counts : {};
  const openReportCounts = Object.fromEntries(
    REPORT_REASONS.flatMap((reason) => {
      const n = counts[reason];
      return typeof n === "number" && n > 0 ? [[reason, n]] : [];
    }),
  ) as Partial<Record<ReportReason, number>>;

  return {
    target,
    moderationStatus: parseModerationStatus(value.moderation_status),
    flagReason: pick(FLAG_REASONS, asString(value.flag_reason)),
    flagCategories: asStrings(value.flag_categories).flatMap((category) => {
      const known = pick(SCREENING_CATEGORIES, category);
      return known ? [known] : [];
    }),
    openReportCounts,
    notes: asStrings(value.notes),
  };
}

function parseRow(value: Json): AdminReviewRow | null {
  if (!isRecord(value) || value.comment === undefined) return null;
  const comment = parseCommentFromJson(value.comment, asString(value.author_name));
  if (!comment) return null;

  const targets = Array.isArray(value.targets)
    ? value.targets.flatMap((target) => {
        const parsed = parseTarget(target, comment.id);
        return parsed ? [parsed] : [];
      })
    : [];

  return {
    comment,
    recipeName: asString(value.recipe_name) ?? "",
    reviewGroup: typeof value.review_group === "number" ? value.review_group : 1,
    targets,
  };
}

/** Pure: the queue function's jsonb page into typed rows (bad rows are skipped). */
export function parseAdminReviewPage(value: Json): AdminReviewPage {
  if (!isRecord(value)) return { rows: [], nextCursor: null };

  const rows = Array.isArray(value.rows)
    ? value.rows.flatMap((row) => {
        const parsed = parseRow(row);
        return parsed ? [parsed] : [];
      })
    : [];

  const cursor = isRecord(value.next_cursor) ? value.next_cursor : null;
  const reviewGroup =
    cursor && typeof cursor.review_group === "number" ? cursor.review_group : null;
  const sortAt = cursor ? asString(cursor.sort_at) : null;
  const id = cursor ? asString(cursor.id) : null;

  return {
    rows,
    nextCursor:
      reviewGroup !== null && sortAt !== null && id !== null ? { reviewGroup, sortAt, id } : null,
  };
}

/** One page of the Needs review queue. Throws on error, like the other list fetches. */
export async function fetchAdminReviewQueue(
  client: SupabaseClient<Database>,
  cursor: AdminReviewCursor | null = null,
  limit: number = ADMIN_REVIEW_PAGE_SIZE,
): Promise<AdminReviewPage> {
  const { data, error } = await client.rpc("admin_review_queue", {
    p_limit: limit,
    ...(cursor
      ? {
          p_cursor_group: cursor.reviewGroup,
          p_cursor_sort_at: cursor.sortAt,
          p_cursor_id: cursor.id,
        }
      : {}),
  });
  if (error) throw error;
  return parseAdminReviewPage(data);
}

/** The nav badge: distinct comments the queue lists. Throws on error. */
export async function fetchAdminReviewCount(client: SupabaseClient<Database>): Promise<number> {
  const { data, error } = await client.rpc("admin_review_count");
  if (error) throw error;
  return typeof data === "number" ? data : 0;
}

export type AdminClearError =
  | { readonly reason: "not_admin" | "not_found" | "invalid_input" }
  | { readonly reason: "request_failed"; readonly message: string };

export type AdminClearResult =
  | { readonly data: { readonly clearedReports: number }; readonly error: null }
  | { readonly data: null; readonly error: AdminClearError };

/** Clear: approves this one target and resolves its open reports (AC-12). */
export async function adminClearModeration(
  client: SupabaseClient<Database>,
  target: ReportTarget,
): Promise<AdminClearResult> {
  const { data, error } = await client.rpc("admin_clear_moderation", {
    p_target_kind: target.kind,
    p_comment_id: target.commentId,
    ...(target.kind === "photo" ? { p_photo_id: target.photoId } : {}),
  });

  if (error) {
    const code = error.message.trim();
    return code === "not_admin" || code === "not_found" || code === "invalid_input"
      ? { data: null, error: { reason: code } }
      : { data: null, error: { reason: "request_failed", message: error.message } };
  }

  const cleared =
    isRecord(data) && typeof data.cleared_reports === "number" ? data.cleared_reports : 0;
  return { data: { clearedReports: cleared }, error: null };
}
