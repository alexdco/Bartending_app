// One time reparse for spec 0035 (batch calculator correctness), AC-9.
// Rereads the measure of every recipe_ingredients row, whatever its source
// (catalog, custom, admin), runs the shared parser, and updates
// amount_value/amount_unit only where the result differs. Running it again
// changes zero rows. Run it only after the migrations are applied and the
// web and mobile clients that understand the new units are deployed (spec
// 0035 Migration plan, phase 3).
//
// Usage:
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... pnpm reparse-measures --dry-run
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... pnpm reparse-measures
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../src/database.types";
import { planReparse, type MeasureCounts, type StoredMeasureRow } from "../src/reparseMeasures";

const PAGE_SIZE = 1000;

function printCounts(label: string, counts: MeasureCounts): void {
  console.log(`${label}: ${counts.parsedLines} parsed lines`);
  for (const [unit, count] of Object.entries(counts.linesPerUnit).sort()) {
    console.log(`  ${unit}: ${count}`);
  }
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
    process.exit(1);
  }

  const supabase = createClient<Database>(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  const rows: StoredMeasureRow[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from("recipe_ingredients")
      .select("recipe_id, ingredient_id, measure, amount_value, amount_unit")
      .order("recipe_id")
      .order("ingredient_id")
      .range(from, from + PAGE_SIZE - 1);

    if (error) {
      console.error(`Failed to read rows ${from} to ${from + PAGE_SIZE - 1}: ${error.message}`);
      process.exit(1);
    }

    rows.push(...data);
    if (data.length < PAGE_SIZE) {
      break;
    }
  }

  const plan = planReparse(rows);

  console.log(`Read ${rows.length} recipe_ingredients rows.`);
  printCounts("Before", plan.before);
  printCounts("After", plan.after);
  console.log(`Rows to change: ${plan.updates.length}`);

  if (dryRun) {
    for (const update of plan.updates.slice(0, 50)) {
      const measure = rows.find(
        (r) => r.recipe_id === update.recipe_id && r.ingredient_id === update.ingredient_id,
      )?.measure;
      console.log(
        `  "${measure}" -> ${update.amount_value ?? "null"} ${update.amount_unit ?? "null"}`,
      );
    }
    if (plan.updates.length > 50) {
      console.log(`  ...and ${plan.updates.length - 50} more`);
    }
    console.log("\nDry run: nothing written.");
    return;
  }

  let changed = 0;
  let failed = 0;
  for (const update of plan.updates) {
    const { error } = await supabase
      .from("recipe_ingredients")
      .update({ amount_value: update.amount_value, amount_unit: update.amount_unit })
      .eq("recipe_id", update.recipe_id)
      .eq("ingredient_id", update.ingredient_id);

    if (error) {
      failed += 1;
      console.error(
        `Failed to update ${update.recipe_id}/${update.ingredient_id}: ${error.message}`,
      );
    } else {
      changed += 1;
    }
  }

  console.log(`\nRows changed: ${changed}`);
  if (failed > 0) {
    console.error(`Rows failed: ${failed}`);
    process.exit(1);
  }
  console.log("Done.");
}

main();
