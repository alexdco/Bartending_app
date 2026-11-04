// Propose step for spec 0043 (recipe drink style, tips, and allergens), AC-7.
// Asks Claude Haiku for each live recipe's drink style family, style
// sentence, bartender tip, and presentation tip, in English and every
// CATALOG_TRANSLATION_LOCALES locale (spec 0045 AC-10), and writes a review
// file. Never writes to the database; apply-recipe-notes.ts does that after
// you review the text.
//
// With --locale <code> it instead backfills one locale (spec 0045 AC-17): it
// translates the reviewed English notes into that locale for the fields that
// are empty on its translation row, into recipe-notes-proposals.<code>.json.
// English and the other locales are never in that file.
//
// Usage:
//   ANTHROPIC_API_KEY=... SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... pnpm propose-recipe-notes
//   --all            every live recipe, not only the ones missing an English value
//                    (with --locale: all three fields, not only the empty ones)
//   --force          replace an existing review file
//   --locale <code>  backfill one supported non English locale, launched or not
//   --limit <n>      with --locale: only the first n picked recipes
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod/v4";
import type { Database } from "../src/database.types";
import { DRINK_STYLES } from "../src/drinkStyle";
import {
  CATALOG_TRANSLATION_LOCALES,
  LOCALE_AI_LANGUAGE,
  LOCALE_AI_TERMS,
  type NonDefaultLocale,
} from "../src/locale";
import {
  LocaleNotesReplySchema,
  planLocaleNoteBackfill,
  proposalsFromLocaleReply,
  validateRecipeNoteProposals,
  type BackfillPick,
  type BackfillRecipe,
  type RecipeNoteProposal,
  type RecipeTranslationNoteProposal,
} from "../src/recipeNoteProposals";
import {
  assertSameIds,
  chunk,
  HAIKU_MODEL,
  MAX_RETRIES,
  parseLimitFlag,
  parseLocaleFlag,
  refuseToOverwrite,
  requireEnv,
  reviewFilePath,
  withRetry,
  writeReviewFile,
} from "./review-file";

const BATCH_SIZE = 10;
const LOCALE_BATCH_SIZE = 20;
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
      translations: z.object(
        Object.fromEntries(CATALOG_TRANSLATION_LOCALES.map((locale) => [locale, NotesSchema])),
      ),
    }),
  ),
});

const TRANSLATION_LANGUAGES = CATALOG_TRANSLATION_LOCALES.map(
  (locale) => `${locale} (${LOCALE_AI_LANGUAGE[locale]})`,
).join(", ");

const TRANSLATION_TERMS = CATALOG_TRANSLATION_LOCALES.map((locale) => LOCALE_AI_TERMS[locale]).join(
  "",
);

const RECIPE_SELECT =
  "id, name, glass, instructions, recipe_ingredients ( measure, sort_order, ingredients ( name ) )";

interface RecipeInput {
  id: string;
  name: string;
  glass: string | null;
  instructions: string;
  ingredients: string[];
}

type IngredientRow = {
  measure: string | null;
  sort_order: number;
  ingredients: { name: string } | null;
};

function ingredientLines(rows: readonly IngredientRow[] | null): string[] {
  return [...(rows ?? [])]
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((ri) => [ri.measure, ri.ingredients?.name].filter(Boolean).join(" "))
    .filter((line) => line.length > 0);
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
          `Also give translations: for each of ${TRANSLATION_LANGUAGES}, keyed by that code, ` +
          `the same three texts written naturally in that language (not a word for word ` +
          `translation), same limits.${TRANSLATION_TERMS} Return one entry per recipe, ` +
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

async function proposeDefault(
  supabase: SupabaseClient<Database>,
  anthropic: Anthropic,
  { all }: { all: boolean },
) {
  const reviewFile = reviewFilePath("recipe-notes-proposals.json");

  if (all) {
    console.warn(
      "--all: applying this file will overwrite every " +
        "recipe's existing style and tips, including text an admin edited.",
    );
  }

  let query = supabase.from("recipes").select(RECIPE_SELECT).is("deleted_at", null).order("name");
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
    ingredients: ingredientLines(r.recipe_ingredients),
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
      writeReviewFile(reviewFile, proposals);
      console.log(`Proposed ${proposals.length} of ${inputs.length}.`);
    } else {
      dropped += batch.length;
      console.error(
        `Dropped the batch starting with "${batch[0]?.name}" after ${MAX_RETRIES} failed attempts.`,
      );
    }
  }

  console.log(
    `Done. ${proposals.length} proposals in ${reviewFile}.` +
      (dropped > 0 ? ` ${dropped} recipes dropped; apply, then rerun to retry them.` : "") +
      " Review the text in every language, then run apply-recipe-notes.",
  );
}

