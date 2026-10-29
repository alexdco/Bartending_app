import { describe, expect, it, vi } from "vitest";
import type Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildSourcePool,
  formatSourcePool,
  generateLearnCategoryQuiz,
  generateRecipeQuiz,
  resolveQuestionSources,
} from "./quizGeneration";
import type { GeneratedQuizQuestion, QuizSourcePoolItem } from "./quizGeneration";

const POOL: QuizSourcePoolItem[] = [
  { id: "source-1", label: "Jiggers", contextText: "## About jiggers" },
  { id: "source-2", label: "Shakers", contextText: "## About shakers" },
];

const VALID_QUESTIONS: GeneratedQuizQuestion[] = [
  {
    questionType: "multiple_choice",
    prompt: "What is a jigger?",
    options: ["A tool", "A drink", "A glass", "A garnish"],
    correctOptionIndex: 0,
    explanation: "A jigger measures spirits.",
    sourceIndex: 1,
    sourceAnchor: "jigger",
  },
  {
    questionType: "true_false",
    prompt: "A jigger measures liquid.",
    options: ["True", "False"],
    correctOptionIndex: 0,
    explanation: "A jigger measures liquid.",
    sourceIndex: 1,
    sourceAnchor: "jigger",
  },
  {
    questionType: "multiple_choice",
    prompt: "What is a shaker for?",
    options: ["Mixing", "Straining", "Measuring", "Garnishing"],
    correctOptionIndex: 0,
    explanation: "A Shaker mixes drinks.",
    sourceIndex: 2,
    sourceAnchor: "shaker",
  },
  {
    questionType: "true_false",
    prompt: "A shaker can chill a drink.",
    options: ["True", "False"],
    correctOptionIndex: 0,
    explanation: "A shaker chills a drink.",
    sourceIndex: 2,
    sourceAnchor: "shaker",
  },
  {
    questionType: "multiple_choice",
    prompt: "What is a muddler for?",
    options: ["Crushing", "Pouring", "Straining", "Garnishing"],
    correctOptionIndex: 0,
    explanation: "A muddler crushes fruit; see the jigger guide for measuring.",
    sourceIndex: 1,
    sourceAnchor: "jigger guide",
  },
];

function stubAnthropic(questions: GeneratedQuizQuestion[] | undefined) {
  return {
    messages: {
      parse: vi.fn().mockResolvedValue({ parsed_output: questions ? { questions } : null }),
    },
  } as unknown as Anthropic;
}

function stubSupabase(quizResult: {
  data: { id: string } | null;
  error: { message: string } | null;
}) {
  const quizInsertResult = {
    select: vi.fn(() => ({ single: vi.fn(() => Promise.resolve(quizResult)) })),
  };
  const questionsInsert = vi.fn<(rows: Record<string, unknown>[]) => Promise<{ error: null }>>(() =>
    Promise.resolve({ error: null }),
  );

  const from = vi.fn((table: string) => {
    if (table === "quizzes") {
      return { insert: vi.fn(() => quizInsertResult) };
    }
    return { insert: questionsInsert };
  });

  const client = { from };
  return { supabase: client as unknown as SupabaseClient, from, questionsInsert };
}

function insertedRows(questionsInsert: ReturnType<typeof stubSupabase>["questionsInsert"]) {
  return questionsInsert.mock.calls[0]?.[0] ?? [];
}

