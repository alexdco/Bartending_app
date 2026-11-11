// Shared translation logic for spec 0020 (multi language support), used by
// both the one-time translate-catalog.ts backfill script and the import
// job's ongoing translation step (build plan steps 3 and 6). Kept out of
// index.ts's export barrel since it pulls in @anthropic-ai/sdk, a service
// role only dependency that must never reach the web/mobile client bundles;
// import it via "@bartendingapp/shared/catalog-translation" instead.
//
// Skips recipes/ingredients whose source_name_hash already matches the
// current English content (AC-17), so a call only translates new or changed
// rows, bounding ongoing AI cost regardless of how often it runs.
import type { SupabaseClient } from "@supabase/supabase-js";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod/v4";
import { createHash } from "node:crypto";
import type { Database } from "./database.types";
import { normalizeFrenchTypography } from "./frenchTypography";
import { normalizeRussianTypography } from "./russianTypography";
import { normalizeHindiTypography } from "./hindiTypography";
import {
  CATALOG_TRANSLATION_LOCALES,
  LOCALE_AI_LANGUAGE,
  LOCALE_AI_TERMS,
  type Locale,
  type NonDefaultLocale,
} from "./locale";

const BATCH_SIZE = 10;
const MAX_RETRIES = 3;

function sourceNameHash(...parts: string[]): string {
  return createHash("sha256").update(parts.join(" ")).digest("hex");
}

const RecipeTranslationSchema = z.object({
  id: z.string(),
  name: z.string(),
  instructions: z.string(),
  glass: z.string().nullable(),
  ingredient_measures: z.array(
    z.object({
      ingredient_id: z.string(),
      measure: z.string().nullable(),
    }),
  ),
});

const RecipeTranslationBatchSchema = z.object({
  recipes: z.array(RecipeTranslationSchema),
});

const NameTranslationBatchSchema = z.object({
  items: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
    }),
  ),
});

interface RecipeInput {
  id: string;
  name: string;
  instructions: string;
  glass: string | null;
  ingredients: { ingredient_id: string; name: string; measure: string | null }[];
}

export interface NameInput {
  id: string;
  name: string;
}

/**
 * The punctuation pass a locale's AI output gets before it is stored: French
 * typography for `fr` (spec 0046 AC-1), Russian for `ru` (spec 0047 AC-1),
 * Hindi for `hi` (spec 0048 AC-1), unchanged text for every other locale.
 */
export function localeTypography(locale: Locale): (text: string) => string {
  if (locale === "fr") return normalizeFrenchTypography;
  if (locale === "ru") return normalizeRussianTypography;
  if (locale === "hi") return normalizeHindiTypography;
  return (text) => text;
}

/**
 * The returned measures worth storing. A line with no English measure is sent
 * as "(none)", which the model may translate literally, so it never gets a row.
 */
export function translatableMeasures<T extends { ingredient_id: string; measure: string | null }>(
  source: readonly { ingredient_id: string; measure: string | null }[],
  translated: readonly T[],
): readonly T[] {
  const measured = new Set(
    source.filter((ing) => ing.measure !== null).map((ing) => ing.ingredient_id),
  );
  return translated.filter((m) => m.measure !== null && measured.has(m.ingredient_id));
}

/**
 * Whether a recipe needs translating into a locale: it is new, its English
 * text changed (AC-17), or a measured line has no translation row. The hash
 * doesn't cover measures, and import_catalog / admin_upsert_recipe delete and
 * reinsert recipe_ingredients, which cascades away the translated measures.
 */
export function needsRecipeTranslation({
  hash,
  existingHash,
  ingredients,
}: {
  hash: string;
  existingHash: string | undefined;
  ingredients: readonly { measure: string | null; translated: boolean }[];
}): boolean {
  return (
    existingHash !== hash || ingredients.some((ing) => ing.measure !== null && !ing.translated)
  );
}

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

async function withRetry<T>(label: string, fn: () => Promise<T>): Promise<T | null> {
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      return await fn();
    } catch (error) {
      const isLast = attempt === MAX_RETRIES - 1;
      console.error(`${label} failed (attempt ${attempt + 1}/${MAX_RETRIES}): ${error}`);
      if (isLast) {
        return null;
      }
      await new Promise((resolve) => setTimeout(resolve, 2 ** attempt * 1000));
    }
  }
  return null;
}

