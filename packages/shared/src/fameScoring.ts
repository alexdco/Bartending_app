// Shared fame and region scoring (spec 0038's Haiku prompt), used by the
// one time tag-regions.ts script and by both import entry points' fame tail
// (spec 0056 AC-9). Kept out of index.ts's export barrel since it pulls in
// @anthropic-ai/sdk and needs the service role; import it via
// "@bartendingapp/shared/fame-scoring" instead.
// Spec: docs/specs/0056-catalog-freshness-rules/index.md
import type { SupabaseClient } from "@supabase/supabase-js";
import type Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod/v4";
import type { Database } from "./database.types";
import { FIXED_REGIONS, type RegionProposal } from "./regionProposals";

export const FAME_BATCH_SIZE = 25;
const MAX_RETRIES = 3;

/** How many unscored recipes one import run scores (spec 0056 AC-9). */
export const FAME_TAIL_LIMIT = 200;

const ProposalSchema = z.object({
  proposals: z.array(
    z.object({
      id: z.string(),
      region: z.enum(FIXED_REGIONS).nullable(),
      fame_score: z.number().int().min(0).max(100),
      reasoning: z.string(),
    }),
  ),
});

export interface FameRecipeInput {
  readonly id: string;
  readonly name: string;
  readonly instructions: string;
  readonly ingredientNames: readonly string[];
}

export interface RecipeRef {
  readonly id: string;
  readonly name: string;
}

/** Splits items into consecutive chunks of `size`. Pure. */
export function chunk<T>(items: readonly T[], size: number): readonly T[][] {
  return Array.from({ length: Math.ceil(items.length / size) }, (_, index) =>
    items.slice(index * size, index * size + size),
  );
}

function famePrompt(batch: readonly FameRecipeInput[]): string {
  const recipesText = batch
    .map(
      (r) =>
        `id: ${r.id}\nname: ${r.name}\ningredients: ${r.ingredientNames.join(", ")}\ninstructions: ${r.instructions}`,
    )
    .join("\n---\n");

  return (
    `For each cocktail recipe below, assign a region from this fixed list only: ` +
    `${FIXED_REGIONS.join(", ")}. Use null if no region genuinely fits (e.g. a drink ` +
    `with no clear regional origin or association). Also give a fame_score from 0 to ` +
    `100 rating how famous/well known this specific drink is in general, real world ` +
    `terms (0 = obscure, 100 = globally iconic). Every recipe gets a fame_score, ` +
    `including one whose region is null. ` +
    `Give a one sentence reasoning for each. Return one proposal per recipe, in the ` +
    `same order, referencing each by its id.\n\n${recipesText}`
  );
}

async function tagFameBatch(
  anthropic: Anthropic,
  batch: readonly FameRecipeInput[],
): Promise<RegionProposal[]> {
  const message = await anthropic.messages.parse({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 4096,
    messages: [{ role: "user", content: famePrompt(batch) }],
    output_config: {
      format: zodOutputFormat(ProposalSchema),
    },
  });

  const parsed = message.parsed_output;
  if (!parsed) {
    throw new Error("tagging call did not return a parseable response");
  }

  const byId = new Map(batch.map((r) => [r.id, r]));
  // A proposal for an id that wasn't in the batch is dropped, so a confused
  // reply can never score some other recipe.
  return parsed.proposals
    .filter((p) => byId.has(p.id))
    .map((p) => ({
      id: p.id,
      name: byId.get(p.id)?.name ?? "",
      region: p.region,
      fame_score: p.fame_score,
      reasoning: p.reasoning,
    }));
}

/**
 * One Haiku call for up to FAME_BATCH_SIZE recipes, retried with backoff.
 * Returns null once every attempt failed; never throws.
 */
export async function tagFameBatchWithRetry(
  anthropic: Anthropic,
  batch: readonly FameRecipeInput[],
  log: (message: string) => void = console.error,
): Promise<RegionProposal[] | null> {
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      return await tagFameBatch(anthropic, batch);
    } catch (error) {
      log(
        `Batch starting with "${batch[0]?.name}" failed (attempt ${attempt + 1}/${MAX_RETRIES}): ${String(error)}`,
      );
      if (attempt === MAX_RETRIES - 1) {
        return null;
      }
      await new Promise((resolve) => setTimeout(resolve, 2 ** attempt * 1000));
    }
  }
  return null;
}

