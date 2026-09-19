import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  fetchArticleDetail,
  fetchArticlesByCategory,
  isLearnCategory,
  LEARN_CATEGORIES,
} from "./learnArticles";

// Builds a stub Supabase client whose query builder chain resolves to the
// given result, regardless of which methods are chained onto it (mirrors the
// shape fetchArticlesByCategory/fetchArticleDetail call).
function stubSupabase(result: { data: unknown; error: unknown }) {
  const builder: Record<string, unknown> & PromiseLike<typeof result> = {
    // The select/eq/order chain itself is awaited directly by
    // fetchArticlesByCategory (no terminal call), so the builder is thenable.
    then: (onfulfilled) => Promise.resolve(result).then(onfulfilled),
  };
  const chain = () => builder;
  builder.select = vi.fn(chain);
  builder.eq = vi.fn(chain);
  builder.order = vi.fn(chain);
  builder.maybeSingle = vi.fn(() => Promise.resolve(result));

  const client = { from: vi.fn(() => builder) };
  return client as unknown as SupabaseClient;
}

describe("isLearnCategory", () => {
  it("accepts every fixed category (covers AC-1)", () => {
    for (const category of LEARN_CATEGORIES) {
      expect(isLearnCategory(category)).toBe(true);
    }
  });

  it("rejects a value outside the fixed set (covers AC-5)", () => {
    expect(isLearnCategory("cocktails")).toBe(false);
    expect(isLearnCategory(null)).toBe(false);
    expect(isLearnCategory(undefined)).toBe(false);
  });
});

describe("fetchArticlesByCategory", () => {
  it("maps published rows to summaries (covers AC-2)", async () => {
    const client = stubSupabase({
      data: [{ id: "1", title: "Jiggers", category: "tools", published_at: "2026-01-01" }],
      error: null,
    });

    const result = await fetchArticlesByCategory(client, "tools");

    expect(result).toEqual([
      { id: "1", title: "Jiggers", category: "tools", publishedAt: "2026-01-01" },
    ]);
  });

  it("returns an empty list rather than an error for a category with no rows (covers AC-2)", async () => {
    const client = stubSupabase({ data: [], error: null });

    const result = await fetchArticlesByCategory(client, "beer");

    expect(result).toEqual([]);
  });

  it("returns an empty list when data is null", async () => {
    const client = stubSupabase({ data: null, error: null });

    const result = await fetchArticlesByCategory(client, "wine");

    expect(result).toEqual([]);
  });

  it("throws the Supabase error instead of swallowing it", async () => {
    const client = stubSupabase({ data: null, error: new Error("boom") });

    await expect(fetchArticlesByCategory(client, "spirits")).rejects.toThrow("boom");
  });
});

describe("fetchArticleDetail", () => {
  it("returns the article when found and published (covers AC-3)", async () => {
    const client = stubSupabase({
      data: {
        id: "1",
        title: "Jiggers",
        category: "tools",
        body_markdown: "## About jiggers",
        published_at: "2026-01-01",
      },
      error: null,
    });

    const result = await fetchArticleDetail(client, "1", "tools");

    expect(result).toEqual({
      id: "1",
      title: "Jiggers",
      category: "tools",
      publishedAt: "2026-01-01",
      bodyMarkdown: "## About jiggers",
    });
  });

  it("returns null on no match, rather than distinguishing why (covers AC-4, AC-5)", async () => {
    const client = stubSupabase({ data: null, error: null });

    const result = await fetchArticleDetail(client, "missing-id", "tools");

    expect(result).toBeNull();
  });

  it("throws the Supabase error instead of swallowing it", async () => {
    const client = stubSupabase({ data: null, error: new Error("boom") });

    await expect(fetchArticleDetail(client, "1", "tools")).rejects.toThrow("boom");
  });
});
