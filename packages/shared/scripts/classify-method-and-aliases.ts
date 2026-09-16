// One time backfill script for recipe build method, straining technique,
// and bartender shorthand aliases. Classifies every catalog recipe via
// Claude Haiku, updating recipes.method/straining/method_source_name_hash
// and inserting generated rows into recipe_aliases. Mirrors
// classify-recipes.ts's structure.
//
// The classification logic itself lives in methodAndAliasClassification.ts.
//
// Usage:
//   ANTHROPIC_API_KEY=... SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... pnpm classify-method-and-aliases
//   pnpm classify-method-and-aliases --all   (reclassify every row, ignoring the hash)
import { createClient } from "@supabase/supabase-js";
import Anthropic from "@anthropic-ai/sdk";
import type { Database } from "../src/database.types";
import { classifyMethodAndAliases } from "../src/methodAndAliasClassification";

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

  await classifyMethodAndAliases(supabase, anthropic, { reprocessAll });

  console.log("\nDone.");
}

main();
