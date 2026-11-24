// Catalog translation script for specs 0020 and 0045. Translates the recipe
// catalog (recipe name/instructions/glass, ingredient measures, ingredient
// names, tag names) into one or more non English locales via Claude Haiku,
// upserting directly into recipe_translations / ingredient_translations /
// tag_translations / recipe_ingredient_translations. Unlike tag-regions.ts
// this writes to the database directly, there is no separate review/apply step.
//
// Swap notes (spec 0065 AC-14) are the exception: they are translated after
// the catalog, but written to scripts/tagging/substitute-note-translations-apply.sql
// for you to run in the SQL editor, since swap rows only enter the database
// that way. --ids there matches the ingredient that is out.
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
//   pnpm translate-catalog --locale ko --ids <uuid>,<uuid>
//                                           (retranslate only these recipe, ingredient,
//                                            or tag ids, even when current)
import { createClient } from "@supabase/supabase-js";
import Anthropic from "@anthropic-ai/sdk";
import type { Database } from "../src/database.types";
import { writeFileSync } from "node:fs";
import { translateCatalog, translateSubstituteNotes } from "../src/catalogTranslation";
import { buildSubstituteNoteTranslationsSql } from "../src/ingredientSubstituteProposals";
import {
  parseIdsFlag,
  parseLimitFlag,
  parseLocaleFlag,
  requireEnv,
  reviewFilePath,
} from "./review-file";

const NOTE_SQL_FILE_PATH = reviewFilePath("substitute-note-translations-apply.sql");

async function main() {
  const reprocessAll = process.argv.includes("--all");
  const locale = parseLocaleFlag();
  const locales = locale === undefined ? undefined : [locale];
  const limit = parseLimitFlag();
  const ids = parseIdsFlag();

  const env = requireEnv(["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "ANTHROPIC_API_KEY"]);
  const supabase = createClient<Database>(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
  const anthropic = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });

  await translateCatalog(supabase, anthropic, { reprocessAll, locales, limit, ids });

  const noteRows = await translateSubstituteNotes(supabase, anthropic, {
    reprocessAll,
    locales,
    limit,
    ids,
  });
  if (noteRows.length > 0) {
    writeFileSync(NOTE_SQL_FILE_PATH, buildSubstituteNoteTranslationsSql(noteRows));
    console.log(
      `\nWrote ${noteRows.length} swap note translations to ${NOTE_SQL_FILE_PATH}. Run it in the SQL editor.`,
    );
  } else {
    console.log("\nNo swap notes needed translating.");
  }

  console.log("\nDone.");
}

main();
