// Propose step for spec 0043 (recipe drink style, tips, and allergens), AC-7.
// Asks Claude Haiku for each live recipe's drink style family, style
// sentence, bartender tip, and presentation tip, in English and Spanish, and
// writes a review file. Never writes to the database; apply-recipe-notes.ts
// does that after you review the EN and ES text.
//
// Usage:
//   ANTHROPIC_API_KEY=... SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... pnpm propose-recipe-notes
//   --all     every live recipe, not only the ones missing an English value
//   --force   replace an existing review file
import { createClient } from "@supabase/supabase-js";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod/v4";
import type { Database } from "../src/database.types";
import { DRINK_STYLES } from "../src/drinkStyle";
import { validateRecipeNoteProposals, type RecipeNoteProposal } from "../src/recipeNoteProposals";
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

const REVIEW_FILE_PATH = reviewFilePath("recipe-notes-proposals.json");
const BATCH_SIZE = 10;
// Asked for in the prompt; the validator enforces the real 240 limit.
const TARGET_LENGTH = 200;

const NotesSchema = z.object({
  drink_style_note: z.string(),
  bartender_tip: z.string(),
  presentation_tip: z.string(),
});

const ResponseSchema = z.object({
  recipes: z.array(
    NotesSchema.extend({
      id: z.string(),
      drink_style: z.enum(DRINK_STYLES),
      es: NotesSchema,
    }),
  ),
});

interface RecipeInput {
  id: string;
  name: string;
  glass: string | null;
  instructions: string;
  ingredients: string[];
}

function describeRecipe(recipe: RecipeInput): string {
  return [
    `id: ${recipe.id}`,
    `name: ${recipe.name}`,
    `glass: ${recipe.glass ?? "unknown"}`,
    `ingredients: ${recipe.ingredients.join("; ")}`,
    `instructions: ${recipe.instructions}`,
  ].join("\n");
}

async function proposeBatch(
  anthropic: Anthropic,
  batch: readonly RecipeInput[],
): Promise<RecipeNoteProposal[]> {
  const message = await anthropic.messages.parse({
    model: HAIKU_MODEL,
    max_tokens: 8192,
    messages: [
      {
        role: "user",
        content:
          `You write short notes for a home bartending app. For each cocktail below give:\n` +
          `- drink_style: one family from ${DRINK_STYLES.join(", ")}. sour = spirit, citrus, ` +
          `and sweetener; highball = spirit lengthened with a mixer over ice; spirit_forward = ` +
          `mostly spirits and fortified wine, stirred (Martini, Manhattan, Old Fashioned); ` +
          `fizz_collins = a sour lengthened with soda; tiki = rum heavy tropical drinks; ` +
          `flip_cream = drinks built on egg, cream, or ice cream; punch = batched or shared; ` +
          `shooter = shots and layered shots; hot = served hot; frozen = blended with ice; ` +
          `other = none of these fits.\n` +
          `- drink_style_note: one sentence on what makes it that style and how it tastes.\n` +
          `- bartender_tip: one or two sentences with a practical tip for making it better.\n` +
          `- presentation_tip: one or two sentences on glass, garnish, or serving.\n` +
          `Keep each text under ${TARGET_LENGTH} characters, plain text with no markdown. ` +
          `Also give es: the same three texts written naturally in Latin American Spanish ` +
          `(not a word for word translation), same limits. Return one entry per recipe, ` +
          `echoing its id exactly.\n\n` +
          batch.map(describeRecipe).join("\n---\n"),
      },
    ],
    output_config: { format: zodOutputFormat(ResponseSchema) },
  });

  const parsed = message.parsed_output;
  if (!parsed) {
    throw new Error(`no parseable response (stop_reason: ${message.stop_reason})`);
  }

  assertSameIds(
    batch.map((r) => r.id),
    parsed.recipes.map((r) => r.id),
  );

  const names = new Map(batch.map((r) => [r.id, r.name]));
  // Name second so the reviewer sees it right under the id.
  const proposals = parsed.recipes.map(({ id, ...rest }) => ({
    id,
    name: names.get(id) ?? "",
    ...rest,
  }));

  const validation = validateRecipeNoteProposals(proposals);
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
      "--all: applying this file will overwrite every " +
        "recipe's existing style and tips, including text an admin edited.",
    );
  }

  let query = supabase
    .from("recipes")
    .select(
      "id, name, glass, instructions, recipe_ingredients ( measure, sort_order, ingredients ( name ) )",
    )
    .is("deleted_at", null)
    .order("name");
  if (!all) {
    query = query.or(
      "drink_style.is.null,drink_style_note.is.null,bartender_tip.is.null,presentation_tip.is.null",
    );
  }

  const { data, error } = await query;
  if (error) {
    console.error("Failed to read recipes:", error);
    process.exit(1);
  }

  const inputs: RecipeInput[] = (data ?? []).map((r) => ({
    id: r.id,
    name: r.name,
    glass: r.glass,
    instructions: r.instructions,
    ingredients: [...(r.recipe_ingredients ?? [])]
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((ri) => [ri.measure, ri.ingredients?.name].filter(Boolean).join(" "))
      .filter((line) => line.length > 0),
  }));

  console.log(`Proposing notes for ${inputs.length} recipes in batches of ${BATCH_SIZE}...`);

  let proposals: readonly RecipeNoteProposal[] = [];
  let dropped = 0;

  for (const batch of chunk(inputs, BATCH_SIZE)) {
    const result = await withRetry(`Batch starting with "${batch[0]?.name}"`, () =>
      proposeBatch(anthropic, batch),
    );
    if (result) {
      proposals = [...proposals, ...result];
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
      (dropped > 0 ? ` ${dropped} recipes dropped; apply, then rerun to retry them.` : "") +
      " Review the English and Spanish text, then run apply-recipe-notes.",
  );
}

main();
