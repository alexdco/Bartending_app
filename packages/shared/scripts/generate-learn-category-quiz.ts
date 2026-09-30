// One-shot generation script for spec 0026 (learn quizzes): drafts a quiz on
// a Learn category's published articles. Inserts one quizzes row
// (status = 'draft') plus 5 to 8 quiz_questions rows. Review and publish
// happens by editing the row directly in Supabase Studio; there is no in app
// publish action (AC-11).
//
// The generation logic itself lives in quizGeneration.ts.
//
// Usage:
//   ANTHROPIC_API_KEY=... SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
//     pnpm generate-learn-category-quiz --title "Bar Tools Quiz" --category tools
//
// Running twice for the same category creates two separate draft quizzes;
// there is no dedupe (AC-10).
import { createClient } from "@supabase/supabase-js";
import Anthropic from "@anthropic-ai/sdk";
import type { Database } from "../src/database.types";
import { generateLearnCategoryQuiz } from "../src/quizGeneration";
import { LEARN_CATEGORIES, isLearnCategory } from "../src/learnArticles";

function readArg(name: string): string | undefined {
  const flag = `--${name}`;
  const index = process.argv.indexOf(flag);
  return index !== -1 ? process.argv[index + 1] : undefined;
}

async function main() {
  const title = readArg("title");
  const category = readArg("category");

  if (!title || !category) {
    console.error(
      "Usage: pnpm generate-learn-category-quiz --title <title> --category <category>\n" +
        `--category must be one of: ${LEARN_CATEGORIES.join(", ")}`,
    );
    process.exit(1);
  }

  if (!isLearnCategory(category)) {
    console.error(
      `Invalid --category "${category}". Must be one of: ${LEARN_CATEGORIES.join(", ")}.`,
    );
    process.exit(1);
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anthropicApiKey = process.env.ANTHROPIC_API_KEY;

  if (!supabaseUrl || !serviceRoleKey || !anthropicApiKey) {
    console.error("Missing SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, or ANTHROPIC_API_KEY.");
    process.exit(1);
  }

  const supabase = createClient<Database>(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });
  const anthropic = new Anthropic({ apiKey: anthropicApiKey });

  const { data: articles, error } = await supabase
    .from("learn_articles")
    .select("title, body_markdown")
    .eq("category", category)
    .eq("status", "published");

  if (error) {
    console.error(`Failed to read published articles for category "${category}":`, error);
    process.exit(1);
  }

  if (!articles || articles.length === 0) {
    console.error(
      `No published Learn articles found for category "${category}". Publish at least one article before generating a quiz for it.`,
    );
    process.exit(1);
  }

  const { id } = await generateLearnCategoryQuiz(supabase, anthropic, {
    title,
    category,
    articles: articles.map((article) => ({
      title: article.title,
      bodyMarkdown: article.body_markdown,
    })),
  });

  console.log(
    `\nDraft quiz created: ${id} (status: draft). Review and publish it in Supabase Studio.`,
  );
}

main();
