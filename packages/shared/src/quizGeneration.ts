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
//
// Spec 0042 (quiz answer source links): every question also carries the one
// article or recipe that answers it plus an anchor phrase from its own
// explanation. Haiku picks the source by its number in a numbered pool (not a
// uuid, which LLMs garble), and resolveQuestionSources maps that number back
// to the pool item's id before anything is inserted.
import type { SupabaseClient } from "@supabase/supabase-js";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod/v4";
import type { Database } from "./database.types";
import type { LearnCategory } from "./learnArticles";
import {
  QUESTION_TYPES,
  QUIZ_SOURCE_ANCHOR_MIN_LENGTH,
  QUIZ_SOURCE_TYPES,
  splitExplanationAtAnchor,
  type QuestionType,
  type QuizSourceType,
} from "./quizzes";

const MIN_QUESTIONS = 5;
const MAX_QUESTIONS = 8;

export const QUIZ_MODEL = "claude-haiku-4-5-20251001";

// One article or recipe a question can link to (spec 0042). The same array
// feeds the prompt's numbered list and the number to id mapping, so the
// numbering can never drift between them.
export interface QuizSourcePoolItem {
  id: string;
  label: string;
  contextText: string;
}

export type QuizSourceKind = "article" | "recipe";

// Sorted stably (label, then id) so a pool's numbering is the same on every
// run for the same rows.
export function buildSourcePool(items: readonly QuizSourcePoolItem[]): QuizSourcePoolItem[] {
  return [...items].sort((a, b) => a.label.localeCompare(b.label) || a.id.localeCompare(b.id));
}

export function formatSourcePool(pool: readonly QuizSourcePoolItem[]): string {
  return pool
    .map((item, index) => `[${index + 1}] ${item.label}\n${item.contextText}`)
    .join("\n\n---\n\n");
}

export const SOURCE_ANCHOR_RULE =
  "`sourceIndex` is the number in square brackets of the one source that answers the question. " +
  `\`sourceAnchor\` must be copied word for word from your own explanation, at least ${QUIZ_SOURCE_ANCHOR_MIN_LENGTH} ` +
  "characters, ideally the drink or article name.";

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
          .describe("A short explanation of the correct answer, shown on the result screen."),
        sourceIndex: z
          .number()
          .int()
          .describe("The number in square brackets of the one source that answers this question."),
        sourceAnchor: z
          .string()
          .describe(
            "A phrase copied word for word from the explanation, ideally the source's name.",
          ),
      }),
    )
    .min(MIN_QUESTIONS)
    .max(MAX_QUESTIONS),
});

// A question as Haiku returns it: the source is still a pool number.
export interface GeneratedQuizQuestion {
  questionType: QuestionType;
  prompt: string;
  options: string[];
  correctOptionIndex: number;
  explanation: string;
  sourceIndex: number;
  sourceAnchor: string;
}

// A question ready to insert: the source is a resolved id (exactly one of
// the two set) and the anchor is the exact substring of the explanation.
export interface QuizQuestionDraft {
  questionType: QuestionType;
  prompt: string;
  options: string[];
  correctOptionIndex: number;
  explanation: string;
  sourceArticleId: string | null;
  sourceRecipeId: string | null;
  sourceAnchor: string;
}

function validateQuestion(question: GeneratedQuizQuestion): void {
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

// Maps a 1 based pool number to its item, or null when out of range.
export function poolItemAt(
  pool: readonly QuizSourcePoolItem[],
  sourceIndex: number,
): QuizSourcePoolItem | null {
  return Number.isInteger(sourceIndex) && sourceIndex >= 1 && sourceIndex <= pool.length
    ? (pool[sourceIndex - 1] ?? null)
    : null;
}

// Spec 0042 AC-6, AC-7: every question must name an in range source, have a
// non empty explanation, and an anchor found in that explanation. Any
// failure throws before an insert, so a bad response never leaves a partial
// quiz. The stored anchor is the helper's `match`, sliced from the
// explanation, never Haiku's raw text.
export function resolveQuestionSources(
  questions: readonly GeneratedQuizQuestion[],
  pool: readonly QuizSourcePoolItem[],
  kind: QuizSourceKind,
): QuizQuestionDraft[] {
  return questions.map((question, index) => {
    const number = index + 1;
    const item = poolItemAt(pool, question.sourceIndex);
    if (!item) {
      throw new Error(
        `Quiz generation returned an out of range sourceIndex (${question.sourceIndex}) for question ${number}; the pool has ${pool.length} sources.`,
      );
    }
    if (question.explanation.trim() === "") {
      throw new Error(`Quiz generation returned an empty explanation for question ${number}.`);
    }
    const split = splitExplanationAtAnchor(question.explanation, question.sourceAnchor);
    if (!split) {
      throw new Error(
        `Quiz generation returned an anchor ("${question.sourceAnchor}") not found in the explanation of question ${number}.`,
      );
    }

    return {
      questionType: question.questionType,
      prompt: question.prompt,
      options: question.options,
      correctOptionIndex: question.correctOptionIndex,
      explanation: question.explanation,
      sourceArticleId: kind === "article" ? item.id : null,
      sourceRecipeId: kind === "recipe" ? item.id : null,
      sourceAnchor: split.match,
    };
  });
}

async function generateQuestions(
  anthropic: Anthropic,
  prompt: string,
  pool: readonly QuizSourcePoolItem[],
  kind: QuizSourceKind,
): Promise<QuizQuestionDraft[]> {
  const message = await anthropic.messages.parse({
    model: QUIZ_MODEL,
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

  return resolveQuestionSources(parsed.questions, pool, kind);
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
      source_article_id: question.sourceArticleId,
      source_recipe_id: question.sourceRecipeId,
      source_anchor: question.sourceAnchor,
    })),
  );

  if (questionsError) {
    throw new Error(`Failed to insert quiz questions: ${questionsError.message}`);
  }

  return { id: quiz.id };
}

