// One-shot generation script for spec 0025 (learn section). Generates one
// Haiku drafted learn_articles row per run, status = 'draft'. Review and
// publish happens by editing the row directly in Supabase Studio; there is
// no in app publish action (AC-9).
//
// The generation logic itself lives in learnArticleGeneration.ts.
//
// Usage:
//   ANTHROPIC_API_KEY=... SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
//     pnpm generate-learn-article --title "What Is a Jigger?" --category tools \
//     --topic "the jigger, why bartenders use one, common sizes"
//
// Running twice with the same title creates two separate draft rows; there
// is no dedupe (AC-8).
import { createClient } from "@supabase/supabase-js";
import Anthropic from "@anthropic-ai/sdk";
import type { Database } from "../src/database.types";
import { generateLearnArticle } from "../src/learnArticleGeneration";
import { LEARN_CATEGORIES, isLearnCategory } from "../src/learnArticles";

function readArg(name: string): string | undefined {
  const flag = `--${name}`;
  const index = process.argv.indexOf(flag);
  return index !== -1 ? process.argv[index + 1] : undefined;
}

async function main() {
  const title = readArg("title");
  const category = readArg("category");
  const topic = readArg("topic");

  if (!title || !category || !topic) {
    console.error(
      "Usage: pnpm generate-learn-article --title <title> --category <category> --topic <topic>\n" +
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

  const { id } = await generateLearnArticle(supabase, anthropic, { title, category, topic });

  console.log(`\nDraft created: ${id} (status: draft). Review and publish it in Supabase Studio.`);
}

main();
