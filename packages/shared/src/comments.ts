import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "./database.types";
import {
  COMMENT_PHOTO_MAX_COUNT,
  mapCommentRpcError,
  normalizeCommentPhotoAltText,
  removeCommentPhotoFiles,
  type CommentPhoto,
  type CommentRpcError,
  type NewCommentPhoto,
} from "./commentPhotos";

export const COMMENT_MIN_LENGTH = 1;
export const COMMENT_MAX_LENGTH = 1000;
export const COMMENTS_PAGE_SIZE = 20;

export interface Comment {
  id: string;
  userId: string;
  recipeId: string;
  /** null means a photo only comment (spec 0032). */
  body: string | null;
  photos: CommentPhoto[];
  displayName: string | null;
  createdAt: string;
  updatedAt: string;
  edited: boolean;
}

export type CommentBodyValidationError = "empty" | "too_long";

/**
 * Trims before checking length, matching the DB's own `btrim(body)` check
 * constraint, so a client side rejection and a server side rejection agree
 * on the same input. A blank body is allowed (as null) only when the
 * comment has at least one photo (spec 0032 AC-2).
 */
export function validateCommentBody(
  rawValue: string,
  { photoCount = 0 }: { photoCount?: number } = {},
): { trimmed: string | null; error: null } | { trimmed: null; error: CommentBodyValidationError } {
  const trimmed = rawValue.trim();

  if (trimmed.length < COMMENT_MIN_LENGTH) {
    return photoCount > 0 ? { trimmed: null, error: null } : { trimmed: null, error: "empty" };
  }

  if (trimmed.length > COMMENT_MAX_LENGTH) {
    return { trimmed: null, error: "too_long" };
  }

  return { trimmed, error: null };
}

interface CommentPhotoRow {
  id: string;
  storage_path: string;
  position: number;
  width: number;
  height: number;
  alt_text: string | null;
}

interface CommentRow {
  id: string;
  user_id: string;
  recipe_id: string;
  body: string | null;
  created_at: string;
  updated_at: string;
  comment_photos: CommentPhotoRow[];
}

const COMMENT_SELECT =
  "id, user_id, recipe_id, body, created_at, updated_at, comment_photos(id, storage_path, position, width, height, alt_text)";

function mapPhotoRow(row: CommentPhotoRow): CommentPhoto {
  return {
    id: row.id,
    storagePath: row.storage_path,
    position: row.position,
    width: row.width,
    height: row.height,
    altText: row.alt_text,
  };
}

function mapRow(row: CommentRow, displayName: string | null): Comment {
  return {
    id: row.id,
    userId: row.user_id,
    recipeId: row.recipe_id,
    body: row.body,
    photos: [...row.comment_photos].sort((a, b) => a.position - b.position).map(mapPhotoRow),
    displayName,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    edited: row.updated_at > row.created_at,
  };
}

