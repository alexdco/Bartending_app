// Ingredient category classification for spec 0022 (batch cocktail
// conversion), used by both the one-time classify-ingredients.ts backfill
// script and the import job's ongoing classification step. Kept out of
// index.ts's export barrel since it pulls in @anthropic-ai/sdk, a service
// role only dependency that must never reach the web/mobile client bundles;
// import it via "@bartendingapp/shared/ingredient-classification" instead.
//
// Skips ingredients whose source_name_hash already matches the ingredient's
// current name (AC-9), so a call only classifies new or renamed ingredients,
// bounding ongoing AI cost regardless of how often it runs. Mirrors
// catalogTranslation.ts's hash gated batching/retry pattern (spec 0020).
import type { SupabaseClient } from "@supabase/supabase-js";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod/v4";
import { createHash } from "node:crypto";
import type { Database } from "./database.types";
import type { IngredientCategory } from "./batch";

const BATCH_SIZE = 10;
const MAX_RETRIES = 3;

const INGREDIENT_CATEGORIES = ["spirit", "liqueur", "citrus", "other"] as const;

function sourceNameHash(name: string): string {
  return createHash("sha256").update(name).digest("hex");
}

const ClassificationBatchSchema = z.object({
  items: z.array(
    z.object({
      id: z.string(),
      category: z.enum(INGREDIENT_CATEGORIES),
    }),
  ),
});

interface IngredientInput {
  id: string;
  name: string;
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

async function classifyBatch(anthropic: Anthropic, batch: IngredientInput[]) {
  const itemsText = batch.map((item) => `id: ${item.id}\nname: ${item.name}`).join("\n---\n");

  const message = await anthropic.messages.parse({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 4096,
    messages: [
      {
        role: "user",
        content:
          "Classify each cocktail ingredient below into exactly one category: " +
          '"spirit" (a base spirit like vodka, gin, rum, whiskey, tequila, mezcal, brandy), ' +
          '"liqueur" (a flavored, typically lower proof modifier like triple sec, amaretto, ' +
          "vermouth, bitters, cordials), " +
          '"citrus" (a citrus fruit or its juice, e.g. lime, lemon, orange, grapefruit), or ' +
          '"other" (anything else: mixers, syrups, garnishes, non citrus fruit, dairy, etc). ' +
          "Classify from the ingredient name alone. Return one item per input, in the same " +
          `order, referencing each by its id.\n\n${itemsText}`,
      },
    ],
    output_config: {
      format: zodOutputFormat(ClassificationBatchSchema),
    },
  });

  const parsed = message.parsed_output;
  if (!parsed) {
    throw new Error("ingredient classification call did not return a parseable response");
  }
  return parsed.items;
}

export interface ClassifyIngredientsOptions {
  reprocessAll?: boolean;
}

// Classifies every ingredient whose source_name_hash no longer matches its
// current name (or every row, with reprocessAll) into spirit/liqueur/
// citrus/other. Safe to call after every catalog import: unchanged rows are
// skipped via the hash check, so cost is bounded to genuinely new or renamed
// ingredients regardless of how often it runs (AC-9).
export async function classifyIngredients(
  supabase: SupabaseClient<Database>,
  anthropic: Anthropic,
  { reprocessAll = false }: ClassifyIngredientsOptions = {},
): Promise<void> {
  const { data: ingredients, error } = await supabase
    .from("ingredients")
    .select("id, name, category_source_name_hash");

  if (error) {
    throw new Error(`Failed to read ingredients: ${error.message}`);
  }

  const inputs: (IngredientInput & { hash: string })[] = (ingredients ?? [])
    .map((i) => ({
      id: i.id,
      name: i.name,
      hash: sourceNameHash(i.name),
      currentHash: i.category_source_name_hash,
    }))
    .filter((i) => reprocessAll || i.currentHash !== i.hash)
    .map(({ id, name, hash }) => ({ id, name, hash }));

  console.log(`Classifying ${inputs.length} ingredients in batches of ${BATCH_SIZE}...`);

  let classified = 0;
  let skipped = 0;

  for (const batch of chunk(inputs, BATCH_SIZE)) {
    const result = await withRetry(
      `ingredient classification batch starting with "${batch[0]?.name}"`,
      () => classifyBatch(anthropic, batch),
    );

    if (!result) {
      skipped += batch.length;
      continue;
    }

    const byId = new Map(batch.map((i) => [i.id, i]));
    const rows = result
      .filter((r) => byId.has(r.id))
      .map((r) => ({
        id: r.id,
        category: r.category as IngredientCategory,
        hash: byId.get(r.id)!.hash,
      }));

    for (const row of rows) {
      const { error: updateError } = await supabase
        .from("ingredients")
        .update({ category: row.category, category_source_name_hash: row.hash })
        .eq("id", row.id);

      if (updateError) {
        console.error(`Failed to update ingredient ${row.id}'s category:`, updateError);
        skipped += 1;
      } else {
        classified += 1;
      }
    }

    console.log(`Classified batch of ${rows.length} ingredients (${classified} so far).`);
  }

  console.log(
    `Ingredient classification done. ${classified} classified, ${skipped} skipped after retries.` +
      (skipped > 0 ? " Rerun to retry skipped ingredients." : ""),
  );
}
