// Blocking another comment author (spec 0062 AC-14, AC-15). The database does
// the hiding (RLS); these helpers write the caller's own user_blocks rows and
// read the Blocked people list.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

export interface BlockedUser {
  readonly blockedId: string;
  /** null when the person has no display name or their account is gone. */
  readonly displayName: string | null;
  readonly createdAt: string;
}

export type BlockError =
  | { readonly reason: "self" | "not_signed_in" }
  | { readonly reason: "request_failed"; readonly message: string };

export type BlockResult =
  | { readonly data: true; readonly error: null }
  | { readonly data: null; readonly error: BlockError };

const UNIQUE_VIOLATION = "23505";
const CHECK_VIOLATION = "23514";
const INSUFFICIENT_PRIVILEGE = "42501";

/** Pure: a user_blocks insert error into a result. Already blocked is success. */
export function mapBlockError(error: { code?: string; message: string }): BlockResult {
  if (error.code === UNIQUE_VIOLATION) return { data: true, error: null };
  if (error.code === CHECK_VIOLATION) return { data: null, error: { reason: "self" } };
  if (error.code === INSUFFICIENT_PRIVILEGE)
    return { data: null, error: { reason: "not_signed_in" } };
  return { data: null, error: { reason: "request_failed", message: error.message } };
}

/** Blocks the given author for the caller. One way and silent. */
export async function blockUser(
  client: SupabaseClient<Database>,
  blockedId: string,
): Promise<BlockResult> {
  const { error } = await client.from("user_blocks").insert({ blocked_id: blockedId });
  return error ? mapBlockError(error) : { data: true, error: null };
}

/** Removes the caller's block on this person. Unblocking someone not blocked is fine. */
export async function unblockUser(
  client: SupabaseClient<Database>,
  blockedId: string,
): Promise<BlockResult> {
  const { error } = await client.from("user_blocks").delete().eq("blocked_id", blockedId);
  return error
    ? { data: null, error: { reason: "request_failed", message: error.message } }
    : { data: true, error: null };
}

/** The caller's Blocked people list, newest first. Throws on error, like the other list fetches. */
export async function fetchBlockedUsers(client: SupabaseClient<Database>): Promise<BlockedUser[]> {
  const { data, error } = await client
    .from("user_blocks")
    .select("blocked_id, created_at")
    .order("created_at", { ascending: false });
  if (error) throw error;

  const rows = data ?? [];
  if (rows.length === 0) return [];

  const { data: names, error: namesError } = await client
    .from("user_display_names")
    .select("user_id, display_name")
    .in(
      "user_id",
      rows.map((row) => row.blocked_id),
    );
  if (namesError) throw namesError;

  const nameById = new Map((names ?? []).map((row) => [row.user_id, row.display_name]));

  return rows.map((row) => ({
    blockedId: row.blocked_id,
    displayName: nameById.get(row.blocked_id) ?? null,
    createdAt: row.created_at,
  }));
}

/** Pure: a comment list without anything by this author (the optimistic hide after a block). */
export function withoutAuthor<T extends { readonly userId: string }>(
  comments: readonly T[],
  authorId: string,
): T[] {
  return comments.filter((comment) => comment.userId !== authorId);
}
