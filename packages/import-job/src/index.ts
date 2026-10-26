import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import Anthropic from "@anthropic-ai/sdk";
import {
  uploadRecipeImagePair,
  type Database,
  type Json,
  type RecipeImageOrigin,
} from "@bartendingapp/shared";
import { translateCatalog } from "@bartendingapp/shared/catalog-translation";
import { classifyIngredients } from "@bartendingapp/shared/ingredient-classification";
import { fetchAllDrinks } from "./theCocktailDb";
import { transformDrink } from "./transform";
import {
  copyCatalogImage,
  decideCatalogImage,
  resolveCatalogImages,
  type CopyDeps,
  type StoredImageState,
} from "./catalogImages";
import { downloadImage, mapWithConcurrency, processImageBuffer } from "./imageProcessing";
import { parseCatalogOverrides } from "./catalogOverridesSchema";
import {
  applyOverrides,
  findUnknownStaples,
  summarizeOverrides,
  validateOverrides,
} from "./overrides";

const OVERRIDES_PATH = fileURLToPath(new URL("./catalogOverrides.json", import.meta.url));
const COPY_CONCURRENCY = 6;
const PAGE_SIZE = 1000;

/** Every catalog recipe's stored image columns, keyed by source_id (paged past the row cap). */
async function fetchStoredImageStates(
  supabase: SupabaseClient<Database>,
): Promise<Map<string, StoredImageState>> {
  const states = new Map<string, StoredImageState>();

  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from("recipes")
      .select("source_id, image_url, image_origin, image_source_url")
      .eq("source", "catalog")
      .order("source_id")
      .range(from, from + PAGE_SIZE - 1);

    if (error) {
      throw new Error(`Could not read current recipe images: ${error.message}`);
    }

    (data ?? []).forEach((row) =>
      states.set(row.source_id, {
        imageUrl: row.image_url,
        imageOrigin: row.image_origin as RecipeImageOrigin | null,
        imageSourceUrl: row.image_source_url,
      }),
    );

    if (!data || data.length < PAGE_SIZE) {
      return states;
    }
  }
}

function copyDeps(supabase: SupabaseClient<Database>): CopyDeps {
  return {
    download: (url) => downloadImage(url),
    process: async (bytes) => {
      const result = await processImageBuffer(bytes);
      return result.error === null ? result : { data: null, error: result.error };
    },
    upload: async (sourceId, images) => {
      const result = await uploadRecipeImagePair(supabase, "catalog", sourceId, images);
      return result.error === null
        ? result
        : {
            data: null,
            error:
              result.error.reason === "request_failed" ? result.error.message : result.error.reason,
          };
    },
  };
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function failValidation(errors: readonly string[]): never {
  throw new Error(
    `catalogOverrides.json failed validation, nothing was written:\n  ${errors.join("\n  ")}`,
  );
}

async function main(): Promise<void> {
  const supabaseUrl = requireEnv("SUPABASE_URL");
  const serviceRoleKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  const dryRun = process.argv.includes("--dry-run");
  const copyImages = process.argv.includes("--copy-images");

  const supabase = createClient<Database>(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  const overrides = parseCatalogOverrides(JSON.parse(readFileSync(OVERRIDES_PATH, "utf-8")));

  const drinks = await fetchAllDrinks();
  const transformed = drinks.map(transformDrink);

  // Spec 0036 AC-12: every overrides rule is checked before any write.
  const validation = validateOverrides(transformed, overrides);
  validation.warnings.forEach((warning) => console.warn(`catalogOverrides.json: ${warning}`));
  if (validation.errors.length > 0) {
    failValidation(validation.errors);
  }

  const applied = applyOverrides(transformed, overrides);

  const { data: liveIngredients, error: ingredientsError } = await supabase
    .from("ingredients")
    .select("name");
  if (ingredientsError) {
    throw new Error(`Could not read ingredients to check staples: ${ingredientsError.message}`);
  }
  const unknownStaples = findUnknownStaples(applied.stapleNames, [
    ...(liveIngredients ?? []).map((row) => row.name),
    ...applied.drinks.flatMap((drink) => drink.ingredients.map((i) => i.ingredientName)),
  ]);
  if (unknownStaples.length > 0) {
    failValidation([`staples match no ingredient: ${unknownStaples.join(", ")}`]);
  }

  applied.unknownGlasses.forEach((glass) =>
    console.warn(
      `Unknown glass "${glass}" was sentence cased; add it to GLASS_MAP in packages/shared/src/catalogNames.ts`,
    ),
  );

  // Spec 0041: copying TheCocktailDB images into our bucket stays behind
  // --copy-images until TheCocktailDB confirms copying is allowed.
  const storedImages = await fetchStoredImageStates(supabase);
  const imageDrinks = applied.drinks.map((drink) => ({
    sourceId: drink.recipe.sourceId,
    thumbUrl: drink.recipe.imageUrl,
  }));

  if (dryRun) {
    const summary = summarizeOverrides(transformed, applied);
    const imagesToCopy = imageDrinks.filter(
      (drink) =>
        decideCatalogImage(drink.thumbUrl, storedImages.get(drink.sourceId), copyImages).kind ===
        "copy",
    ).length;
    console.log("Dry run, nothing written.");
    console.log(`  images to copy:     ${copyImages ? imagesToCopy : "off (no --copy-images)"}`);
    console.log(`  source drinks:      ${transformed.length}`);
    console.log(`  hidden:             ${summary.hidden}`);
    console.log(`  merges:             ${summary.merges}`);
    console.log(`  glass renames:      ${summary.glassRenames}`);
    console.log(`  ingredient renames: ${summary.ingredientRenames}`);
    console.log(`  recipe fixes:       ${summary.fixes}`);
    console.log(`  unknown glasses:    ${summary.unknownGlasses.join(", ") || "none"}`);
    console.log(`  staples:            ${applied.stapleNames.join(", ")}`);
    return;
  }

  const deps = copyDeps(supabase);
  const images = await resolveCatalogImages(imageDrinks, storedImages, copyImages, (jobs) =>
    mapWithConcurrency(jobs, COPY_CONCURRENCY, (job) =>
      copyCatalogImage(job.sourceId, job.thumbUrl, deps),
    ),
  );
  images.failures.forEach((failure) =>
    console.warn(
      `Image copy failed for ${failure.sourceId}, hotlinking instead: ${failure.reason}`,
    ),
  );

  const payload = applied.drinks.map((drink) => ({
    sourceId: drink.recipe.sourceId,
    name: drink.recipe.name,
    instructions: drink.recipe.instructions,
    instructionsOverride: drink.recipe.instructionsOverride,
    ...images.fieldsBySourceId.get(drink.recipe.sourceId),
    glass: drink.recipe.glass,
    alcoholicStatus: drink.recipe.alcoholicStatus,
    iba: drink.recipe.iba,
    ingredients: drink.ingredients,
    tags: drink.tags,
  }));

  const { error } = await supabase.rpc("import_catalog", {
    drinks: payload as unknown as Json,
    merges: applied.merges as unknown as Json,
    staple_names: applied.stapleNames,
  });

  if (error) {
    throw new Error(`Import failed, no recipes were marked removed: ${error.message}`);
  }

  console.log(
    `Imported ${payload.length} recipes (${transformed.length - payload.length} hidden, ${applied.merges.length} merged).`,
  );

  if (copyImages) {
    console.log(
      `Images: ${images.summary.copied} copied, ${images.summary.unchanged} unchanged, ${images.summary.failed} failed.`,
    );
  }

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