describe("generateLearnCategoryQuiz", () => {
  const input = {
    title: "Bar Tools Quiz",
    category: "tools",
    pool: POOL,
  };

  it("inserts a new draft quiz and its questions (covers AC-8)", async () => {
    const anthropic = stubAnthropic(VALID_QUESTIONS);
    const { supabase, from } = stubSupabase({ data: { id: "quiz-1" }, error: null });

    const result = await generateLearnCategoryQuiz(supabase, anthropic, input);

    expect(result).toEqual({ id: "quiz-1" });
    expect(from).toHaveBeenCalledWith("quizzes");
    expect(from).toHaveBeenCalledWith("quiz_questions");
  });

  it("inserts each question with its resolved article id and exact anchor (covers spec 0042 AC-6)", async () => {
    const anthropic = stubAnthropic(VALID_QUESTIONS);
    const { supabase, questionsInsert } = stubSupabase({ data: { id: "quiz-1" }, error: null });

    await generateLearnCategoryQuiz(supabase, anthropic, input);

    const rows = insertedRows(questionsInsert);
    expect(rows[0]).toMatchObject({
      source_article_id: "source-1",
      source_recipe_id: null,
      source_anchor: "jigger",
    });
    expect(rows[2]).toMatchObject({ source_article_id: "source-2", source_anchor: "Shaker" });
  });

  it("puts the numbered pool in the prompt", async () => {
    const anthropic = stubAnthropic(VALID_QUESTIONS);
    const { supabase } = stubSupabase({ data: { id: "quiz-1" }, error: null });

    await generateLearnCategoryQuiz(supabase, anthropic, input);

    const call = vi.mocked(anthropic.messages.parse).mock.calls[0]?.[0];
    const content = String(call?.messages[0]?.content);
    expect(content).toContain("[1] Jiggers");
    expect(content).toContain("[2] Shakers");
  });

  it("aborts with no insert when a sourceIndex is out of range (covers spec 0042 AC-6)", async () => {
    const anthropic = stubAnthropic([
      { ...VALID_QUESTIONS[0]!, sourceIndex: 3 },
      ...VALID_QUESTIONS.slice(1),
    ]);
    const { supabase, from } = stubSupabase({ data: { id: "quiz-1" }, error: null });

    await expect(generateLearnCategoryQuiz(supabase, anthropic, input)).rejects.toThrow(
      /out of range sourceIndex/,
    );
    expect(from).not.toHaveBeenCalled();
  });

  it("throws when the model returns no parseable output", async () => {
    const anthropic = stubAnthropic(undefined);
    const { supabase } = stubSupabase({ data: { id: "quiz-1" }, error: null });

    await expect(generateLearnCategoryQuiz(supabase, anthropic, input)).rejects.toThrow(
      /did not return a parseable response/,
    );
  });

  it("throws when a question's option count doesn't match its type", async () => {
    const anthropic = stubAnthropic([
      { ...VALID_QUESTIONS[0]!, questionType: "true_false", options: ["True", "False", "Maybe"] },
    ]);
    const { supabase } = stubSupabase({ data: { id: "quiz-1" }, error: null });

    await expect(generateLearnCategoryQuiz(supabase, anthropic, input)).rejects.toThrow(
      /expected 2/,
    );
  });

  it("throws when correctOptionIndex is out of range", async () => {
    const anthropic = stubAnthropic([{ ...VALID_QUESTIONS[0]!, correctOptionIndex: 9 }]);
    const { supabase } = stubSupabase({ data: { id: "quiz-1" }, error: null });

    await expect(generateLearnCategoryQuiz(supabase, anthropic, input)).rejects.toThrow(
      /out of range correctOptionIndex/,
    );
  });

  it("creates a separate quiz on each call, never deduping by source (covers AC-10)", async () => {
    const anthropic = stubAnthropic(VALID_QUESTIONS);
    const { supabase, from } = stubSupabase({ data: { id: "quiz-1" }, error: null });

    await generateLearnCategoryQuiz(supabase, anthropic, input);
    await generateLearnCategoryQuiz(supabase, anthropic, input);

    expect(from).toHaveBeenCalledWith("quizzes");
    expect(anthropic.messages.parse).toHaveBeenCalledTimes(2);
  });
});

