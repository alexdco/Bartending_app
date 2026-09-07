import { createClient } from "@supabase/supabase-js";
import type { Database, Json } from "@bartendingapp/shared";
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
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
