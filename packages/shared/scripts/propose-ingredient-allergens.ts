// Propose step for spec 0043 (recipe drink style, tips, and allergens), AC-9.
// Asks Claude Haiku which of the fixed allergens each ingredient carries,
// with a short reason per flag, and writes a review file sorted by name.
// Never writes to the database; apply-ingredient-allergens.ts does that
// after you review every flag.
//
// Usage:
//   ANTHROPIC_API_KEY=... SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... pnpm propose-ingredient-allergens
//   --all     every ingredient, not only the ones not reviewed yet
//   --force   replace an existing review file
import { createClient } from "@supabase/supabase-js";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod/v4";
import type { Database } from "../src/database.types";
import { ALLERGENS } from "../src/allergens";
import {
  sortByName,
  validateIngredientAllergenProposals,
  type IngredientAllergenProposal,
} from "../src/ingredientAllergenProposals";
import {
  assertSameIds,
  chunk,
  HAIKU_MODEL,
  MAX_RETRIES,
  refuseToOverwrite,
  requireEnv,
  reviewFilePath,
  withRetry,
  writeReviewFile,
} from "./review-file";

const REVIEW_FILE_PATH = reviewFilePath("ingredient-allergens-proposals.json");
const BATCH_SIZE = 25;

const ResponseSchema = z.object({
  ingredients: z.array(
    z.object({
      id: z.string(),
      flags: z.array(
        z.object({
          allergen: z.enum(ALLERGENS),
          reason: z.string().describe("One short sentence on why this ingredient carries it."),
        }),
      ),
    }),
  ),
});

interface IngredientInput {
  id: string;
  name: string;
  category: string | null;
}

async function proposeBatch(
  anthropic: Anthropic,
  batch: readonly IngredientInput[],
): Promise<IngredientAllergenProposal[]> {
  const list = batch
    .map((i) => `id: ${i.id}\nname: ${i.name}\ncategory: ${i.category ?? "unknown"}`)
    .join("\n---\n");

  const message = await anthropic.messages.parse({
    model: HAIKU_MODEL,
    max_tokens: 8192,
    messages: [
      {
        role: "user",
        content:
          `For each cocktail ingredient below, list which of these allergens it may contain, ` +
          `using only these values: ${ALLERGENS.join(", ")}. "shellfish" covers crustaceans ` +
          `and molluscs. Flag an allergen when in doubt, since a false positive is safer than ` +
          `a miss and a person reviews every flag. Typical cases: cream liqueurs and dairy ` +
          `carry milk; orgeat and amaretto carry tree_nuts; beer and malt carry gluten; wine, ` +
          `vermouth, sherry, port, and champagne carry sulfites; Worcestershire sauce carries ` +
          `fish; Clamato carries shellfish; egg white and egg yolk carry egg. Plain spirits, ` +
          `juices, syrups, sodas, ice, and water usually carry none, so return an empty list ` +
          `for them. Give a one sentence reason for every flag. Return one entry per ` +
          `ingredient, echoing its id exactly.\n\n${list}`,
      },
    ],
    output_config: { format: zodOutputFormat(ResponseSchema) },
  });

  const parsed = message.parsed_output;
  if (!parsed) {
    throw new Error(`no parseable response (stop_reason: ${message.stop_reason})`);
  }

  assertSameIds(
    batch.map((i) => i.id),
    parsed.ingredients.map((i) => i.id),
  );

  const names = new Map(batch.map((i) => [i.id, i.name]));
  const proposals = parsed.ingredients.map((item) => ({
    id: item.id,
    name: names.get(item.id) ?? "",
    allergens: [...new Set(item.flags.map((flag) => flag.allergen))],
    reasons: Object.fromEntries(item.flags.map((flag) => [flag.allergen, flag.reason])),
  }));

  const validation = validateIngredientAllergenProposals(proposals);
  if (!validation.ok) {
    throw new Error(`invalid proposals: ${validation.errors.join("; ")}`);
  }
  return [...validation.proposals];
}

async function main() {
  const all = process.argv.includes("--all");
  const force = process.argv.includes("--force");
  refuseToOverwrite(REVIEW_FILE_PATH, force);

  const env = requireEnv(["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "ANTHROPIC_API_KEY"]);
  const supabase = createClient<Database>(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
  const anthropic = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });

  if (all) {
    console.warn(
      "--all: applying this file will overwrite every ingredient's existing allergens, " +
        "including ones an admin edited.",
    );
  }

  // Every ingredient, staples and unused ones included, so the admin list
  // never keeps a permanent "not reviewed" backlog.
  let query = supabase.from("ingredients").select("id, name, category").order("name");
  if (!all) {
    query = query.is("allergens", null);
  }

  const { data, error } = await query;
  if (error) {
    console.error("Failed to read ingredients:", error);
    process.exit(1);
  }

  const inputs: IngredientInput[] = data ?? [];
  console.log(
    `Proposing allergens for ${inputs.length} ingredients in batches of ${BATCH_SIZE}...`,
  );

  let proposals: readonly IngredientAllergenProposal[] = [];
  let dropped = 0;

  for (const batch of chunk(inputs, BATCH_SIZE)) {
    const result = await withRetry(`Batch starting with "${batch[0]?.name}"`, () =>
      proposeBatch(anthropic, batch),
    );
    if (result) {
      proposals = sortByName([...proposals, ...result]);
      writeReviewFile(REVIEW_FILE_PATH, proposals);
      console.log(`Proposed ${proposals.length} of ${inputs.length}.`);
    } else {
      dropped += batch.length;
      console.error(
        `Dropped the batch starting with "${batch[0]?.name}" after ${MAX_RETRIES} failed attempts.`,
      );
    }
  }

  console.log(
    `Done. ${proposals.length} proposals in ${REVIEW_FILE_PATH}.` +
      (dropped > 0 ? ` ${dropped} ingredients dropped; apply, then rerun to retry them.` : "") +
      " Review every flag and reason, then run apply-ingredient-allergens.",
  );
}

main();
