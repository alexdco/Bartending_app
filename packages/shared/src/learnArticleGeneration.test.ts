import { describe, expect, it, vi } from "vitest";
import type Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  ACCURACY_RULES,
  buildLearnArticlePrompt,
  generateLearnArticle,
} from "./learnArticleGeneration";
import { SUMMARY_MAX_CHARS, SUMMARY_MIN_CHARS } from "./learnArticles";

const VALID_SUMMARY =
  "What a jigger is, why measuring helps, the common sizes, and how to use one the right way.";

function stubAnthropic(bodyMarkdown: string | undefined, summary = VALID_SUMMARY) {
  return {
    messages: {
      parse: vi
        .fn()
        .mockResolvedValue({ parsed_output: bodyMarkdown ? { bodyMarkdown, summary } : null }),
    },
  } as unknown as Anthropic;
}

function stubSupabase(result: { data: { id: string } | null; error: { message: string } | null }) {
  const insert = vi.fn(() => ({
    select: vi.fn(() => ({ single: vi.fn(() => Promise.resolve(result)) })),
  }));
  const client = { from: vi.fn(() => ({ insert })) };
  return { supabase: client as unknown as SupabaseClient, insert };
}

describe("generateLearnArticle", () => {
  const input = { title: "What Is a Jigger?", category: "tools" as const, topic: "jiggers" };

  it("inserts a new draft row from the generated body and summary (covers AC-7, spec 0033 AC-9)", async () => {
    const anthropic = stubAnthropic("## About jiggers\n\nBody text.");
    const { supabase, insert } = stubSupabase({ data: { id: "new-id" }, error: null });

    const result = await generateLearnArticle(supabase, anthropic, input);

    expect(result).toEqual({ id: "new-id" });
    expect(supabase.from).toHaveBeenCalledWith("learn_articles");
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({ summary: VALID_SUMMARY, status: "draft" }),
    );
  });

  it("rejects a category outside the fixed set before calling the model", async () => {
    const anthropic = stubAnthropic("## Body");
    const { supabase } = stubSupabase({ data: { id: "new-id" }, error: null });

    await expect(
      generateLearnArticle(supabase, anthropic, { ...input, category: "cocktails" as never }),
    ).rejects.toThrow(/Invalid category/);

    expect(anthropic.messages.parse).not.toHaveBeenCalled();
  });

  it("throws when the model returns no parseable output", async () => {
    const anthropic = stubAnthropic(undefined);
    const { supabase } = stubSupabase({ data: { id: "new-id" }, error: null });

    await expect(generateLearnArticle(supabase, anthropic, input)).rejects.toThrow(
      /did not return a parseable response/,
    );
  });

  it("throws a wrapped error when the insert fails, rather than swallowing it", async () => {
    const anthropic = stubAnthropic("## Body");
    const { supabase } = stubSupabase({ data: null, error: { message: "duplicate key" } });

    await expect(generateLearnArticle(supabase, anthropic, input)).rejects.toThrow(
      /Failed to insert learn article draft: duplicate key/,
    );
  });

  it("creates a separate row on each call, never deduping by title (covers AC-8)", async () => {
    const anthropic = stubAnthropic("## Body");
    const { supabase } = stubSupabase({ data: { id: "row-1" }, error: null });

    const first = await generateLearnArticle(supabase, anthropic, input);
    const second = await generateLearnArticle(supabase, anthropic, input);

    expect(supabase.from).toHaveBeenCalledTimes(2);
    expect(first).toEqual(second); // same stub id per call, but two independent insert calls happened
  });

  // Spec 0033 AC-9: an invalid summary throws and nothing is inserted.
  it.each([
    ["60 characters", "a".repeat(60), /60 characters/],
    ["170 characters", "a".repeat(170), /170 characters/],
    ["a trailing space", `${VALID_SUMMARY} `, /whitespace/],
    ["bold markdown", `What a **jigger** is, ${VALID_SUMMARY}`, /markdown/],
    ["underscore emphasis", `What a __jigger__ is, ${VALID_SUMMARY}`, /markdown/],
    ["a leading heading", `# ${VALID_SUMMARY}`, /markdown/],
    ["inline code", `What a \`jigger\` is, ${VALID_SUMMARY}`, /markdown/],
    ["a markdown link", `What a [jigger](https://x.test) is, ${VALID_SUMMARY}`, /markdown/],
  ])("throws with no insert when the summary has %s", async (_case, summary, reason) => {
    const anthropic = stubAnthropic("## Body", summary);
    const { supabase, insert } = stubSupabase({ data: { id: "new-id" }, error: null });

    const attempt = generateLearnArticle(supabase, anthropic, input);
    await expect(attempt).rejects.toThrow(/nothing was inserted/);
    await expect(attempt).rejects.toThrow(reason);
    expect(insert).not.toHaveBeenCalled();
  });

  it("accepts summaries at exactly the bounds, counting code points", async () => {
    const atMin = "é".repeat(SUMMARY_MIN_CHARS);
    const atMax = "🍸".repeat(SUMMARY_MAX_CHARS);

    for (const summary of [atMin, atMax]) {
      const { supabase, insert } = stubSupabase({ data: { id: "new-id" }, error: null });
      await generateLearnArticle(supabase, stubAnthropic("## Body", summary), input);
      expect(insert).toHaveBeenCalledOnce();
    }
  });
});

describe("buildLearnArticlePrompt", () => {
  const prompt = buildLearnArticlePrompt({
    title: "Simple Syrup",
    category: "other",
    topic: "syrups",
  });

  // Spec 0033 AC-10.
  it("carries every accuracy rule", () => {
    ACCURACY_RULES.forEach((rule) => expect(prompt).toContain(rule));
  });

  it("covers storage, invented figures, and country specific label claims", () => {
    expect(prompt).toMatch(/refrigerat/i);
    expect(prompt).toMatch(/never invent figures/i);
    expect(prompt).toMatch(/differ by country/i);
  });

  it("asks for a topic only summary within the bounds", () => {
    expect(prompt).toContain(`${SUMMARY_MIN_CHARS} to ${SUMMARY_MAX_CHARS} characters`);
    expect(prompt).toContain("never a fact from it");
  });
});
