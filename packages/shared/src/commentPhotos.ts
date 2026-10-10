import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

/**
 * Comment photos (spec 0032). Platform neutral: the web canvas pipeline and
 * the mobile expo-image-manipulator pipeline both produce JPEG bytes, then
 * share the limits, path builder, upload helper, and error mapping here.
 */

export const COMMENT_PHOTOS_BUCKET = "comment-photos";
export const COMMENT_PHOTO_MAX_COUNT = 3;
export const COMMENT_PHOTO_MAX_EDGE = 1600;
export const COMMENT_PHOTO_JPEG_QUALITY = 0.8;
export const COMMENT_PHOTO_MAX_BYTES = 5 * 1024 * 1024;
export const COMMENT_PHOTO_MAX_ORIGINAL_BYTES = 25 * 1024 * 1024;
export const COMMENT_PHOTO_ALT_MAX_LENGTH = 200;
export const COMMENT_PHOTO_DAILY_LIMIT = 30;
export const COMMENT_PHOTO_CACHE_CONTROL = "3600";
export const COMMENT_PHOTO_CONTENT_TYPE = "image/jpeg";

export const COMMENT_PHOTO_ACCEPTED_TYPES: readonly string[] = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
];

const ACCEPTED_EXTENSIONS: readonly string[] = ["jpg", "jpeg", "png", "webp", "heic", "heif"];

export interface CommentPhoto {
  id: string;
  storagePath: string;
  position: number;
  width: number;
  height: number;
  altText: string | null;
}

/** A processed, uploaded photo not yet attached to a comment. */
export interface NewCommentPhoto {
  path: string;
  width: number;
  height: number;
  altText: string | null;
}

export type CommentPhotoOriginalError = "unsupported_type" | "original_too_large";

/**
 * Checks a picked original before any processing (AC-3). Some browsers and
 * pickers report HEIC with an empty type, so the file extension is the
 * fallback.
 */
export function validateCommentPhotoOriginal(original: {
  sizeBytes: number;
  mimeType: string | null;
  fileName?: string | null;
}): CommentPhotoOriginalError | null {
  const mimeType = original.mimeType?.toLowerCase() ?? "";
  const extension = original.fileName?.split(".").pop()?.toLowerCase() ?? "";
  const isAccepted =
    COMMENT_PHOTO_ACCEPTED_TYPES.includes(mimeType) ||
    (mimeType === "" && ACCEPTED_EXTENSIONS.includes(extension));

  if (!isAccepted) {
    return "unsupported_type";
  }

  if (original.sizeBytes > COMMENT_PHOTO_MAX_ORIGINAL_BYTES) {
    return "original_too_large";
  }

  return null;
}

