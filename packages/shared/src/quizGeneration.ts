// Quiz draft generation for spec 0026 (learn quizzes), used by the
// generate-learn-category-quiz.ts and generate-recipe-quiz.ts offline
// scripts. Kept out of index.ts's export barrel since it pulls in
// @anthropic-ai/sdk, a service role only dependency that must never reach
// the web/mobile client bundles; import it via
// "@bartendingapp/shared/quiz-generation" instead.
//
// Mirrors learnArticleGeneration.ts's single Haiku call shape (one call
// produces the whole quiz), with no hash gating and no dedupe: every run
// inserts one new draft quiz plus its questions (AC-10), there is no
// existing row to compare against or overwrite.
import type { SupabaseClient } from "@supabase/supabase-js";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod/v4";
import type { Database } from "./database.types";
import {
  QUESTION_TYPES,
  QUIZ_SOURCE_TYPES,
  type QuestionType,
  type QuizSourceType,
} from "./quizzes";

const MIN_QUESTIONS = 5;
const MAX_QUESTIONS = 8;

const QuizDraftSchema = z.object({
  questions: z
    .array(
      z.object({
        questionType: z.enum(QUESTION_TYPES),
        prompt: z.string().describe("The question text."),
        options: z
          .array(z.string())
          .describe("4 options for multiple_choice, or exactly ['True', 'False'] for true_false."),
        correctOptionIndex: z
          .number()
          .int()
          .describe("Zero based index into options of the correct answer."),
        explanation: z
          .string()
          .nullable()
          .describe("A short explanation of the correct answer, shown on the result screen."),
      }),
    )
    .min(MIN_QUESTIONS)
    .max(MAX_QUESTIONS),
});

export interface QuizQuestionDraft {
  questionType: QuestionType;
  prompt: string;
  options: string[];
  correctOptionIndex: number;
  explanation: string | null;
}

function validateQuestion(question: QuizQuestionDraft): void {
  const expectedOptionCount = question.questionType === "true_false" ? 2 : 4;
  if (question.options.length !== expectedOptionCount) {
    throw new Error(
      `Quiz generation returned a ${question.questionType} question with ${question.options.length} options; expected ${expectedOptionCount}.`,
    );
  }
  if (question.correctOptionIndex < 0 || question.correctOptionIndex >= question.options.length) {
    throw new Error(
      `Quiz generation returned an out of range correctOptionIndex (${question.correctOptionIndex}) for a question with ${question.options.length} options.`,
    );
  }
}

async function generateQuestions(
  anthropic: Anthropic,
  prompt: string,
): Promise<QuizQuestionDraft[]> {
  const message = await anthropic.messages.parse({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 4096,
    messages: [{ role: "user", content: prompt }],
    output_config: {
      format: zodOutputFormat(QuizDraftSchema),
    },
  });

  const parsed = message.parsed_output;
  if (!parsed) {
    throw new Error("quiz generation did not return a parseable response");
  }

  parsed.questions.forEach(validateQuestion);

  return parsed.questions;
}

export interface InsertQuizDraftInput {
  title: string;
  sourceType: QuizSourceType;
  sourceRef: string;
  questions: QuizQuestionDraft[];
}

// Inserts exactly one new draft quiz plus its questions per call (AC-8,
// AC-9); never dedupes or overwrites an existing quiz for the same source,
// by design (AC-10). sort_order is the zero based index of each question in
// the generated array, assigned here, not supplied by Haiku.
async function insertQuizDraft(
  supabase: SupabaseClient<Database>,
  input: InsertQuizDraftInput,
): Promise<{ id: string }> {
  const { data: quiz, error: quizError } = await supabase
    .from("quizzes")
    .insert({
      title: input.title,
      source_type: input.sourceType,
      source_ref: input.sourceRef,
      status: "draft",
    })
    .select("id")
    .single();

  if (quizError) {
    throw new Error(`Failed to insert quiz draft: ${quizError.message}`);
  }

  const { error: questionsError } = await supabase.from("quiz_questions").insert(
    input.questions.map((question, index) => ({
      quiz_id: quiz.id,
      question_type: question.questionType,
      prompt: question.prompt,
      options: question.options,
      correct_option_index: question.correctOptionIndex,
      explanation: question.explanation,
      sort_order: index,
    })),
  );

  if (questionsError) {
    throw new Error(`Failed to insert quiz questions: ${questionsError.message}`);
  }

  return { id: quiz.id };
}

export interface GenerateLearnCategoryQuizInput {
  title: string;
  category: string;
  articles: { title: string; bodyMarkdown: string }[];
}

// Aborts with no insert if there is no published Learn content to draw
// questions from (AC-8); the caller (the CLI script) is responsible for the
// zero-published-articles check before calling this.
export async function generateLearnCategoryQuiz(
  supabase: SupabaseClient<Database>,
  anthropic: Anthropic,
  input: GenerateLearnCategoryQuizInput,
): Promise<{ id: string }> {
  const articlesText = input.articles
    .map((article) => `## ${article.title}\n\n${article.bodyMarkdown}`)
    .join("\n\n---\n\n");

  const questions = await generateQuestions(
    anthropic,
    "Write a short quiz (5 to 8 questions) for a home bartending app's Learn section, testing " +
      `retention of the "${input.category}" category's published articles below. Mix multiple ` +
      "choice (4 options) and true/false (exactly 2 options, 'True' and 'False') questions. " +
      "Base every question and its correct answer strictly on the article content given; do not " +
      `invent facts not present in the articles.\n\n${articlesText}`,
  );

  return insertQuizDraft(supabase, {
    title: input.title,
    sourceType: "learn_category",
    sourceRef: input.category,
    questions,
  });
}

export interface GenerateRecipeQuizInput {
  title: string;
  sourceType: Extract<QuizSourceType, "recipe_tag" | "recipe_region">;
  sourceRef: string;
  recipes: {
    name: string;
    glass: string | null;
    region: string | null;
    ingredients: string[];
  }[];
}

// Aborts with no insert if the grouping matches zero recipes (AC-9); the
// caller (the CLI script) is responsible for that check before calling this.
export async function generateRecipeQuiz(
  supabase: SupabaseClient<Database>,
  anthropic: Anthropic,
  input: GenerateRecipeQuizInput,
): Promise<{ id: string }> {
  const recipesText = input.recipes
    .map(
      (recipe) =>
        `- ${recipe.name} (glass: ${recipe.glass ?? "unknown"}${recipe.region ? `, region: ${recipe.region}` : ""}): ${recipe.ingredients.join(", ")}`,
    )
    .join("\n");

  const groupingLabel = input.sourceType === "recipe_region" ? "region" : "tag";

  const questions = await generateQuestions(
    anthropic,
    "Write a short quiz (5 to 8 questions) for a home bartending app, testing knowledge of the " +
      `real recipes in the "${input.sourceRef}" ${groupingLabel} grouping below (their ` +
      "ingredients, glassware, and region). Mix multiple choice (4 options) and true/false " +
      "(exactly 2 options, 'True' and 'False') questions. Base every question and its correct " +
      `answer strictly on the recipe data given; do not invent facts not present below.\n\n${recipesText}`,
  );

  return insertQuizDraft(supabase, {
    title: input.title,
    sourceType: input.sourceType,
    sourceRef: input.sourceRef,
    questions,
  });
}

export { QUIZ_SOURCE_TYPES };
