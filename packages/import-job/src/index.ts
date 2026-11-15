import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import Anthropic from "@anthropic-ai/sdk";
import type { Database, Json } from "@bartendingapp/shared";
// A subpath, not the barrel: tsx loads the barrel as CommonJS, which hides
// its `export *` names at runtime.
import { uploadRecipeImagePair, type RecipeImageOrigin } from "@bartendingapp/shared/recipe-images";
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
  findHiddenSourceIds,
  findUnknownStaples,
  summarizeOverrides,
  validateOverrides,
} from "./overrides";
import { findIgnoredOverrides, formatFreshnessReport, parseImportReport } from "./freshnessReport";
import { catalogSourceHash } from "./sourceHash";
import {
  BACKFILL_GUARD_MESSAGE,
  backfillGuardBlocks,
  checkImportFlags,
  parseImportFlags,
} from "./importGuard";
import { findLockCandidates, type LockCandidate, type StoredLockRow } from "./lockDiff";

const OVERRIDES_PATH = fileURLToPath(new URL("./catalogOverrides.json", import.meta.url));
const LOCK_CANDIDATES_PATH = fileURLToPath(new URL("../lock-candidates.json", import.meta.url));
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

/**
 * Spec 0056 AC-15: whether any import has written a source_hash yet. Before
 * the hash migration ships the column doesn't exist, which also means no
 * hashed run has happened.
 */
async function hasHashedRun(supabase: SupabaseClient<Database>): Promise<boolean> {
  const { data, error } = await supabase
    .from("recipes")
    .select("id")
    .not("source_hash", "is", null)
    .limit(1);

  if (error?.code === "42703") {
    return false;
  }
  if (error) {
    throw new Error(`Could not check for a hashed import run: ${error.message}`);
  }
  return (data ?? []).length > 0;
}

/**
 * Spec 0056 AC-13: how many recipes are locked, and how many of those are
 * changed upstream (the same rule as the admin badge). Read only.
 */
async function countLockedRecipes(
  supabase: SupabaseClient<Database>,
): Promise<{ locked: number; changedUpstream: number }> {
  const [locked, hashed] = await Promise.all([
    supabase
      .from("recipes")
      .select("id", { count: "exact", head: true })
      .not("admin_locked_at", "is", null),
    supabase
      .from("recipes")
      .select("source_hash, latest_source_hash")
      .not("admin_locked_at", "is", null)
      .not("source_hash", "is", null),
  ]);

  if (locked.error) {
    throw new Error(`Could not count locked recipes: ${locked.error.message}`);
  }
  if (hashed.error) {
    throw new Error(`Could not count changed upstream recipes: ${hashed.error.message}`);
  }

  return {
    locked: locked.count ?? 0,
    changedUpstream: (hashed.data ?? []).filter((row) => row.latest_source_hash !== row.source_hash)
      .length,
  };
}

/** Every unlocked live TheCocktailDB recipe's import owned content (spec 0056 AC-8), paged. */
async function fetchStoredLockRows(
  supabase: SupabaseClient<Database>,
): Promise<readonly StoredLockRow[]> {
  const pages: StoredLockRow[][] = [];

  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from("recipes")
      .select(
        "source_id, name, glass, alcoholic_status, recipe_ingredients(measure, sort_order, ingredients(normalized_name)), recipe_tags(tags(normalized_name, kind))",
      )
      .eq("source", "catalog")
      .is("deleted_at", null)
      .is("admin_locked_at", null)
      .not("source_id", "like", "custom:%")
      .order("source_id")
      .range(from, from + PAGE_SIZE - 1);

    if (error) {
      throw new Error(`Could not read stored recipes to diff: ${error.message}`);
    }

    pages.push(
      (data ?? []).map((row) => ({
        sourceId: row.source_id,
        name: row.name,
        glass: row.glass,
        alcoholicStatus: row.alcoholic_status,
        ingredients: row.recipe_ingredients.flatMap((line) =>
          line.ingredients?.normalized_name
            ? [
                {
                  normalizedName: line.ingredients.normalized_name,
                  measure: line.measure,
                  sortOrder: line.sort_order,
                },
              ]
            : [],
        ),
        catalogTags: row.recipe_tags.flatMap((link) =>
          link.tags?.kind === "catalog" && link.tags.normalized_name
            ? [link.tags.normalized_name]
            : [],
        ),
      })),
    );

    if (!data || data.length < PAGE_SIZE) {
      return pages.flat();
    }
  }
}

