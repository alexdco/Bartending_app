import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";
import { isLearnCategory, type LearnCategory } from "./learnArticles";
import { ensureAnonymousSession } from "./supabaseClient";

// Learn quizzes (spec 0026): a quiz on a Learn category or a recipe
// tag/region grouping. source_ref is a plain identifier (learn_articles'
// category value, a tags.id, or a region value), not a foreign key, since it
// points at different id shapes depending on source_type.
export const QUIZ_SOURCE_TYPES = ["learn_category", "recipe_tag", "recipe_region"] as const;

export type QuizSourceType = (typeof QUIZ_SOURCE_TYPES)[number];

export function isQuizSourceType(value: string | null | undefined): value is QuizSourceType {
  return QUIZ_SOURCE_TYPES.includes(value as QuizSourceType);
}

export const QUESTION_TYPES = ["multiple_choice", "true_false"] as const;

export type QuestionType = (typeof QUESTION_TYPES)[number];

export interface QuizSummary {
  id: string;
  title: string;
  sourceType: QuizSourceType;
  sourceRef: string;
  publishedAt: string | null;
}

export interface QuizQuestion {
  id: string;
  questionType: QuestionType;
  prompt: string;
  options: string[];
  correctOptionIndex: number;
  explanation: string | null;
  sortOrder: number;
  // null = no source, or the source row is hidden by its own RLS (a draft
  // article, a soft deleted recipe), spec 0042 AC-3.
  source: QuizQuestionSource | null;
  sourceAnchor: string | null;
}

// The one Learn article or recipe that holds a question's answer (spec 0042).
export type QuizQuestionSource =
  | { kind: "article"; id: string; title: string; category: LearnCategory }
  | { kind: "recipe"; id: string; name: string };

export interface QuizDetail extends QuizSummary {
  questions: QuizQuestion[];
}

export interface QuizAttempt {
  score: number;
  total: number;
  completedAt: string;
}

function mapQuizSummary(row: {
  id: string;
  title: string;
  source_type: string;
  source_ref: string;
  published_at: string | null;
}): QuizSummary {
  return {
    id: row.id,
    title: row.title,
    sourceType: row.source_type as QuizSourceType,
    sourceRef: row.source_ref,
    publishedAt: row.published_at,
  };
}

// Builds a question's source from its embedded learn_articles / recipes rows
// (spec 0042). An article only counts when its category is a known Learn
// category, so an unexpected value never reaches a link path unchecked.
function mapQuizQuestionSource(
  article: { id: string; title: string; category: string } | null,
  recipe: { id: string; name: string } | null,
): QuizQuestionSource | null {
  if (article) {
    return isLearnCategory(article.category)
      ? { kind: "article", id: article.id, title: article.title, category: article.category }
      : null;
  }
  if (recipe) {
    return { kind: "recipe", id: recipe.id, name: recipe.name };
  }
  return null;
}

export const QUIZ_SOURCE_ANCHOR_MIN_LENGTH = 3;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Splits an explanation around the first case insensitive occurrence of its
// stored anchor (spec 0042 AC-1, AC-2). `match` is sliced from the
// explanation, so it keeps the explanation's own casing. Returns null when
// the explanation is empty, the trimmed anchor is shorter than
// QUIZ_SOURCE_ANCHOR_MIN_LENGTH, or the anchor is not found; callers then
// fall back to the "Read more" line. The generation and backfill scripts use
// the same helper as their validator, so "renders inline" and "passes
// validation" can never disagree.
export function splitExplanationAtAnchor(
  explanation: string | null,
  anchor: string | null,
): { before: string; match: string; after: string } | null {
  const trimmed = anchor?.trim() ?? "";
  if (!explanation || trimmed.length < QUIZ_SOURCE_ANCHOR_MIN_LENGTH) {
    return null;
  }

  const found = new RegExp(escapeRegExp(trimmed), "i").exec(explanation);
  if (!found) {
    return null;
  }

  const start = found.index;
  const end = start + found[0].length;
  return {
    before: explanation.slice(0, start),
    match: explanation.slice(start, end),
    after: explanation.slice(end),
  };
}

export type QuizAnswers = Readonly<Record<string, number>>;

// Validates a kept result read back from client storage (spec 0042 AC-5):
// returns the answers only if their keys are exactly this quiz's question
// ids and every value is a valid option index, otherwise null (a stale
// entry from an edited quiz, or a corrupt value, is simply not restored).
// Callers always recompute the score from these answers.
export function restoreQuizAnswers(
  stored: unknown,
  questions: readonly Pick<QuizQuestion, "id" | "options">[],
): QuizAnswers | null {
  if (typeof stored !== "object" || stored === null || Array.isArray(stored)) {
    return null;
  }

  const entries = Object.entries(stored);
  if (entries.length !== questions.length) {
    return null;
  }

  const optionCounts = new Map(questions.map((question) => [question.id, question.options.length]));
  const valid = entries.every(([questionId, value]) => {
    const optionCount = optionCounts.get(questionId);
    return (
      optionCount !== undefined &&
      typeof value === "number" &&
      Number.isInteger(value) &&
      value >= 0 &&
      value < optionCount
    );
  });

  return valid ? (Object.fromEntries(entries) as QuizAnswers) : null;
}

