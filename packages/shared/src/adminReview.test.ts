import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "./database.types";
import { adminClearModeration, parseAdminReviewPage } from "./adminReview";

const comment = {
  id: "c1",
  user_id: "u1",
  recipe_id: "r1",
  body: "hello",
  created_at: "2026-11-19T10:00:00Z",
  updated_at: "2026-11-19T10:00:00Z",
  moderation_status: "approved",
  photos: [
    {
      id: "p1",
      storage_path: "u1/a.jpg",
      position: 0,
      width: 100,
      height: 80,
      alt_text: null,
      moderation_status: "flagged",
    },
  ],
};

const page: Json = {
  rows: [
    {
      review_group: 0,
      sort_at: "2026-11-19T10:05:00Z",
      recipe_name: "Negroni",
      author_name: "Sam",
      comment,
      targets: [
        {
          target_kind: "comment",
          photo_id: null,
          moderation_status: "approved",
          flag_reason: null,
          flag_categories: [],
          open_report_counts: { spam: 2, bogus: 9 },
          notes: ["ad link"],
        },
        {
          target_kind: "photo",
          photo_id: "p1",
          moderation_status: "flagged",
          flag_reason: "screening",
          flag_categories: ["gore_violence", "made_up"],
          open_report_counts: {},
          notes: [],
        },
      ],
    },
    { review_group: 1, comment: { id: "broken" }, targets: [] },
  ],
  next_cursor: { review_group: 0, sort_at: "2026-11-19T10:05:00Z", id: "c1" },
};

describe("parseAdminReviewPage", () => {
  it("parses rows, targets, and the cursor", () => {
    const result = parseAdminReviewPage(page);
    expect(result.rows).toHaveLength(1);
    const [row] = result.rows;
    expect(row?.recipeName).toBe("Negroni");
    expect(row?.comment.displayName).toBe("Sam");
    expect(row?.comment.photos[0]?.moderationStatus).toBe("flagged");
    expect(row?.reviewGroup).toBe(0);
    expect(row?.targets[0]).toEqual({
      target: { kind: "comment", commentId: "c1" },
      moderationStatus: "approved",
      flagReason: null,
      flagCategories: [],
      openReportCounts: { spam: 2 },
      notes: ["ad link"],
    });
    expect(row?.targets[1]?.target).toEqual({ kind: "photo", commentId: "c1", photoId: "p1" });
    expect(row?.targets[1]?.flagReason).toBe("screening");
    expect(row?.targets[1]?.flagCategories).toEqual(["gore_violence"]);
    expect(result.nextCursor).toEqual({ reviewGroup: 0, sortAt: "2026-11-19T10:05:00Z", id: "c1" });
  });

  it("has no cursor on the last page and tolerates junk", () => {
    expect(parseAdminReviewPage({ rows: [], next_cursor: null })).toEqual({
      rows: [],
      nextCursor: null,
    });
    expect(parseAdminReviewPage(null)).toEqual({ rows: [], nextCursor: null });
  });
});

describe("adminClearModeration", () => {
  function fakeClient(result: { data: unknown; error: { message: string } | null }) {
    const rpc = vi.fn(() => Promise.resolve(result));
    return { client: { rpc } as unknown as SupabaseClient<Database>, rpc };
  }

  it("clears a photo target", async () => {
    const { client, rpc } = fakeClient({ data: { cleared_reports: 3 }, error: null });
    const result = await adminClearModeration(client, {
      kind: "photo",
      commentId: "c1",
      photoId: "p1",
    });
    expect(rpc).toHaveBeenCalledWith("admin_clear_moderation", {
      p_target_kind: "photo",
      p_comment_id: "c1",
      p_photo_id: "p1",
    });
    expect(result).toEqual({ data: { clearedReports: 3 }, error: null });
  });

  it("maps known errors and falls back to request_failed", async () => {
    const notFound = fakeClient({ data: null, error: { message: "not_found" } });
    expect(
      (await adminClearModeration(notFound.client, { kind: "comment", commentId: "c1" })).error,
    ).toEqual({
      reason: "not_found",
    });
    const other = fakeClient({ data: null, error: { message: "boom" } });
    expect(
      (await adminClearModeration(other.client, { kind: "comment", commentId: "c1" })).error
        ?.reason,
    ).toBe("request_failed");
  });
});
