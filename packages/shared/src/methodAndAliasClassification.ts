// Recipe build method/straining and bartender shorthand alias
// classification, used by the one-time classify-method-and-aliases.ts
// backfill script. Mirrors recipeClassification.ts's structure and hash
// gated batching/retry pattern, but is its own module since it gates on
// recipes.method_source_name_hash, a separate column from difficulty's
// gate (method/straining/aliases are a genuinely different classification
// concern, not the same Haiku call). Kept out of index.ts's export barrel
// since it pulls in @anthropic-ai/sdk, a service role only dependency that
// must never reach the web/mobile client bundles; import it via
// "@bartendingapp/shared/method-and-alias-classification" instead.
//
// method/straining are written directly to recipes.method/straining, gated
// by method_source_name_hash. Aliases are inserted into recipe_aliases
// (source = 'generated'); existing generated aliases for a reclassified
// recipe are replaced, manual aliases are never touched.
//
// Spec 0054 AC-8: method is one of RECIPE_METHODS or null (an enum in the
// structured output). The classifier writes method_source = 'classifier'
// with a non null method, and never changes method or method_source on a
// recipe an admin set (method_source = 'admin'), even with --all; straining
// and aliases are still written there. A null result clears a classifier
// method and still stamps the hash, so an unclear recipe stays null until
// its instructions change or --all runs. A failed batch writes nothing, so
// its hashes stay old and the next run retries it.
import type { SupabaseClient } from "@supabase/supabase-js";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod/v4";
import { createHash } from "node:crypto";
import type { Database } from "./database.types";
import { RECIPE_METHODS, toRecipeMethod, type RecipeMethod } from "./recipes";

const BATCH_SIZE = 10;
const MAX_RETRIES = 3;
const MAX_ALIASES_PER_RECIPE = 5;

function sourceNameHash(instructions: string): string {
  return createHash("sha256").update(instructions).digest("hex");
}

const ClassificationBatchSchema = z.object({
  items: z.array(
    z.object({
      id: z.string(),
      method: z.enum(RECIPE_METHODS).nullable(),
      straining: z.string().max(40).nullable(),
      aliases: z.array(z.string().max(40)).max(MAX_ALIASES_PER_RECIPE),
    }),
  ),
});

interface RecipeInput {
  id: string;
  name: string;
  instructions: string;
}

export type MethodColumnsUpdate =
  | { method: RecipeMethod; method_source: "classifier" }
  | { method: null; method_source: null }
  | Record<string, never>;

/**
 * The method columns a classifier result writes (spec 0054 AC-8): nothing on
 * an admin pick, the method with source 'classifier' when one came back, and
 * both null otherwise.
 */
