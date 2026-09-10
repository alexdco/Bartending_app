// One time tagging script for spec 0010 (popular drinks by region).
// Proposes a region + fame score per recipe via Claude Haiku and appends the
// proposals to a review file. Never writes to the database itself; see
// apply-regions.ts for the separate, explicit apply step (AC-7).
//
// Usage:
//   ANTHROPIC_API_KEY=... SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... pnpm tag-regions
//   pnpm tag-regions --all   (reprocess every recipe, not just untagged ones)
import { createClient } from "@supabase/supabase-js";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod/v4";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { Database } from "../src/database.types";

const REVIEW_FILE_PATH = new URL(
  "./tagging/popular-by-region-proposals.json",
  import.meta.url,
).pathname.replace(/^\/([A-Za-z]:)/, "$1");

const FIXED_REGIONS = [
  "Mexican",
  "Cuban",
  "Caribbean",
  "American",
  "British",
  "Italian",
  "French",
  "Asian",
  "International/Global",
] as const;

const BATCH_SIZE = 25;
const MAX_RETRIES = 3;

const ProposalSchema = z.object({
  proposals: z.array(
    z.object({
      id: z.string(),
      region: z.enum(FIXED_REGIONS).nullable(),
      fame_score: z.number().int().min(0).max(100).nullable(),
      reasoning: z.string(),
    }),
  ),
});

interface Proposal {
  id: string;
  name: string;
  region: string | null;
  fame_score: number | null;
  reasoning: string;
}

interface RecipeInput {
  id: string;
  name: string;
  instructions: string;
  ingredientNames: string[];
}

function loadReviewFile(): Proposal[] {
  if (!existsSync(REVIEW_FILE_PATH)) {
    return [];
  }
  const raw = readFileSync(REVIEW_FILE_PATH, "utf-8");
  return raw.trim() ? (JSON.parse(raw) as Proposal[]) : [];
}

function saveReviewFile(proposals: Proposal[]): void {
  mkdirSync(dirname(REVIEW_FILE_PATH), { recursive: true });
  writeFileSync(REVIEW_FILE_PATH, JSON.stringify(proposals, null, 2));
}

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

async function tagBatch(anthropic: Anthropic, batch: RecipeInput[]): Promise<Proposal[]> {
  const recipesText = batch
    .map(
      (r) =>
        `id: ${r.id}\nname: ${r.name}\ningredients: ${r.ingredientNames.join(", ")}\ninstructions: ${r.instructions}`,
    )
    .join("\n---\n");

  const message = await anthropic.messages.parse({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 4096,
    messages: [
      {
        role: "user",
        content:
          `For each cocktail recipe below, assign a region from this fixed list only: ` +
          `${FIXED_REGIONS.join(", ")}. Use null if no region genuinely fits (e.g. a drink ` +
          `with no clear regional origin or association). Also give a fame_score from 0 to ` +
          `100 rating how famous/well known this specific drink is in general, real world ` +
          `terms (0 = obscure, 100 = globally iconic); use null only if region is null. ` +
          `Give a one sentence reasoning for each. Return one proposal per recipe, in the ` +
          `same order, referencing each by its id.\n\n${recipesText}`,
      },
    ],
    output_config: {
      format: zodOutputFormat(ProposalSchema),
    },
  });

  const parsed = message.parsed_output;
  if (!parsed) {
    throw new Error("tagging call did not return a parseable response");
  }

  const byId = new Map(batch.map((r) => [r.id, r]));
  return parsed.proposals.map((p) => ({
    id: p.id,
    name: byId.get(p.id)?.name ?? "",
    region: p.region,
    fame_score: p.fame_score,
    reasoning: p.reasoning,
  }));
}

async function tagBatchWithRetry(
  anthropic: Anthropic,
  batch: RecipeInput[],
): Promise<Proposal[] | null> {
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      return await tagBatch(anthropic, batch);
    } catch (error) {
      const isLast = attempt === MAX_RETRIES - 1;
      console.error(
        `Batch starting with "${batch[0]?.name}" failed (attempt ${attempt + 1}/${MAX_RETRIES}): ${error}`,
      );
      if (isLast) {
        return null;
      }
      await new Promise((resolve) => setTimeout(resolve, 2 ** attempt * 1000));
    }
  }
  return null;
}

async function main() {
  const reprocessAll = process.argv.includes("--all");

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anthropicApiKey = process.env.ANTHROPIC_API_KEY;

  if (!supabaseUrl || !serviceRoleKey || !anthropicApiKey) {
    console.error("Missing SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, or ANTHROPIC_API_KEY.");
    process.exit(1);
  }

  const supabase = createClient<Database>(supabaseUrl, serviceRoleKey);
  const anthropic = new Anthropic({ apiKey: anthropicApiKey });

  let query = supabase
    .from("recipes")
    .select("id, name, instructions, recipe_ingredients ( ingredients ( name ) )")
    .is("deleted_at", null);

  if (!reprocessAll) {
    query = query.is("region", null);
  }

  const { data: recipes, error } = await query;
  if (error) {
    console.error("Failed to read recipes:", error);
    process.exit(1);
  }

  const existing = loadReviewFile();
  const alreadyProposed = new Set(existing.map((p) => p.id));

  const inputs: RecipeInput[] = (recipes ?? [])
    .filter((r) => reprocessAll || !alreadyProposed.has(r.id))
    .map((r) => ({
      id: r.id,
      name: r.name,
      instructions: r.instructions,
      ingredientNames: (r.recipe_ingredients ?? [])
        .map((ri) => (ri.ingredients as { name: string } | null)?.name)
        .filter((name): name is string => Boolean(name)),
    }));

  console.log(`Tagging ${inputs.length} recipes in batches of ${BATCH_SIZE}...`);

  const proposals = reprocessAll
    ? existing.filter((p) => !inputs.some((i) => i.id === p.id))
    : existing;
  let skipped = 0;

  for (const batch of chunk(inputs, BATCH_SIZE)) {
    const result = await tagBatchWithRetry(anthropic, batch);
    if (result) {
      proposals.push(...result);
      saveReviewFile(proposals);
      console.log(`Tagged batch of ${batch.length} (${proposals.length} total proposals so far).`);
    } else {
      skipped += batch.length;
      console.error(
        `Skipping batch starting with "${batch[0]?.name}" after ${MAX_RETRIES} failed attempts.`,
      );
    }
  }

  console.log(
    `Done. ${proposals.length} proposals written to ${REVIEW_FILE_PATH}.` +
      (skipped > 0 ? ` ${skipped} recipes skipped, rerun this script to retry them.` : ""),
  );
}

main();
