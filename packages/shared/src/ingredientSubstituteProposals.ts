// Pure logic for the spec 0065 swap seeding pipeline (AC-13):
// propose-ingredient-substitutes.ts cleans Haiku's picks with
// sanitizeProposedSubstitutes, and apply-ingredient-substitutes.ts checks
// the reviewed file with validateSubstituteReviewFile, then writes the
// SQL editor file with buildSubstitutesApplySql. Kept out of the index
// barrel: only those scripts use it.
// Spec: docs/specs/0065-ingredient-substitution-suggestions/index.md
import { z } from "zod/v4";

/** Mirrors the ingredient_substitutes checks (AC-15). */
export const SUBSTITUTE_RULES = {
  maxPerIngredient: 5,
  minRatio: 0.25,
  maxRatio: 4,
  maxNoteLength: 120,
} as const;

export const SubstituteProposalSchema = z.object({
  /** The substitute's ingredient id. */
  id: z.guid(),
  /** For the reviewer; never written. */
  name: z.string(),
  ratio: z.number(),
  note: z.string().nullable(),
});

export const SubstituteReviewEntrySchema = z.object({
  /** The ingredient that is out. */
  id: z.guid(),
  /** For the reviewer; never written. */
  name: z.string(),
  category: z.string().nullable(),
  /** Set to true once you have checked this entry; apply skips the rest. */
  reviewed: z.boolean(),
  /** Best first: array order is the rank. An empty list means no good substitute. */
  substitutes: z.array(SubstituteProposalSchema),
});

export type SubstituteProposal = z.infer<typeof SubstituteProposalSchema>;
export type SubstituteReviewEntry = z.infer<typeof SubstituteReviewEntrySchema>;

export interface ReviewedSubstitute {
  readonly substituteIngredientId: string;
  readonly rank: number;
  readonly ratio: number;
  readonly note: string | null;
}

export interface ReviewedIngredientSubstitutes {
  readonly ingredientId: string;
  readonly name: string;
  readonly substitutes: readonly ReviewedSubstitute[];
}

export type SubstituteReviewValidation =
  | {
      readonly ok: true;
      readonly entries: readonly ReviewedIngredientSubstitutes[];
      /** Names of entries left out because they are not marked reviewed. */
      readonly unreviewed: readonly string[];
    }
  | { readonly ok: false; readonly errors: readonly string[] };

/** Rounds to numeric(4, 2), as the column stores it. */
export function roundRatio(ratio: number): number {
  return Math.round(ratio * 100) / 100;
}

/** Trimmed note, or null when blank (the DB rejects a blank note, AC-15). */
export function cleanNote(note: string | null): string | null {
  const trimmed = note?.trim() ?? "";
  return trimmed === "" ? null : trimmed;
}

function substituteErrors(
  entry: SubstituteReviewEntry,
  knownIngredientIds: ReadonlySet<string>,
): readonly string[] {
  const label = `${entry.id} (${entry.name})`;
  const ids = entry.substitutes.map((substitute) => substitute.id);
  return [
    ...(knownIngredientIds.has(entry.id) ? [] : [`${label}: not an ingredient in the catalog`]),
    ...(entry.substitutes.length > SUBSTITUTE_RULES.maxPerIngredient
      ? [`${label}: ${entry.substitutes.length} substitutes, at most 5 allowed`]
      : []),
    ...entry.substitutes.flatMap((substitute, index) => {
      const at = `${label} substitute ${index + 1} (${substitute.name})`;
      const ratio = roundRatio(substitute.ratio);
      const note = cleanNote(substitute.note);
      return [
        ...(substitute.id === entry.id ? [`${at}: swaps the ingredient for itself`] : []),
        ...(ids.indexOf(substitute.id) !== index ? [`${at}: listed twice`] : []),
        ...(knownIngredientIds.has(substitute.id)
          ? []
          : [`${at}: not an ingredient in the catalog`]),
        ...(ratio < SUBSTITUTE_RULES.minRatio || ratio > SUBSTITUTE_RULES.maxRatio
          ? [`${at}: ratio ${substitute.ratio} is outside 0.25 to 4`]
          : []),
        ...(note !== null && note.length > SUBSTITUTE_RULES.maxNoteLength
          ? [`${at}: note is ${note.length} characters, at most 120 allowed`]
          : []),
      ];
    }),
  ];
}

/**
 * Checks the reviewed file against every DB rule (AC-13, AC-15). Entries not
 * marked reviewed are left out and listed; any error in a reviewed entry
 * rejects the whole file so nothing half applies.
 */
