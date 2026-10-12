import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@bartendingapp/shared";
import { GLASS_MAP } from "@bartendingapp/shared/catalog-names";
import { parseCatalogOverrides } from "./catalogOverridesSchema";
import { findUnlistedIngredients, type ReportRecipe } from "./unlistedIngredients";

// Spec 0036 AC-8: prints every live catalog recipe whose English
// instructions name an ingredient it doesn't list. Read only; exit code 0.

const OVERRIDES_PATH = fileURLToPath(new URL("./catalogOverrides.json", import.meta.url));

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

async function main(): Promise<void> {
  const supabase = createClient<Database>(
    requireEnv("SUPABASE_URL"),
    requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { persistSession: false } },
  );

  const overrides = parseCatalogOverrides(JSON.parse(readFileSync(OVERRIDES_PATH, "utf-8")));

  const [recipesResult, ingredientsResult] = await Promise.all([
    supabase
      .from("recipes")
      .select("source_id, name, instructions, recipe_ingredients ( ingredients ( name ) )")
      .eq("source", "catalog")
      .not("source_id", "like", "custom:%")
      .is("deleted_at", null),
    supabase.from("ingredients").select("name"),
  ]);

  if (recipesResult.error)
    throw new Error(`Could not read recipes: ${recipesResult.error.message}`);
  if (ingredientsResult.error) {
    throw new Error(`Could not read ingredients: ${ingredientsResult.error.message}`);
  }

  const recipes: ReportRecipe[] = recipesResult.data
    .filter((row) => overrides.recipes[row.source_id]?.reviewed !== true)
    .map((row) => ({
      sourceId: row.source_id,
      name: row.name,
      instructions: row.instructions,
      ingredientNames: row.recipe_ingredients.flatMap((ri) =>
        ri.ingredients ? [ri.ingredients.name] : [],
      ),
    }));

  const findings = findUnlistedIngredients(
    recipes,
    ingredientsResult.data.map((row) => row.name),
    overrides.unlistedIngredientSynonyms,
    overrides.staples,
    // Glass names ("whiskey sour glass", "coffee mug") aren't ingredients.
    [...Object.keys(GLASS_MAP), ...Object.values(GLASS_MAP)],
  ).sort((a, b) => a.recipeName.localeCompare(b.recipeName));

  if (findings.length === 0) {
    console.log("No unresolved unlisted ingredients.");
    return;
  }

  console.table(
    findings.map((finding) => ({
      recipe: finding.recipeName,
      "source id": finding.sourceId,
      "named ingredient": finding.ingredientName,
      "matched text": finding.matchedPhrase,
    })),
  );
  console.log(
    `${findings.length} finding(s) across ${new Set(findings.map((f) => f.sourceId)).size} recipe(s).`,
  );
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
