// One-shot generation script for spec 0026 (learn quizzes): drafts a quiz on
// a recipe tag or region grouping's real ingredient/glassware/region data.
// Inserts one quizzes row (status = 'draft') plus 5 to 8 quiz_questions
// rows, each linked to the recipe that answers it (spec 0042). Review and publish happens by editing the row directly in Supabase
// Studio; there is no in app publish action (AC-11).
//
// The generation logic itself lives in quizGeneration.ts.
//
// Usage:
//   ANTHROPIC_API_KEY=... SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
//     pnpm generate-recipe-quiz --title "Caribbean Quiz" --region Caribbean
//   ANTHROPIC_API_KEY=... SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
//     pnpm generate-recipe-quiz --title "Tiki Quiz" --tag "<tags.id>"
//
// Running twice for the same grouping creates two separate draft quizzes;
// there is no dedupe (AC-10).
import { createClient } from "@supabase/supabase-js";
import Anthropic from "@anthropic-ai/sdk";
import type { Database } from "../src/database.types";
import { fetchRecipePool, generateRecipeQuiz } from "../src/quizGeneration";

function readArg(name: string): string | undefined {
  const flag = `--${name}`;
  const index = process.argv.indexOf(flag);
  return index !== -1 ? process.argv[index + 1] : undefined;
}

async function main() {
  const title = readArg("title");
  const region = readArg("region");
  const tagId = readArg("tag");

  if (!title || (!region && !tagId) || (region && tagId)) {
    console.error(
      "Usage: pnpm generate-recipe-quiz --title <title> --region <region>\n" +
        "   or: pnpm generate-recipe-quiz --title <title> --tag <tags.id>\n" +
        "Exactly one of --region or --tag must be given.",
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

  const sourceType = region ? ("recipe_region" as const) : ("recipe_tag" as const);
  const sourceRef = region ?? tagId!;

  const pool = await fetchRecipePool(supabase, { sourceType, sourceRef });

  if (pool.length === 0) {
    console.error(
      `No recipes found for ${region ? `region "${region}"` : `tag "${tagId}"`}. Nothing to generate a quiz from.`,
    );
    process.exit(1);
  }

  const { id } = await generateRecipeQuiz(supabase, anthropic, {
    title,
    sourceType,
    sourceRef,
    pool,
  });

  console.log(
    `\nDraft quiz created: ${id} (status: draft). Review and publish it in Supabase Studio.`,
  );
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
