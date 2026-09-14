import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import type { Database, Json } from "@bartendingapp/shared";
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
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
