import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchProfile, updateBartenderModeEnabled } from "./preferences";

function stubSession(
  session: { user: { id: string; is_anonymous?: boolean } } | null,
  error: unknown = null,
) {
  return vi.fn().mockResolvedValue({ data: { session }, error });
}

function stubSupabase(options: {
  session?: { user: { id: string; is_anonymous?: boolean } } | null;
  sessionError?: unknown;
  upsertError?: { message: string } | null;
  profileRow?: Record<string, unknown> | null;
  profileError?: unknown;
}) {
  const upsert = vi.fn().mockResolvedValue({ error: options.upsertError ?? null });
  const maybeSingle = vi
    .fn()
    .mockResolvedValue({ data: options.profileRow ?? null, error: options.profileError ?? null });

  const client = {
    auth: { getSession: stubSession(options.session ?? null, options.sessionError) },
    from: vi.fn(() => ({
      select: vi.fn(() => ({ maybeSingle })),
      upsert,
    })),
  };

  return client as unknown as SupabaseClient;
}

describe("fetchProfile", () => {
  it("defaults bartenderModeEnabled to true when the column is absent (covers AC-1)", async () => {
    const client = stubSupabase({
      profileRow: { theme: "dark", display_name: null, locale: null },
    });

    const profile = await fetchProfile(client);

    expect(profile.bartenderModeEnabled).toBe(true);
  });

  it("reads a stored false value (covers AC-1)", async () => {
    const client = stubSupabase({
      profileRow: {
        theme: "dark",
        display_name: null,
        locale: null,
        bartender_mode_enabled: false,
      },
    });

    const profile = await fetchProfile(client);

    expect(profile.bartenderModeEnabled).toBe(false);
  });
});

describe("updateBartenderModeEnabled", () => {
  it("writes the new value for a linked session (covers AC-1, AC-9)", async () => {
    const client = stubSupabase({ session: { user: { id: "user-1", is_anonymous: false } } });

    const result = await updateBartenderModeEnabled(client, false);

    expect(result).toEqual({ data: { bartenderModeEnabled: false }, error: null });
  });

  it("rejects an anonymous session without writing (covers AC-9)", async () => {
    const client = stubSupabase({ session: { user: { id: "anon-1", is_anonymous: true } } });

    const result = await updateBartenderModeEnabled(client, true);

    expect(result).toEqual({ data: null, error: { reason: "anonymous_session" } });
    expect(client.from).not.toHaveBeenCalled();
  });

  it("rejects when there is no session", async () => {
    const client = stubSupabase({ session: null });

    const result = await updateBartenderModeEnabled(client, true);

    expect(result).toEqual({ data: null, error: { reason: "no_session" } });
  });

  it("returns request_failed (not a throw) when the write errors, so the caller can revert silently (covers AC-8)", async () => {
    const client = stubSupabase({
      session: { user: { id: "user-1", is_anonymous: false } },
      upsertError: { message: "network error" },
    });

    const result = await updateBartenderModeEnabled(client, false);

    expect(result).toEqual({
      data: null,
      error: { reason: "request_failed", message: "network error" },
    });
  });
});
