import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

// Learn section (spec 0025): fixed category set the landing grid always
// renders, even with zero published content in a category (AC-1).
export const LEARN_CATEGORIES = ["tools", "spirits", "wine", "beer", "other"] as const;

export type LearnCategory = (typeof LEARN_CATEGORIES)[number];

export function isLearnCategory(value: string | null | undefined): value is LearnCategory {
  return LEARN_CATEGORIES.includes(value as LearnCategory);
}

export interface LearnArticleSummary {
  id: string;
  title: string;
  category: LearnCategory;
  publishedAt: string | null;
}

export interface LearnArticleDetail extends LearnArticleSummary {
  bodyMarkdown: string;
}

// RLS restricts every read here to status = 'published' rows regardless of
// the client filter (AC-4, AC-9); the explicit .eq calls below are a
// courtesy, not the security boundary.
export async function fetchArticlesByCategory(
  client: SupabaseClient<Database>,
  category: LearnCategory,
): Promise<LearnArticleSummary[]> {
  const { data, error } = await client
    .from("learn_articles")
    .select("id, title, category, published_at")
    .eq("category", category)
    .eq("status", "published")
    .order("published_at", { ascending: false })
    .order("id", { ascending: true });

  if (error) {
    throw error;
  }

  return (data ?? []).map((row) => ({
    id: row.id,
    title: row.title,
    category: row.category as LearnCategory,
    publishedAt: row.published_at,
  }));
}

// Returns null on no match (unknown id, wrong category, or not published),
// so the caller renders a not found state rather than distinguishing the
// reason (AC-4, AC-5).
export async function fetchArticleDetail(
  client: SupabaseClient<Database>,
  id: string,
  category: LearnCategory,
): Promise<LearnArticleDetail | null> {
  const { data, error } = await client
    .from("learn_articles")
    .select("id, title, category, body_markdown, published_at")
    .eq("id", id)
    .eq("category", category)
    .eq("status", "published")
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data) {
    return null;
  }

  return {
    id: data.id,
    title: data.title,
    category: data.category as LearnCategory,
    publishedAt: data.published_at,
    bodyMarkdown: data.body_markdown,
  };
}
