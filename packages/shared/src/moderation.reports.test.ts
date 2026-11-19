import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";
import {
  mapReportError,
  normalizeReportNote,
  reportContent,
  validateReportNote,
  withoutReportedTarget,
} from "./moderation";

function fakeClient(result: { data: unknown; error: { message: string } | null }) {
  const rpc = vi.fn(() => Promise.resolve(result));
  return { client: { rpc } as unknown as SupabaseClient<Database>, rpc };
}

describe("report notes", () => {
  it("trims and turns blank into null", () => {
    expect(normalizeReportNote("  rude  ")).toBe("rude");
    expect(normalizeReportNote("   ")).toBeNull();
    expect(normalizeReportNote(undefined)).toBeNull();
  });

  it("allows 500 characters and rejects 501", () => {
    expect(validateReportNote("x".repeat(500))).toBeNull();
    expect(validateReportNote(` ${"x".repeat(500)} `)).toBeNull();
    expect(validateReportNote("x".repeat(501))).toBe("too_long");
  });
});

describe("mapReportError", () => {
  it("maps each raised code, and anything else to request_failed", () => {
    for (const code of [
      "invalid_input",
      "not_signed_in",
      "not_found",
      "own_content",
      "already_reported",
      "report_limit",
    ]) {
      expect(mapReportError({ message: code })).toEqual({ reason: code });
    }
    expect(mapReportError({ message: "Failed to fetch" })).toEqual({
      reason: "request_failed",
      message: "Failed to fetch",
    });
  });
});

describe("reportContent", () => {
  it("sends a photo report with its trimmed note", async () => {
    const { client, rpc } = fakeClient({
      data: { report_id: "r1", became_hidden: false },
      error: null,
    });
    const result = await reportContent(client, {
      target: { kind: "photo", commentId: "c1", photoId: "p1" },
      reason: "offensive",
      note: "  rude ",
    });
    expect(rpc).toHaveBeenCalledWith("report_content", {
      p_target_kind: "photo",
      p_comment_id: "c1",
      p_photo_id: "p1",
      p_reason: "offensive",
      p_note: "rude",
    });
    expect(result).toEqual({ data: { reportId: "r1", becameHidden: false }, error: null });
  });

  it("omits the photo id and a blank note on a comment report", async () => {
    const { client, rpc } = fakeClient({
      data: { report_id: "r1", became_hidden: false },
      error: null,
    });
    await reportContent(client, {
      target: { kind: "comment", commentId: "c1" },
      reason: "spam",
      note: " ",
    });
    expect(rpc).toHaveBeenCalledWith("report_content", {
      p_target_kind: "comment",
      p_comment_id: "c1",
      p_reason: "spam",
    });
  });

  it("calls onBecameHidden with ids only when the report flagged the target", async () => {
    const onBecameHidden = vi.fn();
    const { client } = fakeClient({ data: { report_id: "r3", became_hidden: true }, error: null });
    await reportContent(
      client,
      {
        target: { kind: "photo", commentId: "c1", photoId: "p1" },
        reason: "sexual",
        note: "secret",
      },
      { onBecameHidden },
    );
    expect(onBecameHidden).toHaveBeenCalledOnce();
    expect(onBecameHidden).toHaveBeenCalledWith({
      reportId: "r3",
      targetKind: "photo",
      commentId: "c1",
      photoId: "p1",
    });
  });

  it("does not call onBecameHidden otherwise", async () => {
    const onBecameHidden = vi.fn();
    const { client } = fakeClient({ data: { report_id: "r1", became_hidden: false }, error: null });
    await reportContent(
      client,
      { target: { kind: "comment", commentId: "c1" }, reason: "spam" },
      { onBecameHidden },
    );
    expect(onBecameHidden).not.toHaveBeenCalled();
  });

  it("rejects a long note without calling the server", async () => {
    const { client, rpc } = fakeClient({ data: null, error: null });
    const result = await reportContent(client, {
      target: { kind: "comment", commentId: "c1" },
      reason: "other",
      note: "x".repeat(501),
    });
    expect(rpc).not.toHaveBeenCalled();
    expect(result).toEqual({ data: null, error: { reason: "invalid_input" } });
  });

  it("maps a raised code", async () => {
    const { client } = fakeClient({ data: null, error: { message: "already_reported" } });
    const result = await reportContent(client, {
      target: { kind: "comment", commentId: "c1" },
      reason: "spam",
    });
    expect(result).toEqual({ data: null, error: { reason: "already_reported" } });
  });

  it("treats an unexpected response as request_failed", async () => {
    const { client } = fakeClient({ data: null, error: null });
    const result = await reportContent(client, {
      target: { kind: "comment", commentId: "c1" },
      reason: "spam",
    });
    expect(result.error?.reason).toBe("request_failed");
  });
});

describe("withoutReportedTarget", () => {
  const comments = [
    { id: "c1", body: "hi", photos: [{ id: "p1" }, { id: "p2" }] },
    { id: "c2", body: null, photos: [{ id: "p3" }] },
  ];

  it("drops the whole comment on a comment report", () => {
    expect(
      withoutReportedTarget(comments, { kind: "comment", commentId: "c1" }).map((c) => c.id),
    ).toEqual(["c2"]);
  });

  it("drops only the photo on a photo report", () => {
    const result = withoutReportedTarget(comments, {
      kind: "photo",
      commentId: "c1",
      photoId: "p1",
    });
    expect(result[0]?.photos).toEqual([{ id: "p2" }]);
    expect(result).toHaveLength(2);
  });

  it("drops a photo only comment left with nothing to show", () => {
    const result = withoutReportedTarget(comments, {
      kind: "photo",
      commentId: "c2",
      photoId: "p3",
    });
    expect(result.map((c) => c.id)).toEqual(["c1"]);
  });
});