async function translateRecipeBatch(
  anthropic: Anthropic,
  localeName: string,
  terms: string,
  batch: RecipeInput[],
) {
  const recipesText = batch
    .map((r) => {
      const ingredientLines = r.ingredients
        .map(
          (ing) =>
            `  - ingredient_id: ${ing.ingredient_id}, name: ${ing.name}, measure: ${ing.measure ?? "(none)"}`,
        )
        .join("\n");
      return (
        `id: ${r.id}\nname: ${r.name}\nglass: ${r.glass ?? "(none)"}\ninstructions: ${r.instructions}\n` +
        `ingredients:\n${ingredientLines}`
      );
    })
    .join("\n---\n");

  const message = await anthropic.messages.parse({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 8192,
    messages: [
      {
        role: "user",
        content:
          `Translate each cocktail recipe below from English into ${localeName}. Translate the name, ` +
          `the full instructions, the glass (if present), and each ingredient's measure (if present; ` +
          `keep quantities and units, e.g. "1 1/2 oz" style measures, translated naturally). Never ` +
          `translate or alter an ingredient_id. Keep cocktail terminology natural for a home bartender ` +
          `reading in ${localeName}. Return one entry per recipe, in the same order, referencing each by ` +
          `its id, and one ingredient_measures entry per ingredient listed, in the same order, referencing ` +
          `each by its ingredient_id.${terms}\n\n${recipesText}`,
      },
    ],
    output_config: {
      format: zodOutputFormat(RecipeTranslationBatchSchema),
    },
  });

  const parsed = message.parsed_output;
  if (!parsed) {
    throw new Error("recipe translation call did not return a parseable response");
  }
  return parsed.recipes;
}

/**
 * The prompt for a batch of ingredient or tag names. The locale terms are
 * written for full sentences (Russian's address the reader and quote rules),
 * and without the label guard Haiku sometimes turned a whole batch of bare
 * names into quoted sentences aimed at the reader (spec 0047 AC-2).
 */
export function nameTranslationPrompt(
  localeName: string,
  terms: string,
  kind: "ingredient" | "tag",
  batch: readonly NameInput[],
): string {
  const itemsText = batch.map((item) => `id: ${item.id}\nname: ${item.name}`).join("\n---\n");
  return (
    `Translate each cocktail ${kind} name below from English into ${localeName}, using the term a ` +
    `home bartender shopping or reading a recipe in ${localeName} would recognize. Return one item ` +
    `per input, in the same order, referencing each by its id. Each name is a short label: return ` +
    `only the translated name itself, with no quotes, no description, and no sentence; the style ` +
    `notes below are for full sentences and do not apply to these names.${terms}\n\n${itemsText}`
  );
}

async function translateNameBatch(
  anthropic: Anthropic,
  localeName: string,
  terms: string,
  kind: "ingredient" | "tag",
  batch: NameInput[],
) {
  const message = await anthropic.messages.parse({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 4096,
    messages: [
      {
        role: "user",
        content: nameTranslationPrompt(localeName, terms, kind, batch),
      },
    ],
    output_config: {
      format: zodOutputFormat(NameTranslationBatchSchema),
    },
  });

  const parsed = message.parsed_output;
  if (!parsed) {
    throw new Error(`${kind} translation call did not return a parseable response`);
  }
  return parsed.items;
}