export function methodColumnsUpdate(
  currentSource: string | null,
  classified: RecipeMethod | null,
): MethodColumnsUpdate {
  if (currentSource === "admin") {
    return {};
  }
  return classified === null
    ? { method: null, method_source: null }
    : { method: classified, method_source: "classifier" };
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

async function classifyBatch(anthropic: Anthropic, batch: RecipeInput[]) {
  const itemsText = batch
    .map((item) => `id: ${item.id}\nname: ${item.name}\ninstructions: ${item.instructions}`)
    .join("\n---\n");

  const message = await anthropic.messages.parse({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 4096,
    messages: [
      {
        role: "user",
        content:
          "For each cocktail below, identify its build method, straining technique, and " +
          "common bartender shorthand names.\n\n" +
          "Method is exactly one of shake, stir, build, blend, or layer, describing how the " +
          "drink is mixed: shake for shaken drinks (a dry shake or whip shake is still " +
          "shake), stir for stirred drinks (a throw or a roll is stir), build for drinks " +
          "made in the serving glass (a swizzle is build), blend for blender drinks, and " +
          "layer for drinks floated in layers. Use null when the instructions don't clearly " +
          "indicate one, or when you are unsure.\n\n" +
          'Straining is a short phrase (e.g. "Double strain", "Fine strain", "No strain") ' +
          "when the method involves straining, or null if not applicable.\n\n" +
          "Aliases are up to 5 short, common bartender abbreviations or nicknames a working " +
          'bartender would actually say for this drink (e.g. "old f" and "old fash" for an ' +
          'Old Fashioned, "esp mart" for an Espresso Martini). Only include genuinely common ' +
          "shorthand, not a rephrasing of the full name; an empty list is correct when none " +
          `exist.\n\nReturn one item per input, in the same order, referencing each by its ` +
          `id.\n\n${itemsText}`,
      },
    ],
    output_config: {
      format: zodOutputFormat(ClassificationBatchSchema),
    },
  });

  const parsed = message.parsed_output;
  if (!parsed) {
    throw new Error("method/alias classification call did not return a parseable response");
  }
  return parsed.items;
}

export interface ClassifyMethodAndAliasesOptions {
  reprocessAll?: boolean;
}

// Classifies every recipe whose method_source_name_hash no longer matches
// its current instructions (or every row, with reprocessAll) into a
// method, straining technique, and a set of generated shorthand aliases.
export async function classifyMethodAndAliases(
  supabase: SupabaseClient<Database>,
  anthropic: Anthropic,
  { reprocessAll = false }: ClassifyMethodAndAliasesOptions = {},
): Promise<void> {
  const { data: recipes, error } = await supabase
    .from("recipes")
    .select("id, name, instructions, method_source, method_source_name_hash")
    .is("deleted_at", null);

  if (error) {
    throw new Error(`Failed to read recipes: ${error.message}`);
  }

  const inputs: (RecipeInput & { hash: string; methodSource: string | null })[] = (recipes ?? [])
    .map((r) => ({
      id: r.id,
      name: r.name,
      instructions: r.instructions,
      hash: sourceNameHash(r.instructions),
      currentHash: r.method_source_name_hash,
      methodSource: r.method_source,
    }))
    .filter((r) => reprocessAll || r.currentHash !== r.hash)
    .map(({ id, name, instructions, hash, methodSource }) => ({
      id,
      name,
      instructions,
      hash,
      methodSource,
    }));

  console.log(`Classifying ${inputs.length} recipes in batches of ${BATCH_SIZE}...`);

  let classified = 0;
  let skipped = 0;
  let adminKept = 0;
  const methodCounts = new Map<RecipeMethod | "null", number>();

  for (const batch of chunk(inputs, BATCH_SIZE)) {
    const result = await withRetry(
      `method/alias classification batch starting with "${batch[0]?.name}"`,
      () => classifyBatch(anthropic, batch),
    );

    if (!result) {
      skipped += batch.length;
      continue;
    }

    const byId = new Map(batch.map((r) => [r.id, r]));

    for (const item of result) {
      const input = byId.get(item.id);
      if (!input) {
        continue;
      }

      const { error: updateError } = await supabase
        .from("recipes")
        .update({
          ...methodColumnsUpdate(input.methodSource, toRecipeMethod(item.method)),
          straining: item.straining,
          method_source_name_hash: input.hash,
        })
        .eq("id", item.id);

      if (updateError) {
        console.error(`Failed to update recipe ${item.id}'s method/straining:`, updateError);
        skipped += 1;
        continue;
      }

      const { error: deleteError } = await supabase
        .from("recipe_aliases")
        .delete()
        .eq("recipe_id", item.id)
        .eq("source", "generated");

      if (deleteError) {
        console.error(`Failed to clear recipe ${item.id}'s generated aliases:`, deleteError);
        skipped += 1;
        continue;
      }

      if (item.aliases.length > 0) {
        const { error: insertError } = await supabase.from("recipe_aliases").insert(
          item.aliases.map((alias) => ({
            recipe_id: item.id,
            alias,
            source: "generated" as const,
          })),
        );

        if (insertError) {
          console.error(`Failed to insert recipe ${item.id}'s aliases:`, insertError);
          skipped += 1;
          continue;
        }
      }

      classified += 1;
      if (input.methodSource === "admin") {
        adminKept += 1;
      } else {
        const key = toRecipeMethod(item.method) ?? "null";
        methodCounts.set(key, (methodCounts.get(key) ?? 0) + 1);
      }
    }

    console.log(`Classified batch of ${result.length} recipes (${classified} so far).`);
  }

  const perMethod = [...RECIPE_METHODS, "null" as const]
    .map((key) => `${key}: ${methodCounts.get(key) ?? 0}`)
    .join(", ");

  console.log(
    `Method/alias classification done. ${classified} classified, ${skipped} failed after ` +
      `retries, ${adminKept} admin methods kept.\nMethods written: ${perMethod}.` +
      (skipped > 0 ? " Rerun to retry failed recipes." : ""),
  );
}
