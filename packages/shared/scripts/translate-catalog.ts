// Catalog translation script for specs 0020 and 0045. Translates the recipe
// catalog (recipe name/instructions/glass, ingredient measures, ingredient
// names, tag names) into one or more non English locales via Claude Haiku,
// upserting directly into recipe_translations / ingredient_translations /
// tag_translations / recipe_ingredient_translations. Unlike tag-regions.ts
// this writes to the database directly, there is no separate review/apply step.
//
// The translation logic itself lives in catalogTranslation.ts, shared with
// the import job's ongoing translation step.
//
// Usage:
//   pnpm translate-catalog                  (env from the shell or packages/shared/.env)
//   pnpm translate-catalog --all            (retranslate every row, ignoring the hash)
//   pnpm translate-catalog --locale pt      (one supported non English locale;
//                                            default: CATALOG_TRANSLATION_LOCALES)
//   pnpm translate-catalog --limit 1        (cap rows per kind, for a thin test run)
import { createClient } from "@supabase/supabase-js";
import Anthropic from "@anthropic-ai/sdk";
import type { Database } from "../src/database.types";
import { translateCatalog } from "../src/catalogTranslation";
import { parseLimitFlag, parseLocaleFlag, requireEnv } from "./review-file";

async function main() {
  const reprocessAll = process.argv.includes("--all");
  const locale = parseLocaleFlag();
  const locales = locale === undefined ? undefined : [locale];
  const limit = parseLimitFlag();

  const env = requireEnv(["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "ANTHROPIC_API_KEY"]);
  const supabase = createClient<Database>(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
  const anthropic = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });

  await translateCatalog(supabase, anthropic, { reprocessAll, locales, limit });

  console.log("\nDone.");
}

main();
