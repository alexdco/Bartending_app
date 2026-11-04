// Apply step for spec 0043 (recipe drink style, tips, and allergens), AC-8.
// Reads the reviewed recipe notes file, validates all of it, and calls
// apply_recipe_notes once, all or nothing: EN goes to recipes, each locale's
// block to that recipe's existing translation row (spec 0045 AC-10). Recipes
// with no row for a locale keep the English fallback; their ids are printed
// per locale. Run soon after your review.
//
// With --locale <code> it applies recipe-notes-proposals.<code>.json through
// apply_recipe_translation_notes (spec 0045 AC-18): only that locale's
// translation rows change, never recipes or another locale. A field whose
// English text changed since propose is skipped and reported as stale.
//
// Usage:
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... pnpm apply-recipe-notes
//   --locale <code>  apply that locale's backfill file
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../src/database.types";
import type { NonDefaultLocale } from "../src/locale";
import {
  RecipeTranslationNotesResultSchema,
  toRecipeNotePayload,
  toRecipeTranslationNotePayload,
  validateRecipeNoteProposals,
  validateRecipeTranslationNoteProposals,
} from "../src/recipeNoteProposals";
import { parseLocaleFlag, readReviewFile, requireEnv, reviewFilePath } from "./review-file";

function exitOnInvalid(errors: readonly string[]): never {
  console.error("Validation failed, no writes made:");
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}

async function applyDefault(supabase: SupabaseClient<Database>) {
  const validation = validateRecipeNoteProposals(
    readReviewFile(reviewFilePath("recipe-notes-proposals.json")),
  );
  if (!validation.ok) exitOnInvalid(validation.errors);

  const { data, error } = await supabase.rpc("apply_recipe_notes", {
    p_proposals: [...toRecipeNotePayload(validation.proposals)],
  });

  if (error) {
    console.error("Apply failed, no writes made:", error);
    process.exit(1);
  }

  console.log(`Applied notes for ${validation.proposals.length} recipes.`);

  const names = new Map(validation.proposals.map((p) => [p.id, p.name]));
  const skippedByLocale = Object.entries((data ?? {}) as Record<string, string[]>);

  for (const [locale, skippedIds] of skippedByLocale.filter(([, ids]) => ids.length > 0)) {
    console.warn(
      `${locale} skipped for ${skippedIds.length} recipes with no translation row ` +
        "(their page falls back to English):",
    );
    for (const id of skippedIds) console.warn(`  - ${id} (${names.get(id) ?? "?"})`);
  }
}

async function applyLocale(supabase: SupabaseClient<Database>, locale: NonDefaultLocale) {
  const validation = validateRecipeTranslationNoteProposals(
    readReviewFile(reviewFilePath(`recipe-notes-proposals.${locale}.json`)),
  );
  if (!validation.ok) exitOnInvalid(validation.errors);

  const { data, error } = await supabase.rpc("apply_recipe_translation_notes", {
    p_locale: locale,
    p_proposals: [...toRecipeTranslationNotePayload(validation.proposals)],
  });

  if (error) {
    console.error("Apply failed, no writes made:", error);
    process.exit(1);
  }

  const result = RecipeTranslationNotesResultSchema.safeParse(data);
  if (!result.success) {
    console.error(
      "The apply ran, but its report could not be read; check the rows by hand:",
      result.error.issues,
    );
    process.exit(1);
  }

  const { missing_row: missingRow, stale, gone } = result.data;
  const names = new Map(validation.proposals.map((p) => [p.id, p.name]));
  const label = (id: string) => `${id} (${names.get(id) ?? "?"})`;
  const applied = validation.proposals.length - missingRow.length - gone.length;

  console.log(`Applied ${locale} notes for ${applied} of ${validation.proposals.length} recipes.`);

  if (stale.length > 0) {
    console.warn(
      `${stale.length} fields not written: their English text changed since propose ` +
        `(run propose-recipe-notes --locale ${locale} again for them):`,
    );
    for (const { id, field } of stale) console.warn(`  - ${label(id)}: ${field}`);
  }
  if (missingRow.length > 0) {
    console.warn(
      `${missingRow.length} recipes skipped, no ${locale} translation row ` +
        `(fix: translate-catalog --locale ${locale}):`,
    );
    for (const id of missingRow) console.warn(`  - ${label(id)}`);
  }
  if (gone.length > 0) {
    console.warn(`${gone.length} recipes skipped, deleted or unknown since propose:`);
    for (const id of gone) console.warn(`  - ${label(id)}`);
  }
}

async function main() {
  const locale = parseLocaleFlag();
  const env = requireEnv(["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]);
  const supabase = createClient<Database>(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

  if (locale === undefined) {
    await applyDefault(supabase);
  } else {
    await applyLocale(supabase, locale);
  }
}

main();