/** Scales so the long edge is at most maxEdge, never up, keeping the aspect ratio. */
export function scaleToMaxEdge(
  width: number,
  height: number,
  maxEdge: number = COMMENT_PHOTO_MAX_EDGE,
): { width: number; height: number } {
  const longEdge = Math.max(width, height);

  if (longEdge <= maxEdge) {
    return { width: Math.round(width), height: Math.round(height) };
  }

  const scale = maxEdge / longEdge;

  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

/** `{user_id}/{uuid}.jpg`, matching the storage policy and the path check constraint. */
export function buildCommentPhotoPath(userId: string, objectId: string): string {
  return `${userId}/${objectId.toLowerCase()}.jpg`;
}

/** Trims; blank becomes null, matching the DB's own normalization. */
export function normalizeCommentPhotoAltText(raw: string | null | undefined): string | null {
  const trimmed = raw?.trim() ?? "";
  return trimmed.length === 0 ? null : trimmed;
}

export function getCommentPhotoUrl(client: SupabaseClient<Database>, storagePath: string): string {
  return client.storage.from(COMMENT_PHOTOS_BUCKET).getPublicUrl(storagePath).data.publicUrl;
}

/**
 * "Photo N of M by <name>" when a photo has no alt text (AC-9). The
 * display name falls back to "Anonymous", same as the comment header.
 */
export function commentPhotoLabel(
  photo: Pick<CommentPhoto, "altText" | "position">,
  photoCount: number,
  displayName: string | null,
): string {
  return (
    photo.altText ?? `Photo ${photo.position + 1} of ${photoCount} by ${displayName ?? "Anonymous"}`
  );
}

export type UploadCommentPhotoError =
  | { reason: "daily_limit" }
  | { reason: "too_large" }
  | { reason: "wrong_type" }
  | { reason: "request_failed"; message: string };

export type UploadCommentPhotoResult =
  { data: { path: string }; error: null } | { data: null; error: UploadCommentPhotoError };

function storageErrorStatus(error: {
  status?: number | string;
  statusCode?: number | string;
}): number | null {
  const status = Number(error.status ?? error.statusCode);
  return Number.isFinite(status) ? status : null;
}

/**
 * Maps a storage upload failure to a reason. The client always uploads into
 * the caller's own folder and blocks guests first, so a policy rejection
 * (403, or 400 with an RLS message on some storage versions) for a signed in
 * user means the daily cap (AC-8).
 */
export function mapUploadError(error: {
  message: string;
  status?: number | string;
  statusCode?: number | string;
}): UploadCommentPhotoError {
  const status = storageErrorStatus(error);
  const message = error.message.toLowerCase();

  if (status === 413 || message.includes("maximum allowed size")) {
    return { reason: "too_large" };
  }

  if (status === 415 || message.includes("mime type")) {
    return { reason: "wrong_type" };
  }

  if (status === 403 || message.includes("row-level security")) {
    return { reason: "daily_limit" };
  }

  return { reason: "request_failed", message: error.message };
}

/**
 * Uploads processed JPEG bytes to `{userId}/{objectId}.jpg`. The caller
 * passes a fresh uuid for every attempt, retries included, since stored
 * files are immutable (`upsert: false`).
 */
export async function uploadCommentPhoto(
  client: SupabaseClient<Database>,
  {
    userId,
    objectId,
    bytes,
  }: { userId: string; objectId: string; bytes: Blob | ArrayBuffer | Uint8Array },
): Promise<UploadCommentPhotoResult> {
  const path = buildCommentPhotoPath(userId, objectId);

  const { error } = await client.storage.from(COMMENT_PHOTOS_BUCKET).upload(path, bytes, {
    contentType: COMMENT_PHOTO_CONTENT_TYPE,
    cacheControl: COMMENT_PHOTO_CACHE_CONTROL,
    upsert: false,
  });

  if (error) {
    return { data: null, error: mapUploadError(error) };
  }

  return { data: { path }, error: null };
}

/**
 * Best effort: a file the client fails to delete (or that a policy keeps
 * because it is still referenced) is left to the daily orphan sweep (AC-12).
 */
export async function removeCommentPhotoFiles(
  client: SupabaseClient<Database>,
  paths: readonly string[],
): Promise<void> {
  if (paths.length === 0) {
    return;
  }

  try {
    await client.storage.from(COMMENT_PHOTOS_BUCKET).remove([...paths]);
  } catch {
    // Swept later.
  }
}

export const COMMENT_RPC_ERROR_REASONS = [
  "not_signed_in",
  "recipe_unavailable",
  "comment_empty",
  "comment_too_long",
  "too_many_photos",
  "invalid_photo",
  "not_found_or_not_owner",
  "not_admin",
  "not_found",
] as const;

export type CommentRpcErrorReason = (typeof COMMENT_RPC_ERROR_REASONS)[number];

export type CommentRpcError =
  { reason: CommentRpcErrorReason } | { reason: "request_failed"; message: string };

/**
 * The comment functions `raise exception '<code>'`, so the code is the whole
 * message. Anything else (network, unexpected Postgres error) is
 * request_failed.
 */
export function mapCommentRpcError(error: { message: string }): CommentRpcError {
  const code = error.message.trim();
  const known = COMMENT_RPC_ERROR_REASONS.find((reason) => reason === code);

  return known ? { reason: known } : { reason: "request_failed", message: error.message };
}
