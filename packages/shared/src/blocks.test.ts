import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";
import { blockUser, fetchBlockedUsers, mapBlockError, withoutAuthor } from "./blocks";

describe("mapBlockError", () => {
  it("treats already blocked as success", () => {
    expect(mapBlockError({ code: "23505", message: "duplicate" })).toEqual({
      data: true,
      error: null,
    });
  });

  it("maps self block, refused, and anything else", () => {
    expect(mapBlockError({ code: "23514", message: "check" }).error).toEqual({ reason: "self" });
    expect(mapBlockError({ code: "42501", message: "rls" }).error).toEqual({
      reason: "not_signed_in",
    });
    expect(mapBlockError({ message: "Failed to fetch" }).error).toEqual({
      reason: "request_failed",
      message: "Failed to fetch",
    });
  });
});

describe("blockUser", () => {
  it("inserts only blocked_id", async () => {
    const insert = vi.fn(() => Promise.resolve({ error: null }));
    const client = { from: vi.fn(() => ({ insert })) } as unknown as SupabaseClient<Database>;
    expect(await blockUser(client, "u2")).toEqual({ data: true, error: null });
    expect(insert).toHaveBeenCalledWith({ blocked_id: "u2" });
  });
});

describe("fetchBlockedUsers", () => {
  it("joins display names and keeps a missing name as null", async () => {
    const blocks = [
      { blocked_id: "u2", created_at: "2026-11-19T10:00:00Z" },
      { blocked_id: "u3", created_at: "2026-11-18T10:00:00Z" },
    ];
    const from = vi.fn((table: string) =>
      table === "user_blocks"
        ? { select: () => ({ order: () => Promise.resolve({ data: blocks, error: null }) }) }
        : {
            select: () => ({
              in: () =>
                Promise.resolve({ data: [{ user_id: "u2", display_name: "Sam" }], error: null }),
            }),
          },
    );
    const client = { from } as unknown as SupabaseClient<Database>;

    expect(await fetchBlockedUsers(client)).toEqual([
      { blockedId: "u2", displayName: "Sam", createdAt: "2026-11-19T10:00:00Z" },
      { blockedId: "u3", displayName: null, createdAt: "2026-11-18T10:00:00Z" },
    ]);
  });

  it("skips the name lookup when nobody is blocked", async () => {
    const from = vi.fn(() => ({
      select: () => ({ order: () => Promise.resolve({ data: [], error: null }) }),
    }));
    const client = { from } as unknown as SupabaseClient<Database>;
    expect(await fetchBlockedUsers(client)).toEqual([]);
    expect(from).toHaveBeenCalledOnce();
  });
});

describe("withoutAuthor", () => {
  it("drops every comment by that author", () => {
    const comments = [
      { id: "c1", userId: "u1" },
      { id: "c2", userId: "u2" },
      { id: "c3", userId: "u1" },
    ];
    expect(withoutAuthor(comments, "u1").map((c) => c.id)).toEqual(["c2"]);
  });
});
