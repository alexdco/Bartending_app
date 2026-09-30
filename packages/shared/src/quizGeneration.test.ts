import { describe, expect, it, vi } from "vitest";
import type Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import { generateLearnCategoryQuiz, generateRecipeQuiz } from "./quizGeneration";
import type { QuizQuestionDraft } from "./quizGeneration";

const VALID_QUESTIONS: QuizQuestionDraft[] = [
  {
    questionType: "multiple_choice",
    prompt: "What is a jigger?",
    options: ["A tool", "A drink", "A glass", "A garnish"],
    correctOptionIndex: 0,
    explanation: "A jigger measures spirits.",
  },
  {
    questionType: "true_false",
    prompt: "A jigger measures liquid.",
    options: ["True", "False"],
    correctOptionIndex: 0,
    explanation: null,
  },
  {
    questionType: "multiple_choice",
    prompt: "What is a shaker for?",
    options: ["Mixing", "Straining", "Measuring", "Garnishing"],
    correctOptionIndex: 0,
    explanation: null,
  },
  {
    questionType: "true_false",
    prompt: "A shaker can chill a drink.",
    options: ["True", "False"],
    correctOptionIndex: 0,
    explanation: null,
  },
  {
    questionType: "multiple_choice",
    prompt: "What is a muddler for?",
    options: ["Crushing", "Pouring", "Straining", "Garnishing"],
    correctOptionIndex: 0,
    explanation: null,
  },
];

function stubAnthropic(questions: QuizQuestionDraft[] | undefined) {
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
  const questionsInsertResult = Promise.resolve({ error: null });

  const from = vi.fn((table: string) => {
    if (table === "quizzes") {
      return { insert: vi.fn(() => quizInsertResult) };
    }
    return { insert: vi.fn(() => questionsInsertResult) };
  });

  const client = { from };
  return client as unknown as SupabaseClient;
}

describe("generateLearnCategoryQuiz", () => {
  const input = {
    title: "Bar Tools Quiz",
    category: "tools",
    articles: [{ title: "What Is a Jigger?", bodyMarkdown: "## About jiggers" }],
  };

  it("inserts a new draft quiz and its questions (covers AC-8)", async () => {
    const anthropic = stubAnthropic(VALID_QUESTIONS);
    const supabase = stubSupabase({ data: { id: "quiz-1" }, error: null });

    const result = await generateLearnCategoryQuiz(supabase, anthropic, input);

    expect(result).toEqual({ id: "quiz-1" });
    expect(supabase.from).toHaveBeenCalledWith("quizzes");
    expect(supabase.from).toHaveBeenCalledWith("quiz_questions");
  });

  it("throws when the model returns no parseable output", async () => {
    const anthropic = stubAnthropic(undefined);
    const supabase = stubSupabase({ data: { id: "quiz-1" }, error: null });

    await expect(generateLearnCategoryQuiz(supabase, anthropic, input)).rejects.toThrow(
      /did not return a parseable response/,
    );
  });

  it("throws when a question's option count doesn't match its type", async () => {
    const anthropic = stubAnthropic([
      { ...VALID_QUESTIONS[0], questionType: "true_false", options: ["True", "False", "Maybe"] },
    ]);
    const supabase = stubSupabase({ data: { id: "quiz-1" }, error: null });

    await expect(generateLearnCategoryQuiz(supabase, anthropic, input)).rejects.toThrow(
      /expected 2/,
    );
  });

  it("throws when correctOptionIndex is out of range", async () => {
    const anthropic = stubAnthropic([{ ...VALID_QUESTIONS[0], correctOptionIndex: 9 }]);
    const supabase = stubSupabase({ data: { id: "quiz-1" }, error: null });

    await expect(generateLearnCategoryQuiz(supabase, anthropic, input)).rejects.toThrow(
      /out of range/,
    );
  });

  it("creates a separate quiz on each call, never deduping by source (covers AC-10)", async () => {
    const anthropic = stubAnthropic(VALID_QUESTIONS);
    const supabase = stubSupabase({ data: { id: "quiz-1" }, error: null });

    await generateLearnCategoryQuiz(supabase, anthropic, input);
    await generateLearnCategoryQuiz(supabase, anthropic, input);

    expect(supabase.from).toHaveBeenCalledWith("quizzes");
    expect(anthropic.messages.parse).toHaveBeenCalledTimes(2);
  });
});

describe("generateRecipeQuiz", () => {
  const input = {
    title: "Caribbean Quiz",
    sourceType: "recipe_region" as const,
    sourceRef: "Caribbean",
    recipes: [{ name: "Daiquiri", glass: "Coupe", region: "Caribbean", ingredients: ["Rum"] }],
  };

  it("inserts a new draft quiz and its questions (covers AC-9)", async () => {
    const anthropic = stubAnthropic(VALID_QUESTIONS);
    const supabase = stubSupabase({ data: { id: "quiz-2" }, error: null });

    const result = await generateRecipeQuiz(supabase, anthropic, input);

    expect(result).toEqual({ id: "quiz-2" });
    expect(supabase.from).toHaveBeenCalledWith("quizzes");
    expect(supabase.from).toHaveBeenCalledWith("quiz_questions");
  });

  it("throws a wrapped error when the quiz insert fails, rather than swallowing it", async () => {
    const anthropic = stubAnthropic(VALID_QUESTIONS);
    const supabase = stubSupabase({ data: null, error: { message: "duplicate key" } });

    await expect(generateRecipeQuiz(supabase, anthropic, input)).rejects.toThrow(
      /Failed to insert quiz draft: duplicate key/,
    );
  });
});