function isRecord(value: Json | undefined): value is { [key: string]: Json | undefined } {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asString(value: Json | undefined): string | null {
  return typeof value === "string" ? value : null;
}

function asNumber(value: Json | undefined): number | null {
  return typeof value === "number" ? value : null;
}

function parsePhotoJson(value: Json): CommentPhotoRow | null {
  if (!isRecord(value)) return null;
  const id = asString(value.id);
  const storagePath = asString(value.storage_path);
  const position = asNumber(value.position);
  const width = asNumber(value.width);
  const height = asNumber(value.height);

  if (
    id === null ||
    storagePath === null ||
    position === null ||
    width === null ||
    height === null
  ) {
    return null;
  }

  return {
    id,
    storage_path: storagePath,
    position,
    width,
    height,
    alt_text: asString(value.alt_text),
  };
}

/** Parses the jsonb shape post_comment / edit_comment return. */
function parseCommentJson(value: Json): { row: CommentRow; removedPaths: string[] } | null {
  if (!isRecord(value)) return null;
  const id = asString(value.id);
  const userId = asString(value.user_id);
  const recipeId = asString(value.recipe_id);
  const createdAt = asString(value.created_at);
  const updatedAt = asString(value.updated_at);
  const photosJson = Array.isArray(value.photos) ? value.photos : [];
  const removedJson = Array.isArray(value.removed_paths) ? value.removed_paths : [];

  if (
    id === null ||
    userId === null ||
    recipeId === null ||
    createdAt === null ||
    updatedAt === null
  ) {
    return null;
  }

  const photos = photosJson.map(parsePhotoJson);
  if (photos.some((photo) => photo === null)) return null;

  return {
    row: {
      id,
      user_id: userId,
      recipe_id: recipeId,
      body: asString(value.body),
      created_at: createdAt,
      updated_at: updatedAt,
      comment_photos: photos.filter((photo): photo is CommentPhotoRow => photo !== null),
    },
    removedPaths: removedJson.filter((path): path is string => typeof path === "string"),
  };
}

/**
 * user_display_names is a view, not a table comments has a foreign key to,
 * so PostgREST cannot auto-embed it in the comments select; fetched as a
 * second query and merged client side instead.
 */
async function fetchDisplayNames(
  client: SupabaseClient<Database>,
  userIds: string[],
): Promise<Map<string, string | null>> {
  const uniqueUserIds = [...new Set(userIds)];

  if (uniqueUserIds.length === 0) {
    return new Map();
  }

  const { data, error } = await client
    .from("user_display_names")
    .select("user_id, display_name")
    .in("user_id", uniqueUserIds);

  if (error) {
    throw error;
  }

  const byUserId = new Map<string, string | null>();

  for (const row of data ?? []) {
    if (row.user_id) {
      byUserId.set(row.user_id, row.display_name);
    }
  }

  return byUserId;
}

export interface FetchRecipeCommentsParams {
  recipeId: string;
  pageLimit?: number;
  beforeCreatedAt?: string;
  beforeId?: string;
}

export interface FetchRecipeCommentsResult {
  comments: Comment[];
  hasMore: boolean;
}

/**
 * Keyset paginated (not offset): a comment posted while a user is scrolling
 * never shifts or duplicates already loaded rows (AC-7). Requests one extra
 * row beyond pageLimit and trims it to derive hasMore. Photos are embedded
 * ordered by position (spec 0032).
 */
export async function fetchRecipeComments(
  client: SupabaseClient<Database>,
  {
    recipeId,
    pageLimit = COMMENTS_PAGE_SIZE,
    beforeCreatedAt,
    beforeId,
  }: FetchRecipeCommentsParams,
): Promise<FetchRecipeCommentsResult> {
  let query = client
    .from("comments")
    .select(COMMENT_SELECT)
    .eq("recipe_id", recipeId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .order("position", { referencedTable: "comment_photos" })
    .limit(pageLimit + 1);

  if (beforeCreatedAt && beforeId) {
    query = query.or(
      `created_at.lt.${beforeCreatedAt},and(created_at.eq.${beforeCreatedAt},id.lt.${beforeId})`,
    );
  }

  const { data, error } = await query;

  if (error) {
    throw error;
  }

  const rows = data ?? [];
  const hasMore = rows.length > pageLimit;
  const page = hasMore ? rows.slice(0, pageLimit) : rows;

  const displayNames = await fetchDisplayNames(
    client,
    page.map((row) => row.user_id),
  );

  return {
    comments: page.map((row) => mapRow(row, displayNames.get(row.user_id) ?? null)),
    hasMore,
  };
}

function toPhotoInput(photo: NewCommentPhoto): Json {
  return {
    path: photo.path,
    width: photo.width,
    height: photo.height,
    alt_text: normalizeCommentPhotoAltText(photo.altText),
  };
}

export type PostCommentError =
  | { reason: CommentBodyValidationError }
  | { reason: "no_session" }
  | { reason: "anonymous_session" }
  | CommentRpcError;

export type PostCommentResult =
  { data: Comment; error: null } | { data: null; error: PostCommentError };

/**
 * Text, photos (already uploaded), or both, created atomically through the
 * post_comment function (spec 0032). The direct table insert from spec 0027
 * stays in the database only for older installed builds.
 */
export async function postComment(
  client: SupabaseClient<Database>,
  recipeId: string,
  { body: rawBody, photos = [] }: { body: string; photos?: readonly NewCommentPhoto[] },
): Promise<PostCommentResult> {
  if (photos.length > COMMENT_PHOTO_MAX_COUNT) {
    return { data: null, error: { reason: "too_many_photos" } };
  }

  const { trimmed, error: validationError } = validateCommentBody(rawBody, {
    photoCount: photos.length,
  });

  if (validationError) {
    return { data: null, error: { reason: validationError } };
  }

  const { data: sessionData, error: sessionError } = await client.auth.getSession();

  if (sessionError || !sessionData.session?.user.id) {
    return { data: null, error: { reason: "no_session" } };
  }

  if (sessionData.session.user.is_anonymous) {
    return { data: null, error: { reason: "anonymous_session" } };
  }

  const userId = sessionData.session.user.id;

  const { data, error } = await client.rpc("post_comment", {
    p_recipe_id: recipeId,
    ...(trimmed === null ? {} : { p_body: trimmed }),
    p_photos: photos.map(toPhotoInput),
  });

  if (error) {
    return { data: null, error: mapCommentRpcError(error) };
  }

  const parsed = parseCommentJson(data);

  if (!parsed) {
    return {
      data: null,
      error: { reason: "request_failed", message: "Unexpected post_comment response" },
    };
  }

  const displayNames = await fetchDisplayNames(client, [userId]);

  return { data: mapRow(parsed.row, displayNames.get(userId) ?? null), error: null };
}

/**
 * One entry of an edit's complete final photo list: an existing photo kept
 * by id (with possibly new alt text), or a newly uploaded one.
 */
export type EditCommentPhotoInput =
  { kind: "existing"; id: string; altText: string | null } | ({ kind: "new" } & NewCommentPhoto);

export type EditCommentError = { reason: CommentBodyValidationError } | CommentRpcError;

export type EditCommentResult =
  | {
      data: Pick<Comment, "body" | "photos" | "updatedAt" | "edited">;
      error: null;
    }
  | { data: null; error: EditCommentError };

/**
 * A full replacement through edit_comment: the body (blank clears it) and
 * the complete final ordered photo list. Files for removed photos are
 * deleted from storage right after (AC-5); any that fail are swept later.
 */
export async function editComment(
  client: SupabaseClient<Database>,
  commentId: string,
  { body: rawBody, photos }: { body: string; photos: readonly EditCommentPhotoInput[] },
): Promise<EditCommentResult> {
  if (photos.length > COMMENT_PHOTO_MAX_COUNT) {
    return { data: null, error: { reason: "too_many_photos" } };
  }

  const { trimmed, error: validationError } = validateCommentBody(rawBody, {
    photoCount: photos.length,
  });

  if (validationError) {
    return { data: null, error: { reason: validationError } };
  }

  const { data, error } = await client.rpc("edit_comment", {
    p_comment_id: commentId,
    // A null body clears the text; the generated type marks it as string only.
    p_body: trimmed as string,
    p_photos: photos.map((photo) =>
      photo.kind === "existing"
        ? { id: photo.id, alt_text: normalizeCommentPhotoAltText(photo.altText) }
        : toPhotoInput(photo),
    ),
  });

  if (error) {
    return { data: null, error: mapCommentRpcError(error) };
  }

  const parsed = parseCommentJson(data);

  if (!parsed) {
    return {
      data: null,
      error: { reason: "request_failed", message: "Unexpected edit_comment response" },
    };
  }

  await removeCommentPhotoFiles(client, parsed.removedPaths);

  const comment = mapRow(parsed.row, null);

  return {
    data: {
      body: comment.body,
      photos: comment.photos,
      updatedAt: comment.updatedAt,
      edited: comment.edited,
    },
    error: null,
  };
}

export type DeleteCommentError =
  { reason: "not_found_or_not_owner" } | { reason: "request_failed"; message: string };

export type DeleteCommentResult =
  { data: true; error: null } | { data: null; error: DeleteCommentError };

/**
 * Deletes the row (photo rows cascade), then the photo files the caller
 * already loaded with the comment (AC-6). A stale list, e.g. photos added
 * from another device, leaves the rest to the orphan sweep.
 */
export async function deleteComment(
  client: SupabaseClient<Database>,
  commentId: string,
  photoPaths: readonly string[] = [],
): Promise<DeleteCommentResult> {
  const { data, error } = await client
    .from("comments")
    .delete()
    .eq("id", commentId)
    .select("id")
    .maybeSingle();

  if (error) {
    return { data: null, error: { reason: "request_failed", message: error.message } };
  }

  if (!data) {
    return { data: null, error: { reason: "not_found_or_not_owner" } };
  }

  await removeCommentPhotoFiles(client, photoPaths);

  return { data: true, error: null };
}

export type AdminDeleteCommentPhotoResult =
  { data: { commentDeleted: boolean }; error: null } | { data: null; error: CommentRpcError };

/**
 * Admin only: removes one photo; if that leaves the comment with no text and
 * no photos, the comment is deleted too (AC-11). The file is removed from
 * storage right after.
 */
export async function adminDeleteCommentPhoto(
  client: SupabaseClient<Database>,
  photoId: string,
): Promise<AdminDeleteCommentPhotoResult> {
  const { data, error } = await client.rpc("admin_delete_comment_photo", { p_photo_id: photoId });

  if (error) {
    return { data: null, error: mapCommentRpcError(error) };
  }

  if (!isRecord(data)) {
    return {
      data: null,
      error: {
        reason: "request_failed",
        message: "Unexpected admin_delete_comment_photo response",
      },
    };
  }

  const removedPaths = Array.isArray(data.removed_paths)
    ? data.removed_paths.filter((path): path is string => typeof path === "string")
    : [];

  await removeCommentPhotoFiles(client, removedPaths);

  return { data: { commentDeleted: data.comment_deleted === true }, error: null };
}

/**
 * Whether the given signed in user's own user_preferences.is_admin is true.
 * Used server side to gate the admin comments page before any comment data
 * loads (spec 0028 AC-4). A missing row or a request error is treated as
 * not-admin: fail closed, never an implicit pass.
 */
export async function isAdmin(client: SupabaseClient<Database>, userId: string): Promise<boolean> {
  const { data, error } = await client
    .from("user_preferences")
    .select("is_admin")
    .eq("user_id", userId)
    .maybeSingle();

  if (error || !data) {
    return false;
  }

  return data.is_admin;
}

export interface AdminComment extends Comment {
  recipeName: string;
}

export interface FetchAllCommentsParams {
  pageLimit?: number;
  beforeCreatedAt?: string;
  beforeId?: string;
}

export interface FetchAllCommentsResult {
  comments: AdminComment[];
  hasMore: boolean;
}

/**
 * Admin scoped equivalent of fetchRecipeComments: every comment across every
 * recipe, newest first, same keyset pagination shape. Joins recipes(name)
 * directly (a real foreign key PostgREST can embed, unlike user_display_names),
 * and embeds photos for the admin thumbnails (spec 0032 AC-11).
 */
export async function fetchAllComments(
  client: SupabaseClient<Database>,
  { pageLimit = COMMENTS_PAGE_SIZE, beforeCreatedAt, beforeId }: FetchAllCommentsParams = {},
): Promise<FetchAllCommentsResult> {
  let query = client
    .from("comments")
    .select(`${COMMENT_SELECT}, recipes(name)`)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .order("position", { referencedTable: "comment_photos" })
    .limit(pageLimit + 1);

  if (beforeCreatedAt && beforeId) {
    query = query.or(
      `created_at.lt.${beforeCreatedAt},and(created_at.eq.${beforeCreatedAt},id.lt.${beforeId})`,
    );
  }

  const { data, error } = await query;

  if (error) {
    throw error;
  }

  const rows = data ?? [];
  const hasMore = rows.length > pageLimit;
  const page = hasMore ? rows.slice(0, pageLimit) : rows;

  const displayNames = await fetchDisplayNames(
    client,
    page.map((row) => row.user_id),
  );

  return {
    comments: page.map((row) => ({
      ...mapRow(row, displayNames.get(row.user_id) ?? null),
      recipeName: row.recipes?.name ?? "Unknown recipe",
    })),
    hasMore,
  };
}
