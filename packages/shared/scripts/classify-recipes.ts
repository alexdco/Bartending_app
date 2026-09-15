// One time backfill script for recipe difficulty and taste profile.
// Classifies every recipe into easy/medium/hard difficulty plus a taste
// profile (sweet/sour/bitter/boozy/refreshing/fruity/spicy/creamy) via Claude
// Haiku, updating recipes.difficulty/difficulty_source_name_hash and the
// tags/recipe_tags join directly. Mirrors classify-ingredients.ts's structure.
//
// The classification logic itself lives in recipeClassification.ts.
//
// Usage:
//   ANTHROPIC_API_KEY=... SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... pnpm classify-recipes
//   pnpm classify-recipes --all   (reclassify every row, ignoring the hash)
import { createClient } from "@supabase/supabase-js";
import Anthropic from "@anthropic-ai/sdk";
import type { Database } from "../src/database.types";
import { classifyRecipes } from "../src/recipeClassification";

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

  await classifyRecipes(supabase, anthropic, { reprocessAll });

  console.log("\nDone.");
}

main();