/** normalized_name of every tag that isn't a catalog tag (taste tags, spec 0043). */
async function fetchNonCatalogTagNames(
  supabase: SupabaseClient<Database>,
): Promise<ReadonlySet<string>> {
  const { data, error } = await supabase
    .from("tags")
    .select("normalized_name")
    .neq("kind", "catalog");
  if (error) {
    throw new Error(`Could not read tags to diff: ${error.message}`);
  }
  return new Set((data ?? []).flatMap((row) => (row.normalized_name ? [row.normalized_name] : [])));
}

function printLockCandidates(candidates: readonly LockCandidate[]): void {
  const fieldCounts = candidates
    .flatMap((candidate) => candidate.fields)
    .reduce<Readonly<Record<string, number>>>(
      (counts, field) => ({ ...counts, [field]: (counts[field] ?? 0) + 1 }),
      {},
    );
  console.log(`Lock candidates: ${candidates.length}, written to ${LOCK_CANDIDATES_PATH}`);
  Object.entries(fieldCounts).forEach(([field, count]) => console.log(`  ${field}: ${count}`));
  console.log(
    "Review the file, delete entries you don't want locked, then run import:apply-locks.",
  );
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
  const flags = parseImportFlags(process.argv);
  const { dryRun } = flags;
  const copyImages = process.argv.includes("--copy-images");

  const flagsError = checkImportFlags(flags);
  if (flagsError) {
    throw new Error(flagsError);
  }

  const supabase = createClient<Database>(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  // Spec 0056 AC-15: checked before any write, image copies included.
  if (!dryRun && backfillGuardBlocks(flags, await hasHashedRun(supabase))) {
    throw new Error(BACKFILL_GUARD_MESSAGE);
  }

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

    const lockCounts = await countLockedRecipes(supabase);
    console.log(`  locked recipes:     ${lockCounts.locked}`);
    console.log(`  changed upstream:   ${lockCounts.changedUpstream}`);

    if (flags.diffLocks) {
      const [storedRows, nonCatalogTagNames] = await Promise.all([
        fetchStoredLockRows(supabase),
        fetchNonCatalogTagNames(supabase),
      ]);
      const candidates = findLockCandidates(storedRows, applied.drinks, nonCatalogTagNames);
      writeFileSync(LOCK_CANDIDATES_PATH, `${JSON.stringify(candidates, null, 2)}\n`);
      printLockCandidates(candidates);
    }
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
    // Spec 0056 AC-5: what this run would write, after overrides.
    sourceHash: catalogSourceHash(drink),
  }));

  const { data: rawReport, error } = await supabase.rpc("import_catalog", {
    drinks: payload as unknown as Json,
    merges: applied.merges as unknown as Json,
    staple_names: applied.stapleNames,
    hidden_source_ids: findHiddenSourceIds(transformed, applied.drinks),
  });

  if (error) {
    throw new Error(`Import failed, no recipes were marked removed: ${error.message}`);
  }

  console.log(
    `Imported ${payload.length} recipes (${transformed.length - payload.length} hidden, ${applied.merges.length} merged).`,
  );

  // The import has committed by now; an unreadable report is a warning, not a failure.
  const report = parseImportReport(rawReport);
  if (report.error === null) {
    formatFreshnessReport(
      report.data,
      findIgnoredOverrides(overrides.recipes, report.data.lockedSkipped),
    ).forEach((line) => console.log(line));
  } else {
    console.warn(`Could not read the freshness report: ${report.error}`);
  }

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