async function translateRecipes(
  supabase: SupabaseClient<Database>,
  anthropic: Anthropic,
  locale: Locale,
  localeName: string,
  { reprocessAll, limit }: RunOptions,
) {
  const { data: recipes, error } = await supabase
    .from("recipes")
    .select(
      "id, name, instructions, glass, recipe_ingredients ( ingredient_id, measure, ingredients ( name ), recipe_ingredient_translations ( locale ) )",
    )
    .is("deleted_at", null)
    .eq("recipe_ingredients.recipe_ingredient_translations.locale", locale);

  if (error) {
    throw new Error(`Failed to read recipes: ${error.message}`);
  }

  const { data: existingTranslations, error: existingError } = await supabase
    .from("recipe_translations")
    .select("recipe_id, source_name_hash")
    .eq("locale", locale);

  if (existingError) {
    throw new Error(`Failed to read existing recipe_translations: ${existingError.message}`);
  }

  const existingHashByRecipeId = new Map(
    (existingTranslations ?? []).map((row) => [row.recipe_id, row.source_name_hash]),
  );

  const inputs: (RecipeInput & { hash: string })[] = (recipes ?? [])
    .filter(
      (r) =>
        reprocessAll ||
        needsRecipeTranslation({
          hash: sourceNameHash(r.name, r.instructions, r.glass ?? ""),
          existingHash: existingHashByRecipeId.get(r.id),
          ingredients: (r.recipe_ingredients ?? []).map((ri) => ({
            measure: ri.measure,
            translated: ri.recipe_ingredient_translations.length > 0,
          })),
        }),
    )
    .map((r) => {
      const hash = sourceNameHash(r.name, r.instructions, r.glass ?? "");
      return {
        id: r.id,
        name: r.name,
        instructions: r.instructions,
        glass: r.glass,
        hash,
        ingredients: (r.recipe_ingredients ?? []).map((ri) => ({
          ingredient_id: ri.ingredient_id,
          name: (ri.ingredients as { name: string } | null)?.name ?? "",
          measure: ri.measure,
        })),
      };
    })
    .slice(0, limit);

  console.log(`[${locale}] Translating ${inputs.length} recipes in batches of ${BATCH_SIZE}...`);

  let translated = 0;
  let skipped = 0;

  for (const batch of chunk(inputs, BATCH_SIZE)) {
    const result = await withRetry(
      `[${locale}] recipe batch starting with "${batch[0]?.name}"`,
      () => translateRecipeBatch(anthropic, localeName, LOCALE_AI_TERMS[locale], batch),
    );

    if (!result) {
      skipped += batch.length;
      continue;
    }

    const byId = new Map(batch.map((r) => [r.id, r]));
    const measuresByRecipeId = new Map(result.map((r) => [r.id, r.ingredient_measures]));
    const typeset = localeTypography(locale);

    const recipeRows = result
      .filter((r) => byId.has(r.id))
      .map((r) => ({
        recipe_id: r.id,
        locale,
        name: typeset(r.name),
        instructions: typeset(r.instructions),
        glass: r.glass === null ? null : typeset(r.glass),
        source_name_hash: byId.get(r.id)!.hash,
      }));

    const { error: upsertError } = await supabase
      .from("recipe_translations")
      .upsert(recipeRows, { onConflict: "recipe_id,locale" });

    if (upsertError) {
      console.error(`[${locale}] Failed to upsert recipe_translations batch:`, upsertError);
      skipped += batch.length;
      continue;
    }

    const ingredientMeasureRows = result.flatMap((r) =>
      translatableMeasures(
        byId.get(r.id)?.ingredients ?? [],
        measuresByRecipeId.get(r.id) ?? [],
      ).map((m) => ({
        recipe_id: r.id,
        ingredient_id: m.ingredient_id,
        locale,
        measure: m.measure === null ? null : typeset(m.measure),
      })),
    );

    if (ingredientMeasureRows.length > 0) {
      const { error: measureError } = await supabase
        .from("recipe_ingredient_translations")
        .upsert(ingredientMeasureRows, { onConflict: "recipe_id,ingredient_id,locale" });

      if (measureError) {
        console.error(
          `[${locale}] Failed to upsert recipe_ingredient_translations batch:`,
          measureError,
        );
      }
    }

    translated += recipeRows.length;
    console.log(
      `[${locale}] Translated batch of ${recipeRows.length} recipes (${translated} so far).`,
    );
  }

  console.log(
    `[${locale}] Recipes done. ${translated} translated, ${skipped} skipped after retries.` +
      (skipped > 0 ? " Rerun to retry skipped recipes." : ""),
  );
}

async function translateIngredients(
  supabase: SupabaseClient<Database>,
  anthropic: Anthropic,
  locale: Locale,
  localeName: string,
  { reprocessAll, limit }: RunOptions,
) {
  const { data: ingredients, error } = await supabase.from("ingredients").select("id, name");

  if (error) {
    throw new Error(`Failed to read ingredients: ${error.message}`);
  }

  const { data: existingTranslations, error: existingError } = await supabase
    .from("ingredient_translations")
    .select("ingredient_id, source_name_hash")
    .eq("locale", locale);

  if (existingError) {
    throw new Error(`Failed to read existing ingredient_translations: ${existingError.message}`);
  }

  const existingHashByIngredientId = new Map(
    (existingTranslations ?? []).map((row) => [row.ingredient_id, row.source_name_hash]),
  );

  const inputs: (NameInput & { hash: string })[] = (ingredients ?? [])
    .map((i) => ({ id: i.id, name: i.name, hash: sourceNameHash(i.name) }))
    .filter((i) => reprocessAll || existingHashByIngredientId.get(i.id) !== i.hash)
    .slice(0, limit);

  console.log(
    `[${locale}] Translating ${inputs.length} ingredients in batches of ${BATCH_SIZE}...`,
  );

  let translated = 0;
  let skipped = 0;

  for (const batch of chunk(inputs, BATCH_SIZE)) {
    const result = await withRetry(
      `[${locale}] ingredient batch starting with "${batch[0]?.name}"`,
      () => translateNameBatch(anthropic, localeName, LOCALE_AI_TERMS[locale], "ingredient", batch),
    );

    if (!result) {
      skipped += batch.length;
      continue;
    }

    const byId = new Map(batch.map((i) => [i.id, i]));
    const typeset = localeTypography(locale);
    const rows = result
      .filter((r) => byId.has(r.id))
      .map((r) => ({
        ingredient_id: r.id,
        locale,
        name: typeset(r.name),
        source_name_hash: byId.get(r.id)!.hash,
      }));

    const { error: upsertError } = await supabase
      .from("ingredient_translations")
      .upsert(rows, { onConflict: "ingredient_id,locale" });

    if (upsertError) {
      console.error(`[${locale}] Failed to upsert ingredient_translations batch:`, upsertError);
      skipped += batch.length;
      continue;
    }

    translated += rows.length;
    console.log(
      `[${locale}] Translated batch of ${rows.length} ingredients (${translated} so far).`,
    );
  }

  console.log(
    `[${locale}] Ingredients done. ${translated} translated, ${skipped} skipped after retries.` +
      (skipped > 0 ? " Rerun to retry skipped ingredients." : ""),
  );
}