// Source pools (spec 0042). Shared by the generation scripts and the
// backfill, so a backfilled quiz is offered exactly the sources a freshly
// generated quiz on the same grouping would be.

export async function fetchLearnCategoryPool(
  supabase: SupabaseClient<Database>,
  category: LearnCategory,
): Promise<QuizSourcePoolItem[]> {
  const { data, error } = await supabase
    .from("learn_articles")
    .select("id, title, body_markdown")
    .eq("category", category)
    .eq("status", "published");

  if (error) {
    throw new Error(
      `Failed to read published articles for category "${category}": ${error.message}`,
    );
  }

  return buildSourcePool(
    (data ?? []).map((article) => ({
      id: article.id,
      label: article.title,
      contextText: article.body_markdown,
    })),
  );
}

export interface RecipePoolOptions {
  // Labels plus the ingredient line only, for pools too large for one
  // prompt (spec 0042 backfill).
  compact?: boolean;
}

export const COMPACT_RECIPE_POOL_THRESHOLD = 60;

export async function fetchRecipePool(
  supabase: SupabaseClient<Database>,
  grouping: { sourceType: "recipe_tag" | "recipe_region"; sourceRef: string },
  options: RecipePoolOptions = {},
): Promise<QuizSourcePoolItem[]> {
  const recipeIdsQuery =
    grouping.sourceType === "recipe_region"
      ? supabase
          .from("recipes")
          .select("id")
          .eq("region", grouping.sourceRef)
          .is("deleted_at", null)
      : supabase.from("recipe_tags").select("recipe_id").eq("tag_id", grouping.sourceRef);

  const { data: recipeIdRows, error: recipeIdsError } = await recipeIdsQuery;

  if (recipeIdsError) {
    throw new Error(`Failed to look up recipes for this grouping: ${recipeIdsError.message}`);
  }

  const recipeIds = (recipeIdRows ?? []).map((row) =>
    "id" in row ? row.id : (row as { recipe_id: string }).recipe_id,
  );

  if (recipeIds.length === 0) {
    return [];
  }

  const { data: recipes, error: recipesError } = await supabase
    .from("recipes")
    .select("id, name, glass, region, recipe_ingredients(sort_order, ingredients(name))")
    .in("id", recipeIds)
    .is("deleted_at", null);

  if (recipesError) {
    throw new Error(`Failed to read recipe detail for this grouping: ${recipesError.message}`);
  }

  return buildSourcePool(
    (recipes ?? []).map((recipe) => {
      const ingredients = [...recipe.recipe_ingredients]
        .sort((a, b) => a.sort_order - b.sort_order)
        .map((ri) => ri.ingredients.name)
        .join(", ");
      const contextText = options.compact
        ? `Ingredients: ${ingredients}`
        : `Glass: ${recipe.glass ?? "unknown"}${recipe.region ? `. Region: ${recipe.region}` : ""}. Ingredients: ${ingredients}`;
      return { id: recipe.id, label: recipe.name, contextText };
    }),
  );
}

export interface GenerateLearnCategoryQuizInput {
  title: string;
  category: string;
  pool: QuizSourcePoolItem[];
}

// Aborts with no insert if there is no published Learn content to draw
// questions from (AC-8); the caller (the CLI script) is responsible for the
// zero-published-articles check before calling this.
export async function generateLearnCategoryQuiz(
  supabase: SupabaseClient<Database>,
  anthropic: Anthropic,
  input: GenerateLearnCategoryQuizInput,
): Promise<{ id: string }> {
  const questions = await generateQuestions(
    anthropic,
    "Write a short quiz (5 to 8 questions) for a home bartending app's Learn section, testing " +
      `retention of the "${input.category}" category's published articles below. Mix multiple ` +
      "choice (4 options) and true/false (exactly 2 options, 'True' and 'False') questions. " +
      "Base every question and its correct answer strictly on the article content given; do not " +
      "invent facts not present in the articles. Each article is numbered in square brackets. " +
      `${SOURCE_ANCHOR_RULE}\n\n${formatSourcePool(input.pool)}`,
    input.pool,
    "article",
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
  pool: QuizSourcePoolItem[];
}

// Aborts with no insert if the grouping matches zero recipes (AC-9); the
// caller (the CLI script) is responsible for that check before calling this.
export async function generateRecipeQuiz(
  supabase: SupabaseClient<Database>,
  anthropic: Anthropic,
  input: GenerateRecipeQuizInput,
): Promise<{ id: string }> {
  const groupingLabel = input.sourceType === "recipe_region" ? "region" : "tag";

  const questions = await generateQuestions(
    anthropic,
    "Write a short quiz (5 to 8 questions) for a home bartending app, testing knowledge of the " +
      `real recipes in the "${input.sourceRef}" ${groupingLabel} grouping below (their ` +
      "ingredients, glassware, and region). Mix multiple choice (4 options) and true/false " +
      "(exactly 2 options, 'True' and 'False') questions. Base every question and its correct " +
      "answer strictly on the recipe data given; do not invent facts not present below. Each " +
      `recipe is numbered in square brackets. ${SOURCE_ANCHOR_RULE}\n\n${formatSourcePool(input.pool)}`,
    input.pool,
    "recipe",
  );

  return insertQuizDraft(supabase, {
    title: input.title,
    sourceType: input.sourceType,
    sourceRef: input.sourceRef,
    questions,
  });
}

export { QUIZ_SOURCE_TYPES };
