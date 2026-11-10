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
import {
  LEARN_CATEGORIES,
  SUMMARY_MAX_CHARS,
  SUMMARY_MIN_CHARS,
  validateLearnSummary,
  type LearnCategory,
} from "./learnArticles";

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
  // Spec 0033 (AC-9): the length and markdown rules are checked again in
  // code after parsing, since structured output may not enforce them.
  summary: z
    .string()
    .describe(
      `One plain text sentence of ${SUMMARY_MIN_CHARS} to ${SUMMARY_MAX_CHARS} characters ` +
        "saying what the article covers, used as its search snippet and list subtitle. " +
        "Topic only: never state a fact, figure, ratio, shelf life, or legal or label claim " +
        "from the article. No markdown, no leading or trailing spaces.",
    ),
});

export interface GenerateLearnArticleInput {
  title: string;
  category: LearnCategory;
  topic: string;
}

// Spec 0033 (AC-10): the accuracy rules every draft is written under. They
// reduce errors but don't replace the sourced fact check before publishing.
export const ACCURACY_RULES = [
  "Only state facts you are confident are true; leave out anything you can't stand behind.",
  "Never invent figures, ratios, prices, temperatures, or times. If you aren't sure of a number, describe the idea without one.",
  "Where storage or food safety matters (syrups, juices, dairy, eggs, opened wine or vermouth), say how to store it, including refrigeration, and give a bounded shelf life rather than saying it keeps indefinitely.",
  'Legal and label rules (proof, age statements, appellations, spirit definitions) differ by country: name the country a rule comes from, or hedge with wording like "in the US" or "in many countries".',
  "Describe techniques as they are really done; don't give steps that can't physically work.",
] as const;

export function buildLearnArticlePrompt(input: GenerateLearnArticleInput): string {
  return (
    "Write a short educational article for a home bartending app's Learn section. " +
    `Title: "${input.title}". Category: ${input.category}. Topic: ${input.topic}. ` +
    `The body must be ${MIN_WORDS} to ${MAX_WORDS} words of markdown, starting with an ` +
    '"##" subheading (do not repeat the title as a top level "#" heading, it renders ' +
    "separately). Write for a curious home bartender, not a professional; accurate, " +
    "clear, and practical.\n\n" +
    "Accuracy rules:\n" +
    ACCURACY_RULES.map((rule) => `- ${rule}`).join("\n") +
    "\n\n" +
    `Also write a summary: one plain text sentence of ${SUMMARY_MIN_CHARS} to ` +
    `${SUMMARY_MAX_CHARS} characters saying what the article covers, never a fact from it.`
  );
}

async function generateDraft(anthropic: Anthropic, input: GenerateLearnArticleInput) {
  const message = await anthropic.messages.parse({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 4096,
    messages: [{ role: "user", content: buildLearnArticlePrompt(input) }],
    output_config: {
      format: zodOutputFormat(ArticleDraftSchema),
    },
  });

  const parsed = message.parsed_output;
  if (!parsed) {
    throw new Error("learn article generation did not return a parseable response");
  }
  return parsed;
}

// Inserts exactly one new draft row per call (AC-7); never dedupes or
// overwrites an existing row with the same title, by design (AC-8). An
// invalid summary throws before the insert (spec 0033 AC-9).
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

  const { bodyMarkdown, summary } = await generateDraft(anthropic, input);

  const summaryError = validateLearnSummary(summary);
  if (summaryError) {
    throw new Error(`Generated ${summaryError}; nothing was inserted. Run it again.`);
  }

  const { data, error } = await supabase
    .from("learn_articles")
    .insert({
      title: input.title,
      category: input.category,
      body_markdown: bodyMarkdown,
      summary,
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
