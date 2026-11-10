import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

// Learn section (spec 0025): fixed category set the landing grid always
// renders, even with zero published content in a category (AC-1).
export const LEARN_CATEGORIES = ["tools", "spirits", "wine", "beer", "other"] as const;

export type LearnCategory = (typeof LEARN_CATEGORIES)[number];

export function isLearnCategory(value: string | null | undefined): value is LearnCategory {
  return LEARN_CATEGORIES.includes(value as LearnCategory);
}

// Spec 0033 (AC-5, AC-9): the bounds the learn_articles.summary check
// constraints enforce, shared by the generator and its tests.
export const SUMMARY_MIN_CHARS = 70;
export const SUMMARY_MAX_CHARS = 160;

const SUMMARY_MARKDOWN = /\*\*|__|^#|`|\]\(/;

// Returns why a summary would be rejected, or null when it is valid. Length
// counts code points to match Postgres char_length.
export function validateLearnSummary(summary: string): string | null {
  const length = [...summary].length;
  if (length < SUMMARY_MIN_CHARS || length > SUMMARY_MAX_CHARS) {
    return `summary is ${length} characters, must be ${SUMMARY_MIN_CHARS} to ${SUMMARY_MAX_CHARS}`;
  }
  if (summary !== summary.trim()) {
    return "summary has leading or trailing whitespace";
  }
  if (SUMMARY_MARKDOWN.test(summary)) {
    return "summary contains markdown";
  }
  return null;
}

export interface LearnArticleSummary {
  id: string;
  title: string;
  category: LearnCategory;
  // Topic only plain text, 70 to 160 characters (spec 0033): the list
  // subtitle and the article page's meta description.
  summary: string;
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
    .select("id, title, category, summary, published_at")
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
    summary: row.summary,
    publishedAt: row.published_at,
  }));
}

export interface LearnArticleSitemapEntry {
  id: string;
  title: string;
  category: LearnCategory;
  updatedAt: string;
}

// Every published article in a known category, for the sitemap. RLS already
// limits anonymous reads to published rows; the filters mirror that.
export async function listPublishedLearnArticlesForSitemap(
  client: SupabaseClient<Database>,
): Promise<LearnArticleSitemapEntry[]> {
  const { data, error } = await client
    .from("learn_articles")
    .select("id, title, category, updated_at")
    .eq("status", "published")
    .in("category", [...LEARN_CATEGORIES]);

  if (error) {
    throw error;
  }

  return (data ?? []).flatMap((row) =>
    isLearnCategory(row.category)
      ? [{ id: row.id, title: row.title, category: row.category, updatedAt: row.updated_at }]
      : [],
  );
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
    .select("id, title, category, summary, body_markdown, published_at")
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
    summary: data.summary,
    publishedAt: data.published_at,
    bodyMarkdown: data.body_markdown,
  };
}