interface LocaleInput extends BackfillPick {
  readonly ingredients: readonly string[];
}

function describeLocaleRecipe(recipe: LocaleInput): string {
  return [
    `id: ${recipe.id}`,
    `name: ${recipe.name}`,
    `ingredients: ${recipe.ingredients.join("; ")}`,
    ...recipe.fields.map((field) => `${field}: ${recipe.source[field]}`),
  ].join("\n");
}

async function proposeLocaleBatch(
  anthropic: Anthropic,
  locale: NonDefaultLocale,
  batch: readonly LocaleInput[],
): Promise<RecipeTranslationNoteProposal[]> {
  const message = await anthropic.messages.parse({
    model: HAIKU_MODEL,
    max_tokens: 8192,
    messages: [
      {
        role: "user",
        content:
          `You translate short cocktail notes for a home bartending app into ` +
          `${LOCALE_AI_LANGUAGE[locale]}. Each cocktail below lists one or more English notes ` +
          `(drink_style_note, bartender_tip, presentation_tip). Translate each listed note ` +
          `faithfully: keep its meaning and every detail, and add or drop nothing, so a ` +
          `reviewer can check your text against the English. Keep cocktail names as they are. ` +
          `Plain text with no markdown, each under ${TARGET_LENGTH} characters.` +
          `${LOCALE_AI_TERMS[locale]} Return one entry per cocktail, echoing its id exactly, ` +
          `with every listed note translated and every note not listed set to null.\n\n` +
          batch.map(describeLocaleRecipe).join("\n---\n"),
      },
    ],
    output_config: { format: zodOutputFormat(LocaleNotesReplySchema) },
  });

  const parsed = message.parsed_output;
  if (!parsed) {
    throw new Error(`no parseable response (stop_reason: ${message.stop_reason})`);
  }

  assertSameIds(
    batch.map((r) => r.id),
    parsed.recipes.map((r) => r.id),
  );

  const validation = proposalsFromLocaleReply(batch, parsed);
  if (!validation.ok) {
    throw new Error(`invalid proposals: ${validation.errors.join("; ")}`);
  }
  return [...validation.proposals];
}

function listRecipes(heading: string, recipes: readonly { id: string; name: string }[]): void {
  if (recipes.length === 0) return;
  console.warn(heading);
  for (const r of recipes) console.warn(`  - ${r.id} (${r.name})`);
}

