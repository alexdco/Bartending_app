// One time tagging script for spec 0010 (popular drinks by region).
// Proposes an optional region + a fame score for every recipe (spec 0038
// AC-1) via Claude Haiku and appends the
// proposals to a review file. Never writes to the database itself; see
// apply-regions.ts for the separate, explicit apply step (AC-7).
//
// Usage:
//   ANTHROPIC_API_KEY=... SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... pnpm tag-regions
//   pnpm tag-regions --all   (reprocess every recipe, not just untagged ones)
import { createClient } from "@supabase/supabase-js";
import Anthropic from "@anthropic-ai/sdk";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { Database } from "../src/database.types";
import type { RegionProposal as Proposal } from "../src/regionProposals";
// The prompt, schema, and retry live in the shared module the import tail
// also uses (spec 0056 AC-9), so the two never drift apart.
import {
  chunk,
  FAME_BATCH_SIZE as BATCH_SIZE,
  tagFameBatchWithRetry,
  type FameRecipeInput as RecipeInput,
} from "../src/fameScoring";

const REVIEW_FILE_PATH = new URL(
  "./tagging/popular-by-region-proposals.json",
  import.meta.url,
).pathname.replace(/^\/([A-Za-z]:)/, "$1");

const MAX_RETRIES = 3;

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
    query = query.is("fame_score", null);
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
    const result = await tagFameBatchWithRetry(anthropic, batch);
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
