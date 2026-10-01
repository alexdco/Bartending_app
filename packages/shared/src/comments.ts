import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

export const COMMENT_MIN_LENGTH = 1;
export const COMMENT_MAX_LENGTH = 1000;
export const COMMENTS_PAGE_SIZE = 20;

export interface Comment {
  id: string;
  userId: string;
  recipeId: string;
  body: string;
  displayName: string | null;
  createdAt: string;
  updatedAt: string;
  edited: boolean;
}

export type CommentBodyValidationError = "empty" | "too_long";

/**
 * Trims before checking length, matching the DB's own `btrim(body)` check
 * constraint, so a client side rejection and a server side rejection agree
 * on the same input.
 */
export function validateCommentBody(
  rawValue: string,
): { trimmed: string; error: null } | { trimmed: null; error: CommentBodyValidationError } {
  const trimmed = rawValue.trim();

  if (trimmed.length < COMMENT_MIN_LENGTH) {
    return { trimmed: null, error: "empty" };
  }

  if (trimmed.length > COMMENT_MAX_LENGTH) {
    return { trimmed: null, error: "too_long" };
  }

  return { trimmed, error: null };
}

function mapRow(
  row: {
    id: string;
    user_id: string;
    recipe_id: string;
    body: string;
    created_at: string;
    updated_at: string;
  },
  displayName: string | null,
): Comment {
  return {
    id: row.id,
    userId: row.user_id,
    recipeId: row.recipe_id,
    body: row.body,
    displayName,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    edited: row.updated_at > row.created_at,
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
 * row beyond pageLimit and trims it to derive hasMore.
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
    .select("id, user_id, recipe_id, body, created_at, updated_at")
    .eq("recipe_id", recipeId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
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

export type PostCommentError =
  | { reason: CommentBodyValidationError }
  | { reason: "no_session" }
  | { reason: "anonymous_session" }
  | { reason: "request_failed"; message: string };

export type PostCommentResult =
  { data: Comment; error: null } | { data: null; error: PostCommentError };

export async function postComment(
  client: SupabaseClient<Database>,
  recipeId: string,
  rawBody: string,
): Promise<PostCommentResult> {
  const { trimmed, error: validationError } = validateCommentBody(rawBody);

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

  const { data, error } = await client
    .from("comments")
    .insert({ user_id: userId, recipe_id: recipeId, body: trimmed })
    .select("id, user_id, recipe_id, body, created_at, updated_at")
    .single();

  if (error) {
    return { data: null, error: { reason: "request_failed", message: error.message } };
  }

  const displayNames = await fetchDisplayNames(client, [userId]);

  return { data: mapRow(data, displayNames.get(userId) ?? null), error: null };
}

export type EditCommentError =
  | { reason: CommentBodyValidationError }
  | { reason: "not_found_or_not_owner" }
  | { reason: "request_failed"; message: string };

export type EditCommentResult =
  | { data: { body: string; updatedAt: string }; error: null }
  | { data: null; error: EditCommentError };

export async function editComment(
  client: SupabaseClient<Database>,
  commentId: string,
  rawBody: string,
): Promise<EditCommentResult> {
  const { trimmed, error: validationError } = validateCommentBody(rawBody);

  if (validationError) {
    return { data: null, error: { reason: validationError } };
  }

  const { data, error } = await client
    .from("comments")
    .update({ body: trimmed })
    .eq("id", commentId)
    .select("body, updated_at")
    .maybeSingle();

  if (error) {
    return { data: null, error: { reason: "request_failed", message: error.message } };
  }

  if (!data) {
    return { data: null, error: { reason: "not_found_or_not_owner" } };
  }

  return { data: { body: data.body, updatedAt: data.updated_at }, error: null };
}

export type DeleteCommentError =
  { reason: "not_found_or_not_owner" } | { reason: "request_failed"; message: string };

export type DeleteCommentResult =
  { data: true; error: null } | { data: null; error: DeleteCommentError };

export async function deleteComment(
  client: SupabaseClient<Database>,
  commentId: string,
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

  return { data: true, error: null };
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
 * directly (a real foreign key PostgREST can embed, unlike user_display_names).
 */
export async function fetchAllComments(
  client: SupabaseClient<Database>,
  { pageLimit = COMMENTS_PAGE_SIZE, beforeCreatedAt, beforeId }: FetchAllCommentsParams = {},
): Promise<FetchAllCommentsResult> {
  let query = client
    .from("comments")
    .select("id, user_id, recipe_id, body, created_at, updated_at, recipes(name)")
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
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
