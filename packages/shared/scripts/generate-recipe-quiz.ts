// One-shot generation script for spec 0026 (learn quizzes): drafts a quiz on
// a recipe tag or region grouping's real ingredient/glassware/region data.
// Inserts one quizzes row (status = 'draft') plus 5 to 8 quiz_questions
// rows. Review and publish happens by editing the row directly in Supabase
// Studio; there is no in app publish action (AC-11).
//
// The generation logic itself lives in quizGeneration.ts.
//
// Usage:
//   ANTHROPIC_API_KEY=... SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
//     pnpm generate-recipe-quiz --title "Caribbean Quiz" --region Caribbean
//   ANTHROPIC_API_KEY=... SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
//     pnpm generate-recipe-quiz --title "Tiki Quiz" --tag "<tags.id>"
//
// Running twice for the same grouping creates two separate draft quizzes;
// there is no dedupe (AC-10).
import { createClient } from "@supabase/supabase-js";
import Anthropic from "@anthropic-ai/sdk";
import type { Database } from "../src/database.types";
import { generateRecipeQuiz } from "../src/quizGeneration";

function readArg(name: string): string | undefined {
  const flag = `--${name}`;
  const index = process.argv.indexOf(flag);
  return index !== -1 ? process.argv[index + 1] : undefined;
}

async function main() {
  const title = readArg("title");
  const region = readArg("region");
  const tagId = readArg("tag");

  if (!title || (!region && !tagId) || (region && tagId)) {
    console.error(
      "Usage: pnpm generate-recipe-quiz --title <title> --region <region>\n" +
        "   or: pnpm generate-recipe-quiz --title <title> --tag <tags.id>\n" +
        "Exactly one of --region or --tag must be given.",
    );
    process.exit(1);
  }

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

  const sourceType = region ? ("recipe_region" as const) : ("recipe_tag" as const);
  const sourceRef = region ?? tagId!;

  const recipeIdsQuery = region
    ? supabase.from("recipes").select("id").eq("region", region).is("deleted_at", null)
    : supabase.from("recipe_tags").select("recipe_id").eq("tag_id", tagId!);

  const { data: recipeIdRows, error: recipeIdsError } = await recipeIdsQuery;

  if (recipeIdsError) {
    console.error(`Failed to look up recipes for this grouping:`, recipeIdsError);
    process.exit(1);
  }

  const recipeIds = (recipeIdRows ?? []).map((row) =>
    "id" in row ? row.id : (row as { recipe_id: string }).recipe_id,
  );

  if (recipeIds.length === 0) {
    console.error(
      `No recipes found for ${region ? `region "${region}"` : `tag "${tagId}"`}. Nothing to generate a quiz from.`,
    );
    process.exit(1);
  }

  const { data: recipes, error: recipesError } = await supabase
    .from("recipes")
    .select("name, glass, region, recipe_ingredients(sort_order, ingredients(name))")
    .in("id", recipeIds)
    .is("deleted_at", null);

  if (recipesError) {
    console.error("Failed to read recipe detail for this grouping:", recipesError);
    process.exit(1);
  }

  if (!recipes || recipes.length === 0) {
    console.error("No recipes found for this grouping. Nothing to generate a quiz from.");
    process.exit(1);
  }

  const { id } = await generateRecipeQuiz(supabase, anthropic, {
    title,
    sourceType,
    sourceRef,
    recipes: recipes.map((recipe) => ({
      name: recipe.name,
      glass: recipe.glass,
      region: recipe.region,
      ingredients: [...recipe.recipe_ingredients]
        .sort((a, b) => a.sort_order - b.sort_order)
        .map((ri) => ri.ingredients.name),
    })),
  });

  console.log(
    `\nDraft quiz created: ${id} (status: draft). Review and publish it in Supabase Studio.`,
  );
}

main();
