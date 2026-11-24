// Propose step for spec 0065 (ingredient substitution suggestions), AC-13.
// Asks Claude Haiku 5.5 for up to 5 ranked one way swaps per ingredient
// (substitute, ratio, optional note), picking only from the catalog it is
// given, and writes a review file sorted by name. Never writes to the
// database; apply-ingredient-substitutes.ts turns the entries you mark
// "reviewed": true into SQL for the SQL editor.
//
// Usage:
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... ANTHROPIC_API_KEY=... pnpm propose-ingredient-substitutes
//   --all       every ingredient, not only the ones with no substitutes_reviewed_at
//   --limit n   only the first n ingredients, for a thin test run
//   --force     replace an existing review file
import { createClient } from "@supabase/supabase-js";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod/v4";
import type { Database } from "../src/database.types";
import {
  sanitizeProposedSubstitutes,
  type CatalogIngredientRef,
  type SubstituteReviewEntry,
} from "../src/ingredientSubstituteProposals";
import {
  assertSameIds,
  chunk,
  MAX_RETRIES,
  parseLimitFlag,
  refuseToOverwrite,
  requireEnv,
  reviewFilePath,
  withRetry,
  writeReviewFile,
} from "./review-file";

// Spec 0065 configuration: Haiku 5.5, as the spec 0062 screening function
// uses; review-file.ts's HAIKU_MODEL stays on 4.5 for the older scripts.
const MODEL = "claude-haiku-5-5";
const REVIEW_FILE_PATH = reviewFilePath("ingredient-substitutes-proposals.json");
const BATCH_SIZE = 20;

const ResponseSchema = z.object({
  ingredients: z.array(
    z.object({
      key: z.string().describe("The key of the ingredient that is out, echoed exactly."),
      substitutes: z.array(
        z.object({
          key: z.string().describe("The substitute's key from the catalog."),
          ratio: z.number().describe("Multiply the original amount by this, 0.25 to 4."),
          note: z
            .string()
            .nullable()
            .describe("Optional, under 120 characters: what changes in the drink."),
        }),
      ),
    }),
  ),
});

interface CatalogIngredient extends CatalogIngredientRef {
  readonly key: string;
  readonly category: string | null;
}

const INSTRUCTIONS =
  `You help bartenders working a shift. When an ingredient is out of stock, they need a ` +
  `swap they can pour right now. For each ingredient you are asked about, list up to 5 ` +
  `substitutes from the catalog, best first, that a good bartender would actually use in ` +
  `its place in most cocktails. Swaps are one way: only answer "if this is out, use that". ` +
  `Pick only keys from the catalog below, never the ingredient itself. Keep the swap in ` +
  `the same role: a spirit for a spirit of a similar style, a liqueur for a liqueur, a ` +
  `citrus juice for a citrus juice, a syrup for a syrup. Never suggest an alcoholic ` +
  `substitute for a non alcoholic ingredient. The ratio multiplies the original amount ` +
  `(1 for a like for like swap, below 1 when the substitute is stronger or sweeter, above ` +
  `1 when it is weaker), between 0.25 and 4. Add a short note (under 120 characters, plain ` +
  `English, no dashes) only when it helps, such as how the flavor changes. Return an empty ` +
  `list when no catalog item is a sensible swap: an empty list is a good answer for ` +
  `garnishes, specific brands with no close match, and unusual ingredients. Return one ` +
  `entry per ingredient asked about, echoing its key exactly.`;

function catalogText(catalog: readonly CatalogIngredient[]): string {
  return catalog
    .map(
      (ingredient) => `${ingredient.key}: ${ingredient.name} (${ingredient.category ?? "unknown"})`,
    )
    .join("\n");
}