export function validateSubstituteReviewFile(
  value: unknown,
  knownIngredientIds: ReadonlySet<string>,
): SubstituteReviewValidation {
  const parsed = z.array(SubstituteReviewEntrySchema).safeParse(value);
  if (!parsed.success) {
    return {
      ok: false,
      errors: parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`),
    };
  }

  const entries = parsed.data;
  const ids = entries.map((entry) => entry.id);
  const duplicates = [...new Set(ids.filter((id, index) => ids.indexOf(id) !== index))].map(
    (id) => `${id}: appears more than once`,
  );
  const reviewed = entries.filter((entry) => entry.reviewed);
  const errors = [
    ...duplicates,
    ...reviewed.flatMap((entry) => substituteErrors(entry, knownIngredientIds)),
  ];
  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    entries: reviewed.map((entry) => ({
      ingredientId: entry.id,
      name: entry.name,
      substitutes: entry.substitutes.map((substitute, index) => ({
        substituteIngredientId: substitute.id,
        rank: index + 1,
        ratio: roundRatio(substitute.ratio),
        note: cleanNote(substitute.note),
      })),
    })),
    unreviewed: entries.filter((entry) => !entry.reviewed).map((entry) => entry.name),
  };
}

export interface CatalogIngredientRef {
  readonly id: string;
  readonly name: string;
}

/**
 * Haiku's picks for one ingredient, made safe to review: unknown or self
 * picks and repeats dropped, ratios rounded and out of range ones dropped,
 * notes trimmed (over long ones cut to null so you write your own), at most
 * five kept in Haiku's order.
 */
export function sanitizeProposedSubstitutes(
  ingredientId: string,
  picks: readonly { readonly id: string; readonly ratio: number; readonly note: string | null }[],
  catalog: ReadonlyMap<string, CatalogIngredientRef>,
): SubstituteProposal[] {
  return picks
    .filter(
      (pick, index) =>
        pick.id !== ingredientId &&
        catalog.has(pick.id) &&
        picks.findIndex((other) => other.id === pick.id) === index,
    )
    .map((pick) => ({ ...pick, ratio: roundRatio(pick.ratio), note: cleanNote(pick.note) }))
    .filter(
      (pick) => pick.ratio >= SUBSTITUTE_RULES.minRatio && pick.ratio <= SUBSTITUTE_RULES.maxRatio,
    )
    .slice(0, SUBSTITUTE_RULES.maxPerIngredient)
    .map((pick) => ({
      id: pick.id,
      name: catalog.get(pick.id)?.name ?? "",
      ratio: pick.ratio,
      note:
        pick.note !== null && pick.note.length <= SUBSTITUTE_RULES.maxNoteLength ? pick.note : null,
    }));
}

/** A Postgres string literal. */
export function sqlLiteral(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

/**
 * The SQL editor file for the reviewed entries (AC-13): one transaction that,
 * per ingredient, deletes its swap rows (their translations cascade), inserts
 * the reviewed ones, and sets substitutes_reviewed_at, also for an ingredient
 * reviewed with zero swaps.
 */
export function buildSubstitutesApplySql(
  entries: readonly ReviewedIngredientSubstitutes[],
): string {
  const blocks = entries.map((entry) => {
    const id = sqlLiteral(entry.ingredientId);
    const insert =
      entry.substitutes.length === 0
        ? []
        : [
            "insert into public.ingredient_substitutes (ingredient_id, substitute_ingredient_id, rank, ratio, note) values",
            entry.substitutes
              .map(
                (substitute) =>
                  `  (${id}, ${sqlLiteral(substitute.substituteIngredientId)}, ${substitute.rank}, ${substitute.ratio.toFixed(2)}, ${
                    substitute.note === null ? "null" : sqlLiteral(substitute.note)
                  })`,
              )
              .join(",\n") + ";",
          ];
    return [
      `-- ${entry.name.replace(/\s+/g, " ")}`,
      `delete from public.ingredient_substitutes where ingredient_id = ${id};`,
      ...insert,
      `update public.ingredients set substitutes_reviewed_at = now() where id = ${id};`,
    ].join("\n");
  });

  return [
    "-- Generated by apply-ingredient-substitutes.ts (spec 0065 AC-13).",
    "-- Paste into the Supabase SQL editor. All or nothing: any error rolls everything back.",
    "begin;",
    "",
    blocks.join("\n\n"),
    "",
    "commit;",
    "",
  ].join("\n");
}

export interface SubstituteNoteTranslationSqlRow {
  readonly ingredientId: string;
  readonly substituteIngredientId: string;
  readonly locale: string;
  readonly note: string;
  readonly sourceNoteHash: string;
}

/**
 * The SQL editor file for translated swap notes (AC-14). Each row is upserted
 * only while its swap still exists with the same note_hash, so a swap that
 * was reapplied or edited since the run is skipped rather than failing the
 * whole file or storing a stale note.
 */
export function buildSubstituteNoteTranslationsSql(
  rows: readonly SubstituteNoteTranslationSqlRow[],
): string {
  const values = rows
    .map(
      (row) =>
        `  (${sqlLiteral(row.ingredientId)}::uuid, ${sqlLiteral(row.substituteIngredientId)}::uuid, ${sqlLiteral(row.locale)}, ${sqlLiteral(row.note)}, ${sqlLiteral(row.sourceNoteHash)})`,
    )
    .join(",\n");
  return [
    "-- Generated by translate-catalog.ts (spec 0065 AC-14).",
    "-- Paste into the Supabase SQL editor. All or nothing: any error rolls everything back.",
    "begin;",
    "",
    "insert into public.ingredient_substitute_translations",
    "  (ingredient_id, substitute_ingredient_id, locale, note, source_note_hash)",
    "select v.ingredient_id, v.substitute_ingredient_id, v.locale, v.note, v.source_note_hash",
    "from (values",
    values,
    ") as v (ingredient_id, substitute_ingredient_id, locale, note, source_note_hash)",
    "join public.ingredient_substitutes s",
    "  on s.ingredient_id = v.ingredient_id",
    "  and s.substitute_ingredient_id = v.substitute_ingredient_id",
    "  and s.note_hash = v.source_note_hash",
    "on conflict (ingredient_id, substitute_ingredient_id, locale) do update",
    "  set note = excluded.note, source_note_hash = excluded.source_note_hash;",
    "",
    "commit;",
    "",
  ].join("\n");
}
