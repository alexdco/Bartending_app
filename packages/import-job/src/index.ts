import { createClient } from "@supabase/supabase-js";
import Anthropic from "@anthropic-ai/sdk";
import type { Database, Json } from "@bartendingapp/shared";
import { translateCatalog } from "@bartendingapp/shared/catalog-translation";
import { classifyIngredients } from "@bartendingapp/shared/ingredient-classification";
import { fetchAllDrinks } from "./theCocktailDb";
import { transformDrink } from "./transform";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

async function main(): Promise<void> {
  const supabaseUrl = requireEnv("SUPABASE_URL");
  const serviceRoleKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");

  const supabase = createClient<Database>(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  const drinks = await fetchAllDrinks();
  const transformed = drinks.map(transformDrink);

  const payload = transformed.map((drink) => ({
    sourceId: drink.recipe.sourceId,
    name: drink.recipe.name,
    instructions: drink.recipe.instructions,
    imageUrl: drink.recipe.imageUrl,
    glass: drink.recipe.glass,
    alcoholicStatus: drink.recipe.alcoholicStatus,
    ingredients: drink.ingredients,
    tags: drink.tags,
  }));

  const { error } = await supabase.rpc("import_catalog", {
    drinks: payload as unknown as Json,
  });

  if (error) {
    throw new Error(`Import failed, no recipes were marked removed: ${error.message}`);
  }

  console.log(`Imported ${transformed.length} recipes.`);

  const anthropicApiKey = process.env.ANTHROPIC_API_KEY;
  if (!anthropicApiKey) {
    console.warn("ANTHROPIC_API_KEY not set; skipping catalog translation step.");
    return;
  }

  // Runs after the catalog transaction above has committed, not inside its
  // advisory lock: translation is a slower, network dependent step, and a
  // failure here must never block or roll back the catalog import itself
  // (AC-9). Only genuinely new or changed rows are (re)translated (AC-17).
  const anthropic = new Anthropic({ apiKey: anthropicApiKey });
  try {
    await translateCatalog(supabase, anthropic);
  } catch (translationError) {
    console.error(
      "Catalog translation step failed; will retry on the next import run:",
      translationError,
    );
  }

  // Same non fatal handling as the translation step above (spec 0022, AC-9):
  // a failure here must never block or roll back the catalog import.
  try {
    await classifyIngredients(supabase, anthropic);
  } catch (classificationError) {
    console.error(
      "Ingredient classification step failed; will retry on the next import run:",
      classificationError,
    );
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