export interface UnscoredRecipeRow {
  readonly id: string;
  readonly name: string;
  readonly instructions: string;
  readonly region: string | null;
  readonly ingredientNames: readonly string[];
}

/** Rows to score this run, and rows past the cap left for the next one. Pure. */
export function splitAtCap<T>(
  rows: readonly T[],
  limit: number,
): { readonly batch: readonly T[]; readonly waiting: readonly T[] } {
  return { batch: rows.slice(0, limit), waiting: rows.slice(limit) };
}

export interface FameArrivalProposal {
  readonly id: string;
  readonly region: string | null;
  readonly fame_score: number;
}

/**
 * The apply_fame_on_arrival payload (spec 0056 AC-9): the fame score always,
 * the proposed region only when the recipe has none, its own region
 * otherwise. apply_fame_on_arrival enforces the same region rule under the
 * row lock; this keeps the payload honest. Pure.
 */
export function toFameArrivalPayload(
  proposals: readonly RegionProposal[],
  rows: readonly UnscoredRecipeRow[],
): readonly FameArrivalProposal[] {
  const regionById = new Map(rows.map((row) => [row.id, row.region]));
  return proposals.flatMap((p) =>
    p.fame_score === null || !regionById.has(p.id)
      ? []
      : [{ id: p.id, region: regionById.get(p.id) ?? p.region, fame_score: p.fame_score }],
  );
}

export interface FameTailSummary {
  readonly scored: readonly RecipeRef[];
  readonly unscored: readonly RecipeRef[];
  readonly waiting: readonly RecipeRef[];
}

export type ScoreUnscoredRecipesResult =
  | { data: FameTailSummary; error: null }
  | {
      data: null;
      error: { readonly message: string; readonly unscored: readonly RecipeRef[] };
    };

const toRef = (row: { readonly id: string; readonly name: string }): RecipeRef => ({
  id: row.id,
  name: row.name,
});

/**
 * The import tail (spec 0056 AC-9): scores up to `limit` live recipes with a
 * null fame score, oldest first, and applies the result through
 * apply_fame_on_arrival. A failed Haiku batch leaves its recipes unscored for
 * the next run; a failed read or apply is returned as an error, never thrown.
 */
export async function scoreUnscoredRecipes(
  supabase: SupabaseClient<Database>,
  anthropic: Anthropic,
  { limit = FAME_TAIL_LIMIT }: { limit?: number } = {},
): Promise<ScoreUnscoredRecipesResult> {
  const { data, error } = await supabase
    .from("recipes")
    .select("id, name, instructions, region, recipe_ingredients ( ingredients ( name ) )")
    .is("fame_score", null)
    .is("deleted_at", null)
    .order("created_at", { ascending: true })
    .order("id", { ascending: true });

  if (error) {
    return { data: null, error: { message: error.message, unscored: [] } };
  }

  const rows: readonly UnscoredRecipeRow[] = (data ?? []).map((r) => ({
    id: r.id,
    name: r.name,
    instructions: r.instructions,
    region: r.region,
    ingredientNames: (r.recipe_ingredients ?? [])
      .map((ri) => (ri.ingredients as { name: string } | null)?.name)
      .filter((name): name is string => Boolean(name)),
  }));

  const { batch, waiting } = splitAtCap(rows, limit);

  const results = await chunk(batch, FAME_BATCH_SIZE).reduce<
    Promise<readonly (RegionProposal[] | null)[]>
  >(
    async (done, part) => [...(await done), await tagFameBatchWithRetry(anthropic, part)],
    Promise.resolve([]),
  );

  const proposals = results.flatMap((result) => result ?? []);
  const payload = toFameArrivalPayload(proposals, batch);
  const proposedIds = new Set(payload.map((p) => p.id));
  const unscored = batch.filter((row) => !proposedIds.has(row.id)).map(toRef);

  if (payload.length > 0) {
    const { error: applyError } = await supabase.rpc("apply_fame_on_arrival", {
      proposals:
        payload as unknown as Database["public"]["Functions"]["apply_fame_on_arrival"]["Args"]["proposals"],
    });

    if (applyError) {
      return { data: null, error: { message: applyError.message, unscored: batch.map(toRef) } };
    }
  }

  return {
    data: {
      scored: batch.filter((row) => proposedIds.has(row.id)).map(toRef),
      unscored,
      waiting: waiting.map(toRef),
    },
    error: null,
  };
}
