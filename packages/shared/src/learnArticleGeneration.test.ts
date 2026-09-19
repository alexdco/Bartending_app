import { describe, expect, it, vi } from "vitest";
import type Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import { generateLearnArticle } from "./learnArticleGeneration";

function stubAnthropic(bodyMarkdown: string | undefined) {
  return {
    messages: {
      parse: vi.fn().mockResolvedValue({ parsed_output: bodyMarkdown ? { bodyMarkdown } : null }),
    },
  } as unknown as Anthropic;
}

function stubSupabase(result: { data: { id: string } | null; error: { message: string } | null }) {
  const insertResult = { select: vi.fn(() => ({ single: vi.fn(() => Promise.resolve(result)) })) };
  const client = { from: vi.fn(() => ({ insert: vi.fn(() => insertResult) })) };
  return client as unknown as SupabaseClient;
}

describe("generateLearnArticle", () => {
  const input = { title: "What Is a Jigger?", category: "tools" as const, topic: "jiggers" };

  it("inserts a new draft row from the generated body (covers AC-7)", async () => {
    const anthropic = stubAnthropic("## About jiggers\n\nBody text.");
    const supabase = stubSupabase({ data: { id: "new-id" }, error: null });

    const result = await generateLearnArticle(supabase, anthropic, input);

    expect(result).toEqual({ id: "new-id" });
    expect(supabase.from).toHaveBeenCalledWith("learn_articles");
  });

  it("rejects a category outside the fixed set before calling the model", async () => {
    const anthropic = stubAnthropic("## Body");
    const supabase = stubSupabase({ data: { id: "new-id" }, error: null });

    await expect(
      generateLearnArticle(supabase, anthropic, { ...input, category: "cocktails" as never }),
    ).rejects.toThrow(/Invalid category/);

    expect(anthropic.messages.parse).not.toHaveBeenCalled();
  });

  it("throws when the model returns no parseable output", async () => {
    const anthropic = stubAnthropic(undefined);
    const supabase = stubSupabase({ data: { id: "new-id" }, error: null });

    await expect(generateLearnArticle(supabase, anthropic, input)).rejects.toThrow(
      /did not return a parseable response/,
    );
  });

  it("throws a wrapped error when the insert fails, rather than swallowing it", async () => {
    const anthropic = stubAnthropic("## Body");
    const supabase = stubSupabase({ data: null, error: { message: "duplicate key" } });

    await expect(generateLearnArticle(supabase, anthropic, input)).rejects.toThrow(
      /Failed to insert learn article draft: duplicate key/,
    );
  });

  it("creates a separate row on each call, never deduping by title (covers AC-8)", async () => {
    const anthropic = stubAnthropic("## Body");
    const supabase = stubSupabase({ data: { id: "row-1" }, error: null });

    const first = await generateLearnArticle(supabase, anthropic, input);
    const second = await generateLearnArticle(supabase, anthropic, input);

    expect(supabase.from).toHaveBeenCalledTimes(2);
    expect(first).toEqual(second); // same stub id per call, but two independent insert calls happened
  });
});
