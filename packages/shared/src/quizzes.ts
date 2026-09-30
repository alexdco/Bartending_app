import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";
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
}

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
      "id, title, source_type, source_ref, published_at, quiz_questions(id, question_type, prompt, options, correct_option_index, explanation, sort_order)",
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
