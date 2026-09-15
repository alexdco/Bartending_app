// One time backfill script for spec 0022 (batch cocktail conversion).
// Classifies the full ingredient catalog into spirit/liqueur/citrus/other via
// Claude Haiku, updating ingredients.category and category_source_name_hash
// directly. Mirrors translate-catalog.ts's structure (spec 0020).
//
// The classification logic itself lives in ingredientClassification.ts,
// shared with the import job's ongoing classification step (build plan
// steps 2-3).
//
// Usage:
//   ANTHROPIC_API_KEY=... SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... pnpm classify-ingredients
//   pnpm classify-ingredients --all   (reclassify every row, ignoring the hash)
import { createClient } from "@supabase/supabase-js";
import Anthropic from "@anthropic-ai/sdk";
import type { Database } from "../src/database.types";
import { classifyIngredients } from "../src/ingredientClassification";

async function main() {
  const reprocessAll = process.argv.includes("--all");

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

  await classifyIngredients(supabase, anthropic, { reprocessAll });

  console.log("\nDone.");
}

main();
