// Apply step for spec 0065 (ingredient substitution suggestions), AC-13.
// Reads the review file, checks every entry you marked "reviewed": true
// against the DB rules (and that every id is still in the catalog), and
// writes a SQL file you paste into the Supabase SQL editor. It never writes
// to the database itself: swap rows only come from that SQL (spec 0065).
// Entries not marked reviewed are skipped and listed; rerun the propose
// script later and it picks up only ingredients still not reviewed.
//
// Usage:
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... pnpm apply-ingredient-substitutes
import { writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../src/database.types";
import {
  buildSubstitutesApplySql,
  validateSubstituteReviewFile,
} from "../src/ingredientSubstituteProposals";
import { readReviewFile, requireEnv, reviewFilePath } from "./review-file";

const REVIEW_FILE_PATH = reviewFilePath("ingredient-substitutes-proposals.json");
const SQL_FILE_PATH = reviewFilePath("ingredient-substitutes-apply.sql");

async function main() {
  const env = requireEnv(["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]);
  const supabase = createClient<Database>(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  const { data, error } = await supabase.from("ingredients").select("id");
  if (error) {
    console.error("Failed to read ingredients:", error);
    process.exit(1);
  }
  const knownIds = new Set((data ?? []).map((row) => row.id));

  const validation = validateSubstituteReviewFile(readReviewFile(REVIEW_FILE_PATH), knownIds);
  if (!validation.ok) {
    console.error("Validation failed, no SQL written:");
    for (const e of validation.errors) console.error(`  - ${e}`);
    process.exit(1);
  }

  if (validation.unreviewed.length > 0) {
    console.warn(
      `Skipping ${validation.unreviewed.length} entries not marked reviewed: ` +
        validation.unreviewed.join(", "),
    );
  }
  if (validation.entries.length === 0) {
    console.error('No entries are marked "reviewed": true, so there is nothing to apply.');
    process.exit(1);
  }

  writeFileSync(SQL_FILE_PATH, buildSubstitutesApplySql(validation.entries));
  const swaps = validation.entries.reduce((sum, entry) => sum + entry.substitutes.length, 0);
  console.log(
    `Wrote ${SQL_FILE_PATH}: ${validation.entries.length} ingredients, ${swaps} swaps. ` +
      "Paste it into the Supabase SQL editor and run it.",
  );
}

main();