describe("generateRecipeQuiz", () => {
  const input = {
    title: "Caribbean Quiz",
    sourceType: "recipe_region" as const,
    sourceRef: "Caribbean",
    pool: [
      { id: "recipe-daiquiri", label: "Daiquiri", contextText: "Ingredients: Rum" },
      { id: "recipe-mojito", label: "Mojito", contextText: "Ingredients: Rum, Mint" },
    ],
  };

  it("inserts a new draft quiz and its questions (covers AC-9)", async () => {
    const anthropic = stubAnthropic(VALID_QUESTIONS);
    const { supabase, from } = stubSupabase({ data: { id: "quiz-2" }, error: null });

    const result = await generateRecipeQuiz(supabase, anthropic, input);

    expect(result).toEqual({ id: "quiz-2" });
    expect(from).toHaveBeenCalledWith("quizzes");
    expect(from).toHaveBeenCalledWith("quiz_questions");
  });

  it("inserts each question with a recipe id and no article id (covers spec 0042 AC-7)", async () => {
    const anthropic = stubAnthropic(VALID_QUESTIONS);
    const { supabase, questionsInsert } = stubSupabase({ data: { id: "quiz-2" }, error: null });

    await generateRecipeQuiz(supabase, anthropic, input);

    const rows = insertedRows(questionsInsert);
    expect(rows[1]).toMatchObject({ source_article_id: null, source_recipe_id: "recipe-daiquiri" });
    expect(rows[2]).toMatchObject({ source_recipe_id: "recipe-mojito" });
  });

  it("aborts with no insert when an anchor is not in its explanation (covers spec 0042 AC-7)", async () => {
    const anthropic = stubAnthropic([
      { ...VALID_QUESTIONS[0]!, sourceAnchor: "Daiquiri" },
      ...VALID_QUESTIONS.slice(1),
    ]);
    const { supabase, from } = stubSupabase({ data: { id: "quiz-2" }, error: null });

    await expect(generateRecipeQuiz(supabase, anthropic, input)).rejects.toThrow(/not found/);
    expect(from).not.toHaveBeenCalled();
  });

  it("throws a wrapped error when the quiz insert fails, rather than swallowing it", async () => {
    const anthropic = stubAnthropic(VALID_QUESTIONS);
    const { supabase } = stubSupabase({ data: null, error: { message: "duplicate key" } });

    await expect(generateRecipeQuiz(supabase, anthropic, input)).rejects.toThrow(
      /Failed to insert quiz draft: duplicate key/,
    );
  });
});

describe("resolveQuestionSources (spec 0042 AC-6, AC-7)", () => {
  const question = VALID_QUESTIONS[0]!;

  it("maps the 1 based sourceIndex to the pool item's id", () => {
    const [draft] = resolveQuestionSources(
      [{ ...question, sourceIndex: 2, explanation: "Shakers chill.", sourceAnchor: "shakers" }],
      POOL,
      "article",
    );
    expect(draft).toMatchObject({ sourceArticleId: "source-2", sourceRecipeId: null });
  });

  it("stores the explanation's own casing as the anchor, not the model's text", () => {
    const [draft] = resolveQuestionSources(
      [{ ...question, sourceAnchor: "  JIGGER " }],
      POOL,
      "recipe",
    );
    expect(draft).toMatchObject({
      sourceAnchor: "jigger",
      sourceRecipeId: "source-1",
      sourceArticleId: null,
    });
  });

  it("throws for a zero, negative, too large, or non integer sourceIndex", () => {
    for (const sourceIndex of [0, -1, 3, 1.5]) {
      expect(() => resolveQuestionSources([{ ...question, sourceIndex }], POOL, "article")).toThrow(
        /out of range sourceIndex/,
      );
    }
  });

  it("throws for an empty explanation", () => {
    expect(() =>
      resolveQuestionSources([{ ...question, explanation: "   " }], POOL, "article"),
    ).toThrow(/empty explanation/);
  });

  it("throws for an anchor shorter than 3 characters", () => {
    expect(() =>
      resolveQuestionSources([{ ...question, sourceAnchor: "A" }], POOL, "article"),
    ).toThrow(/not found/);
  });
});

describe("buildSourcePool / formatSourcePool (spec 0042)", () => {
  it("sorts by label then id and numbers from 1", () => {
    const pool = buildSourcePool([
      { id: "b", label: "Mojito", contextText: "Mint" },
      { id: "z", label: "Daiquiri", contextText: "Lime" },
      { id: "a", label: "Daiquiri", contextText: "Rum" },
    ]);
    expect(pool.map((item) => item.id)).toEqual(["a", "z", "b"]);
    const text = formatSourcePool(pool);
    expect(text.startsWith("[1] Daiquiri\nRum")).toBe(true);
    expect(text).toContain("[3] Mojito\nMint");
  });
});
