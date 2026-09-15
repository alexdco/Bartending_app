// Recipe difficulty and taste profile classification, used by the one-time
// classify-recipes.ts backfill script. Mirrors ingredientClassification.ts's
// structure and hash gated batching/retry pattern. Kept out of index.ts's
// export barrel since it pulls in @anthropic-ai/sdk, a service role only
// dependency that must never reach the web/mobile client bundles; import it
// via "@bartendingapp/shared/recipe-classification" instead.
//
// Difficulty is written directly to recipes.difficulty, gated by
// difficulty_source_name_hash (a hash of the instructions text), the same
// pattern ingredients.category uses. Taste profile is written as tags rows
// (kind = 'taste') linked through recipe_tags, reusing the existing catalog
// tag infrastructure instead of a new column or table.
import type { SupabaseClient } from "@supabase/supabase-js";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod/v4";
import { createHash } from "node:crypto";
import type { Database } from "./database.types";

const BATCH_SIZE = 10;
const MAX_RETRIES = 3;

const DIFFICULTIES = ["easy", "medium", "hard"] as const;
export type RecipeDifficulty = (typeof DIFFICULTIES)[number];

export const TASTE_TAGS = [
  "sweet",
  "sour",
  "bitter",
  "boozy",
  "refreshing",
  "fruity",
  "spicy",
  "creamy",
] as const;
export type TasteTag = (typeof TASTE_TAGS)[number];

function sourceNameHash(instructions: string): string {
  return createHash("sha256").update(instructions).digest("hex");
}

const ClassificationBatchSchema = z.object({
  items: z.array(
    z.object({
      id: z.string(),
      difficulty: z.enum(DIFFICULTIES),
      tasteTags: z.array(z.enum(TASTE_TAGS)).max(4),
    }),
  ),
});

interface RecipeInput {
  id: string;
  name: string;
  instructions: string;
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
          "For each cocktail below, classify its difficulty to make and its taste profile.\n\n" +
          'Difficulty is exactly one of "easy" (build over ice, stir, or top up, no special ' +
          'technique), "medium" (shaken, muddled, or a few steps), or "hard" (multiple ' +
          "techniques, precise timing, uncommon equipment, or many components).\n\n" +
          "Taste profile is 1 to 4 tags from this fixed set, the ones that best describe how " +
          `the drink tastes: ${TASTE_TAGS.join(", ")}. Pick only tags that clearly apply; do not ` +
          "force 4 if fewer fit.\n\n" +
          "Classify from the name and instructions alone. Return one item per input, in the " +
          `same order, referencing each by its id.\n\n${itemsText}`,
      },
    ],
    output_config: {
      format: zodOutputFormat(ClassificationBatchSchema),
    },
  });

  const parsed = message.parsed_output;
  if (!parsed) {
    throw new Error("recipe classification call did not return a parseable response");
  }
  return parsed.items;
}

async function upsertTasteTagIds(
  supabase: SupabaseClient<Database>,
  tasteTags: readonly TasteTag[],
): Promise<Map<TasteTag, string>> {
  const byTag = new Map<TasteTag, string>();
  for (const tag of tasteTags) {
    const { data, error } = await supabase
      .from("tags")
      .upsert({ name: tag, kind: "taste" }, { onConflict: "normalized_name" })
      .select("id")
      .single();

    if (error || !data) {
      throw new Error(`Failed to upsert taste tag "${tag}": ${error?.message}`);
    }
    byTag.set(tag, data.id);
  }
  return byTag;
}

export interface ClassifyRecipesOptions {
  reprocessAll?: boolean;
}

// Classifies every recipe whose difficulty_source_name_hash no longer
// matches its current instructions (or every row, with reprocessAll) into a
// difficulty and a taste profile. Difficulty is written to recipes directly;
// taste tags are upserted into tags (kind = 'taste') and linked via
// recipe_tags, replacing any taste tags the recipe previously had.
export async function classifyRecipes(
  supabase: SupabaseClient<Database>,
  anthropic: Anthropic,
  { reprocessAll = false }: ClassifyRecipesOptions = {},
): Promise<void> {
  const tasteTagIds = await upsertTasteTagIds(supabase, TASTE_TAGS);

  const { data: recipes, error } = await supabase
    .from("recipes")
    .select("id, name, instructions, difficulty_source_name_hash")
    .is("deleted_at", null);

  if (error) {
    throw new Error(`Failed to read recipes: ${error.message}`);
  }

  const inputs: (RecipeInput & { hash: string })[] = (recipes ?? [])
    .map((r) => ({
      id: r.id,
      name: r.name,
      instructions: r.instructions,
      hash: sourceNameHash(r.instructions),
      currentHash: r.difficulty_source_name_hash,
    }))
    .filter((r) => reprocessAll || r.currentHash !== r.hash)
    .map(({ id, name, instructions, hash }) => ({ id, name, instructions, hash }));

  console.log(`Classifying ${inputs.length} recipes in batches of ${BATCH_SIZE}...`);

  let classified = 0;
  let skipped = 0;

  for (const batch of chunk(inputs, BATCH_SIZE)) {
    const result = await withRetry(
      `recipe classification batch starting with "${batch[0]?.name}"`,
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
          difficulty: item.difficulty,
          difficulty_source_name_hash: input.hash,
        })
        .eq("id", item.id);

      if (updateError) {
        console.error(`Failed to update recipe ${item.id}'s difficulty:`, updateError);
        skipped += 1;
        continue;
      }

      const { error: deleteError } = await supabase
        .from("recipe_tags")
        .delete()
        .eq("recipe_id", item.id)
        .in("tag_id", Array.from(tasteTagIds.values()));

      if (deleteError) {
        console.error(`Failed to clear recipe ${item.id}'s taste tags:`, deleteError);
        skipped += 1;
        continue;
      }

      const links = item.tasteTags
        .map((tag) => tasteTagIds.get(tag))
        .filter((tagId): tagId is string => tagId !== undefined)
        .map((tagId) => ({ recipe_id: item.id, tag_id: tagId }));

      if (links.length > 0) {
        const { error: insertError } = await supabase.from("recipe_tags").insert(links);
        if (insertError) {
          console.error(`Failed to insert recipe ${item.id}'s taste tags:`, insertError);
          skipped += 1;
          continue;
        }
      }

      classified += 1;
    }

    console.log(`Classified batch of ${result.length} recipes (${classified} so far).`);
  }

  console.log(
    `Recipe classification done. ${classified} classified, ${skipped} skipped after retries.` +
      (skipped > 0 ? " Rerun to retry skipped recipes." : ""),
  );
}