async function proposeLocale(
  supabase: SupabaseClient<Database>,
  anthropic: Anthropic,
  locale: NonDefaultLocale,
  { all, limit }: { all: boolean; limit: number | undefined },
) {
  const reviewFile = reviewFilePath(`recipe-notes-proposals.${locale}.json`);

  if (all) {
    console.warn(
      `--all: applying this file will rewrite every ${locale} style sentence and tip, ` +
        `including reviewed text, in ${locale} only.`,
    );
  }

  const { data, error } = await supabase
    .from("recipes")
    .select(
      "id, name, drink_style_note, bartender_tip, presentation_tip, recipe_ingredients ( measure, sort_order, ingredients ( name ) ), recipe_translations ( locale, drink_style_note, bartender_tip, presentation_tip )",
    )
    .is("deleted_at", null)
    .eq("recipe_translations.locale", locale)
    .order("name");
  if (error) {
    console.error("Failed to read recipes:", error);
    process.exit(1);
  }

  const rows = data ?? [];
  const ingredientsById = new Map(rows.map((r) => [r.id, ingredientLines(r.recipe_ingredients)]));
  const recipes: BackfillRecipe[] = rows.map((r) => ({
    id: r.id,
    name: r.name,
    english: {
      drink_style_note: r.drink_style_note,
      bartender_tip: r.bartender_tip,
      presentation_tip: r.presentation_tip,
    },
    translation: r.recipe_translations[0] ?? null,
  }));

  const plan = planLocaleNoteBackfill(recipes, { all, limit });
  listRecipes(
    `Left out ${plan.missingRow.length} recipes with no ${locale} translation row ` +
      `(fix: translate-catalog --locale ${locale}):`,
    plan.missingRow,
  );
  listRecipes(
    `Left out ${plan.missingEnglish.length} recipes missing an English note ` +
      "(fix: the default propose-recipe-notes run):",
    plan.missingEnglish,
  );

  if (plan.picked.length === 0) {
    console.log(`Nothing to propose for ${locale}; no file written.`);
    return;
  }

  const inputs: LocaleInput[] = plan.picked.map((pick) => ({
    ...pick,
    ingredients: ingredientsById.get(pick.id) ?? [],
  }));

  console.log(
    `Proposing ${locale} notes for ${inputs.length} recipes in batches of ${LOCALE_BATCH_SIZE}...`,
  );

  let proposals: readonly RecipeTranslationNoteProposal[] = [];
  let dropped: readonly LocaleInput[] = [];

  // A failed batch is retried one recipe at a time, so a recipe that can never
  // pass (a translation over the limit) drops alone, not with its neighbors.
  const batches = chunk(inputs, LOCALE_BATCH_SIZE).map((batch) => ({ batch, split: true }));
  for (let next = batches.shift(); next; next = batches.shift()) {
    const { batch, split } = next;
    const label =
      batch.length === 1 ? `"${batch[0]?.name}"` : `Batch starting with "${batch[0]?.name}"`;
    const result = await withRetry(label, () => proposeLocaleBatch(anthropic, locale, batch));
    if (result) {
      proposals = [...proposals, ...result];
      writeReviewFile(reviewFile, proposals);
      console.log(`Proposed ${proposals.length} of ${inputs.length}.`);
    } else if (split && batch.length > 1) {
      console.error(`${label} failed ${MAX_RETRIES} times; trying its recipes one at a time.`);
      batches.unshift(...batch.map((recipe) => ({ batch: [recipe], split: false })));
    } else {
      dropped = [...dropped, ...batch];
      console.error(`Dropped ${label} after ${MAX_RETRIES} failed attempts.`);
    }
  }

  if (proposals.length > 0) {
    console.log(
      `${proposals.length} proposals in ${reviewFile}. Review them against each "source", ` +
        `then run apply-recipe-notes --locale ${locale}.`,
    );
  }
  if (dropped.length > 0) {
    listRecipes(
      `Dropped ${dropped.length} recipes. Apply this file, then run again; ` +
        "the next run picks only the fields still empty:",
      dropped,
    );
    process.exit(1);
  }
}

async function main() {
  const all = process.argv.includes("--all");
  const force = process.argv.includes("--force");
  const locale = parseLocaleFlag();
  const limit = parseLimitFlag();

  refuseToOverwrite(
    reviewFilePath(
      locale === undefined
        ? "recipe-notes-proposals.json"
        : `recipe-notes-proposals.${locale}.json`,
    ),
    force,
  );

  const env = requireEnv(["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "ANTHROPIC_API_KEY"]);
  const supabase = createClient<Database>(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
  const anthropic = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });

  if (locale === undefined) {
    await proposeDefault(supabase, anthropic, { all });
  } else {
    await proposeLocale(supabase, anthropic, locale, { all, limit });
  }
}

main();
