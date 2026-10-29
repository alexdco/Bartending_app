// Apply step for spec 0043 (recipe drink style, tips, and allergens), AC-9.
// Reads the reviewed ingredient allergen file, validates all of it, and
// sends only { id, allergens } to apply_ingredient_allergens in one all or
// nothing call. Reasons stay in the file. Run soon after your review.
//
// Usage:
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... pnpm apply-ingredient-allergens
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../src/database.types";
import {
  toIngredientAllergenPayload,
  validateIngredientAllergenProposals,
} from "../src/ingredientAllergenProposals";
import { readReviewFile, requireEnv, reviewFilePath } from "./review-file";

const REVIEW_FILE_PATH = reviewFilePath("ingredient-allergens-proposals.json");

async function main() {
  const env = requireEnv(["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]);

  const validation = validateIngredientAllergenProposals(readReviewFile(REVIEW_FILE_PATH));
  if (!validation.ok) {
    console.error("Validation failed, no writes made:");
    for (const e of validation.errors) console.error(`  - ${e}`);
    process.exit(1);
  }

  const supabase = createClient<Database>(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
  const { error } = await supabase.rpc("apply_ingredient_allergens", {
    proposals: toIngredientAllergenPayload(validation.proposals).map((row) => ({
      id: row.id,
      allergens: [...row.allergens],
    })),
  });

  if (error) {
    console.error("Apply failed, no writes made:", error);
    process.exit(1);
  }

  console.log(`Applied allergens for ${validation.proposals.length} ingredients.`);
}

main();
