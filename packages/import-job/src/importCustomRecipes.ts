import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import Anthropic from "@anthropic-ai/sdk";
import type { Database, Json } from "@bartendingapp/shared";
import { translateCatalog } from "@bartendingapp/shared/catalog-translation";
import { parseCustomRecipes } from "./customRecipesSchema";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

const CUSTOM_RECIPES_PATH = fileURLToPath(new URL("./customRecipes.json", import.meta.url));

async function main(): Promise<void> {
  const supabaseUrl = requireEnv("SUPABASE_URL");
  const serviceRoleKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");

  const supabase = createClient<Database>(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  const raw: unknown = JSON.parse(readFileSync(CUSTOM_RECIPES_PATH, "utf-8"));
  const recipes = parseCustomRecipes(raw);

  const payload = recipes.map((recipe) => ({
    sourceId: `custom:${recipe.slug}`,
    name: recipe.name,
    instructions: recipe.instructions,
    imageUrl: recipe.imageUrl,
    glass: recipe.glass,
    alcoholicStatus: recipe.alcoholicStatus,
    ingredients: recipe.ingredients.map((ingredient, index) => ({
      ingredientName: ingredient.ingredientName,
      measure: ingredient.measure,
      sortOrder: index + 1,
    })),
    tags: recipe.tags.map((tagName) => ({ tagName })),
  }));

  const { error } = await supabase.rpc("import_custom_recipes", {
    recipes: payload as unknown as Json,
  });

  if (error) {
    throw new Error(`Custom recipe import failed: ${error.message}`);
  }

  console.log(`Imported ${payload.length} custom recipe(s).`);

  const anthropicApiKey = process.env.ANTHROPIC_API_KEY;
  if (!anthropicApiKey) {
    console.warn("ANTHROPIC_API_KEY not set; skipping catalog translation step.");
    return;
  }

  // Runs after the import transaction above has committed, not inside its
  // advisory lock (AC-9); only genuinely new or changed rows are
  // (re)translated (AC-17).
  const anthropic = new Anthropic({ apiKey: anthropicApiKey });
  try {
    await translateCatalog(supabase, anthropic);
  } catch (translationError) {
    console.error(
      "Catalog translation step failed; will retry on the next import run:",
      translationError,
    );
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