async function proposeBatch(
  anthropic: Anthropic,
  system: string,
  batch: readonly CatalogIngredient[],
  byKey: ReadonlyMap<string, CatalogIngredient>,
  byId: ReadonlyMap<string, CatalogIngredientRef>,
): Promise<SubstituteReviewEntry[]> {
  const asked = batch
    .map(
      (ingredient) => `${ingredient.key}: ${ingredient.name} (${ingredient.category ?? "unknown"})`,
    )
    .join("\n");

  const message = await anthropic.messages.parse({
    model: MODEL,
    max_tokens: 8192,
    // The catalog is the same for every batch, so it is cached after the first call.
    system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: `Ingredients that are out:\n${asked}` }],
    output_config: { format: zodOutputFormat(ResponseSchema) },
  });

  const parsed = message.parsed_output;
  if (!parsed) {
    throw new Error(`no parseable response (stop_reason: ${message.stop_reason})`);
  }

  assertSameIds(
    batch.map((ingredient) => ingredient.key),
    parsed.ingredients.map((ingredient) => ingredient.key),
  );

  return parsed.ingredients.flatMap((answer) => {
    const ingredient = byKey.get(answer.key);
    if (!ingredient) {
      return [];
    }
    const picks = answer.substitutes.flatMap((pick) => {
      const substitute = byKey.get(pick.key);
      return substitute ? [{ id: substitute.id, ratio: pick.ratio, note: pick.note }] : [];
    });
    return [
      {
        id: ingredient.id,
        name: ingredient.name,
        category: ingredient.category,
        reviewed: false,
        substitutes: sanitizeProposedSubstitutes(ingredient.id, picks, byId),
      },
    ];
  });
}

async function main() {
  const all = process.argv.includes("--all");
  const force = process.argv.includes("--force");
  const limit = parseLimitFlag();
  refuseToOverwrite(REVIEW_FILE_PATH, force);

  const env = requireEnv(["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "ANTHROPIC_API_KEY"]);
  const supabase = createClient<Database>(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
  const anthropic = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });

  const { data, error } = await supabase
    .from("ingredients")
    .select("id, name, category, is_staple, substitutes_reviewed_at")
    .order("name");
  if (error) {
    console.error("Failed to read ingredients:", error);
    process.exit(1);
  }

  const rows = data ?? [];
  // Short keys keep the prompt small and mean Haiku can only answer with
  // catalog items: an unknown key is simply dropped.
  const catalog: CatalogIngredient[] = rows.map((row, index) => ({
    key: `i${index + 1}`,
    id: row.id,
    name: row.name,
    category: row.category,
  }));
  const byKey = new Map(catalog.map((ingredient) => [ingredient.key, ingredient]));
  const byId = new Map(catalog.map((ingredient) => [ingredient.id, ingredient]));

  // Staples (Ice, Water) never get a banner block (AC-1), so they are not asked about.
  const targets = catalog
    .filter((ingredient, index) => {
      const row = rows[index];
      return row !== undefined && !row.is_staple && (all || row.substitutes_reviewed_at === null);
    })
    .slice(0, limit);

  const system = `${INSTRUCTIONS}\n\nCatalog (key: name (category)):\n${catalogText(catalog)}`;
  console.log(
    `Proposing substitutes for ${targets.length} of ${catalog.length} ingredients in batches of ${BATCH_SIZE}...`,
  );

  let entries: readonly SubstituteReviewEntry[] = [];
  let dropped = 0;

  for (const batch of chunk(targets, BATCH_SIZE)) {
    const result = await withRetry(`Batch starting with "${batch[0]?.name}"`, () =>
      proposeBatch(anthropic, system, batch, byKey, byId),
    );
    if (result) {
      entries = [...entries, ...result].sort((a, b) => a.name.localeCompare(b.name));
      writeReviewFile(REVIEW_FILE_PATH, entries);
      console.log(`Proposed ${entries.length} of ${targets.length}.`);
    } else {
      dropped += batch.length;
      console.error(
        `Dropped the batch starting with "${batch[0]?.name}" after ${MAX_RETRIES} failed attempts.`,
      );
    }
  }

  console.log(
    `Done. ${entries.length} entries in ${REVIEW_FILE_PATH}.` +
      (dropped > 0 ? ` ${dropped} ingredients dropped; apply, then rerun to retry them.` : "") +
      ` Edit each entry (order is rank, ratio, note), set "reviewed": true, then run apply-ingredient-substitutes.`,
  );
}

main();