// RLS restricts every read here to status = 'published' rows regardless of
// the client filter (AC-6, AC-7, AC-11); the explicit .eq calls below are a
// courtesy, not the security boundary.
export async function fetchQuizzes(client: SupabaseClient<Database>): Promise<QuizSummary[]> {
  const { data, error } = await client
    .from("quizzes")
    .select("id, title, source_type, source_ref, published_at")
    .eq("status", "published")
    .order("published_at", { ascending: false })
    .order("id", { ascending: true });

  if (error) {
    throw error;
  }

  return (data ?? []).map(mapQuizSummary);
}

// The most recently published quiz for a given source, or null if none
// exists (AC-1): callers render no link at all on null, never a placeholder
// or dead link. .maybeSingle() with limit(1), never .single(), since AC-10
// allows more than one draft/published quiz to exist for the same source
// over time.
export async function fetchQuizBySource(
  client: SupabaseClient<Database>,
  sourceType: QuizSourceType,
  sourceRef: string,
): Promise<QuizSummary | null> {
  const { data, error } = await client
    .from("quizzes")
    .select("id, title, source_type, source_ref, published_at")
    .eq("source_type", sourceType)
    .eq("source_ref", sourceRef)
    .eq("status", "published")
    .order("published_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data ? mapQuizSummary(data) : null;
}

// Returns null on no match (unknown id or not published), so the caller
// renders a not found state rather than distinguishing the reason (AC-6).
export async function fetchQuizDetail(
  client: SupabaseClient<Database>,
  id: string,
): Promise<QuizDetail | null> {
  const { data, error } = await client
    .from("quizzes")
    .select(
      // Plain (left) embeds for the sources, never !inner: a source hidden by
      // its own RLS must come back null, not drop the question (spec 0042).
      "id, title, source_type, source_ref, published_at, quiz_questions(id, question_type, prompt, options, correct_option_index, explanation, sort_order, source_anchor, learn_articles!source_article_id(id, title, category), recipes!source_recipe_id(id, name))",
    )
    .eq("id", id)
    .eq("status", "published")
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data) {
    return null;
  }

  const questions = [...data.quiz_questions].sort((a, b) => {
    if (a.sort_order !== b.sort_order) {
      return a.sort_order - b.sort_order;
    }
    return a.id.localeCompare(b.id);
  });

  return {
    ...mapQuizSummary(data),
    questions: questions.map((question) => ({
      id: question.id,
      questionType: question.question_type as QuestionType,
      prompt: question.prompt,
      options: question.options as string[],
      correctOptionIndex: question.correct_option_index,
      explanation: question.explanation,
      sortOrder: question.sort_order,
      source: mapQuizQuestionSource(question.learn_articles, question.recipes),
      sourceAnchor: question.source_anchor,
    })),
  };
}

// The caller's own saved best score, or null if they have never attempted
// this quiz (AC-5). RLS scopes this to the caller's own row.
export async function fetchQuizAttempt(
  client: SupabaseClient<Database>,
  quizId: string,
): Promise<QuizAttempt | null> {
  const { data, error } = await client
    .from("quiz_attempts")
    .select("score, total, completed_at")
    .eq("quiz_id", quizId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data) {
    return null;
  }

  return { score: data.score, total: data.total, completedAt: data.completed_at };
}

export interface SubmitQuizAttemptResult {
  attempt: QuizAttempt;
  saved: true;
}

export interface SubmitQuizAttemptFailure {
  saved: false;
  error: unknown;
}

// Saves a scored attempt, keeping the higher of the new and any existing
// saved score (AC-5); the conditional overwrite is enforced by the
// submit_quiz_attempt Postgres function, not application logic, since a
// plain PostgREST upsert cannot express "only update if higher". Ensures a
// session exists first (creating a guest one if needed); on any failure
// (session creation or the submit itself), returns a failure result instead
// of throwing, so the caller can still show the computed score with a non
// blocking "not saved" notice.
export async function submitQuizAttempt(
  client: SupabaseClient<Database>,
  quizId: string,
  score: number,
  total: number,
): Promise<SubmitQuizAttemptResult | SubmitQuizAttemptFailure> {
  try {
    await ensureAnonymousSession(client);

    const { data, error } = await client.rpc("submit_quiz_attempt", {
      p_quiz_id: quizId,
      p_score: score,
      p_total: total,
    });

    if (error) {
      throw error;
    }

    return {
      saved: true,
      attempt: { score: data.score, total: data.total, completedAt: data.completed_at },
    };
  } catch (error) {
    return { saved: false, error };
  }
}
