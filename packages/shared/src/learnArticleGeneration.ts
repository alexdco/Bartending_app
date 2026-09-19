// Learn article draft generation for spec 0025 (learn section), used by the
// generate-learn-article.ts offline script. Kept out of index.ts's export
// barrel since it pulls in @anthropic-ai/sdk, a service role only dependency
// that must never reach the web/mobile client bundles; import it via
// "@bartendingapp/shared/learn-article-generation" instead.
//
// Mirrors ingredientClassification.ts's structured output call, but has no
// hash gating: every run inserts one new draft row (AC-8), there is no
// existing row to compare a hash against.
import type { SupabaseClient } from "@supabase/supabase-js";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod/v4";
import type { Database } from "./database.types";
import { LEARN_CATEGORIES, type LearnCategory } from "./learnArticles";

const MIN_WORDS = 300;
const MAX_WORDS = 800;

const ArticleDraftSchema = z.object({
  bodyMarkdown: z
    .string()
    .describe(
      `Markdown body between ${MIN_WORDS} and ${MAX_WORDS} words. Starts with an "##" ` +
        'subheading (never a top level "#" heading, since the title renders separately). ' +
        "Plain educational prose for a home bartender: headings, lists, and bold/italic as " +
        "useful, no images or embedded HTML.",
    ),
});

export interface GenerateLearnArticleInput {
  title: string;
  category: LearnCategory;
  topic: string;
}

async function generateBodyMarkdown(anthropic: Anthropic, input: GenerateLearnArticleInput) {
  const message = await anthropic.messages.parse({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 4096,
    messages: [
      {
        role: "user",
        content:
          "Write a short educational article for a home bartending app's Learn section. " +
          `Title: "${input.title}". Category: ${input.category}. Topic: ${input.topic}. ` +
          `The body must be ${MIN_WORDS} to ${MAX_WORDS} words of markdown, starting with an ` +
          '"##" subheading (do not repeat the title as a top level "#" heading, it renders ' +
          "separately). Write for a curious home bartender, not a professional; accurate, " +
          "clear, and practical.",
      },
    ],
    output_config: {
      format: zodOutputFormat(ArticleDraftSchema),
    },
  });

  const parsed = message.parsed_output;
  if (!parsed) {
    throw new Error("learn article generation did not return a parseable response");
  }
  return parsed.bodyMarkdown;
}

// Inserts exactly one new draft row per call (AC-7); never dedupes or
// overwrites an existing row with the same title, by design (AC-8).
export async function generateLearnArticle(
  supabase: SupabaseClient<Database>,
  anthropic: Anthropic,
  input: GenerateLearnArticleInput,
): Promise<{ id: string }> {
  if (!LEARN_CATEGORIES.includes(input.category)) {
    throw new Error(
      `Invalid category "${input.category}". Must be one of: ${LEARN_CATEGORIES.join(", ")}.`,
    );
  }

  const bodyMarkdown = await generateBodyMarkdown(anthropic, input);

  const { data, error } = await supabase
    .from("learn_articles")
    .insert({
      title: input.title,
      category: input.category,
      body_markdown: bodyMarkdown,
      source_topic: input.topic,
      status: "draft",
    })
    .select("id")
    .single();

  if (error) {
    throw new Error(`Failed to insert learn article draft: ${error.message}`);
  }

  return { id: data.id };
}
