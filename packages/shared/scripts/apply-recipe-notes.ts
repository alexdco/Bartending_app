// Apply step for spec 0043 (recipe drink style, tips, and allergens), AC-8.
// Reads the reviewed recipe notes file, validates all of it, and calls
// apply_recipe_notes once, all or nothing: EN goes to recipes, each locale's
// block to that recipe's existing translation row (spec 0045 AC-10). Recipes
// with no row for a locale keep the English fallback; their ids are printed
// per locale. Run soon after your review.
//
// Usage:
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... pnpm apply-recipe-notes
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../src/database.types";
import { toRecipeNotePayload, validateRecipeNoteProposals } from "../src/recipeNoteProposals";
import { readReviewFile, requireEnv, reviewFilePath } from "./review-file";

const REVIEW_FILE_PATH = reviewFilePath("recipe-notes-proposals.json");

async function main() {
  const env = requireEnv(["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]);

  const validation = validateRecipeNoteProposals(readReviewFile(REVIEW_FILE_PATH));
  if (!validation.ok) {
    console.error("Validation failed, no writes made:");
    for (const e of validation.errors) console.error(`  - ${e}`);
    process.exit(1);
  }

  const supabase = createClient<Database>(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
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

main();