async function translateTags(
  supabase: SupabaseClient<Database>,
  anthropic: Anthropic,
  locale: Locale,
  localeName: string,
  { reprocessAll, limit }: RunOptions,
) {
  const { data: tags, error } = await supabase.from("tags").select("id, name");

  if (error) {
    throw new Error(`Failed to read tags: ${error.message}`);
  }

  const { data: existingTranslations, error: existingError } = await supabase
    .from("tag_translations")
    .select("tag_id")
    .eq("locale", locale);

  if (existingError) {
    throw new Error(`Failed to read existing tag_translations: ${existingError.message}`);
  }

  // tag_translations has no source_name_hash column (tag names never change
  // once imported), so "already translated" is the sole skip condition.
  const alreadyTranslated = new Set((existingTranslations ?? []).map((row) => row.tag_id));

  const inputs: NameInput[] = (tags ?? [])
    .map((t) => ({ id: t.id, name: t.name }))
    .filter((t) => reprocessAll || !alreadyTranslated.has(t.id))
    .slice(0, limit);

  console.log(`[${locale}] Translating ${inputs.length} tags in batches of ${BATCH_SIZE}...`);

  let translated = 0;
  let skipped = 0;

  for (const batch of chunk(inputs, BATCH_SIZE)) {
    const result = await withRetry(`[${locale}] tag batch starting with "${batch[0]?.name}"`, () =>
      translateNameBatch(anthropic, localeName, LOCALE_AI_TERMS[locale], "tag", batch),
    );

    if (!result) {
      skipped += batch.length;
      continue;
    }

    const byId = new Map(batch.map((t) => [t.id, t]));
    const typeset = localeTypography(locale);
    const rows = result
      .filter((r) => byId.has(r.id))
      .map((r) => ({ tag_id: r.id, locale, name: typeset(r.name) }));

    const { error: upsertError } = await supabase
      .from("tag_translations")
      .upsert(rows, { onConflict: "tag_id,locale" });

    if (upsertError) {
      console.error(`[${locale}] Failed to upsert tag_translations batch:`, upsertError);
      skipped += batch.length;
      continue;
    }

    translated += rows.length;
    console.log(`[${locale}] Translated batch of ${rows.length} tags (${translated} so far).`);
  }

  console.log(
    `[${locale}] Tags done. ${translated} translated, ${skipped} skipped after retries.` +
      (skipped > 0 ? " Rerun to retry skipped tags." : ""),
  );
}

interface RunOptions {
  reprocessAll: boolean;
  /** Caps the rows translated per kind (recipes, ingredients, tags) after the hash filter. */
  limit: number | undefined;
}

export interface TranslateCatalogOptions {
  reprocessAll?: boolean;
  /** Target locales; defaults to CATALOG_TRANSLATION_LOCALES (spec 0045 AC-9). */
  locales?: readonly NonDefaultLocale[];
  /** Caps the rows translated per kind and locale, e.g. 1 for a thin test run. */
  limit?: number;
}

// Translates every recipe/ingredient/tag whose source_name_hash no longer
// matches its current English content for that locale (or every row, with
// reprocessAll) into each target locale. Safe to call after every catalog
// import: unchanged rows are skipped via the per locale hash check (AC-17),
// so cost is bounded to genuinely new or changed content.
export async function translateCatalog(
  supabase: SupabaseClient<Database>,
  anthropic: Anthropic,
  {
    reprocessAll = false,
    locales = CATALOG_TRANSLATION_LOCALES,
    limit,
  }: TranslateCatalogOptions = {},
): Promise<void> {
  for (const locale of locales) {
    const localeName = LOCALE_AI_LANGUAGE[locale];
    console.log(`\n=== Translating catalog into ${localeName} (${locale}) ===`);
    await translateIngredients(supabase, anthropic, locale, localeName, { reprocessAll, limit });
    await translateTags(supabase, anthropic, locale, localeName, { reprocessAll, limit });
    await translateRecipes(supabase, anthropic, locale, localeName, { reprocessAll, limit });
  }
}
