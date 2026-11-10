// Pure validation for the reviewed recipe notes files (spec 0043, AC-7,
// AC-8; spec 0045, AC-10, AC-17, AC-18). propose-recipe-notes.ts checks
// Haiku's output with it and apply-recipe-notes.ts checks the reviewed file
// before the RPC. Mirrors the checks in apply_recipe_notes and
// apply_recipe_translation_notes. Kept out of the index barrel: only those
// scripts use it.
// Specs: docs/specs/0043-recipe-style-tips-allergens/index.md,
// docs/specs/0045-language-agnostic-locales-portuguese/index.md
import { z } from "zod/v4";
import { DRINK_STYLES, noteLength, RECIPE_NOTE_MAX_LENGTH, type DrinkStyle } from "./drinkStyle";
import type { ProposalValidation } from "./ingredientAllergenProposals";
import { CATALOG_TRANSLATION_LOCALES, type CatalogTranslationLocale } from "./locale";

export const NOTE_FIELDS = ["drink_style_note", "bartender_tip", "presentation_tip"] as const;

export type NoteField = (typeof NOTE_FIELDS)[number];

const isBlank = (text: string | null): boolean => text === null || text.trim().length === 0;

/** Present, not blank after trimming, and at most 240 code points (AC-8). */
const NoteTextSchema = z
  .string()
  .refine((text) => !isBlank(text), { message: "is blank" })
  .refine((text) => noteLength(text.trim()) <= RECIPE_NOTE_MAX_LENGTH, {
    message: `is over ${RECIPE_NOTE_MAX_LENGTH} characters`,
  });

const NotesSchema = z.object({
  drink_style_note: NoteTextSchema,
  bartender_tip: NoteTextSchema,
  presentation_tip: NoteTextSchema,
});

export const RecipeNoteProposalSchema = NotesSchema.extend({
  id: z.guid(),
  /** For the reviewer; stripped before the RPC. */
  name: z.string(),
  drink_style: z.enum(DRINK_STYLES),
  /** One block per CATALOG_TRANSLATION_LOCALES code, no more and no fewer (AC-10). */
  translations: z.record(z.enum(CATALOG_TRANSLATION_LOCALES), NotesSchema),
});

export type RecipeNoteProposal = z.infer<typeof RecipeNoteProposalSchema>;

// Type aliases, not interfaces, so a row stays assignable to the RPC's Json arg.
type NotesPayload = {
  readonly drink_style_note: string;
  readonly bartender_tip: string;
  readonly presentation_tip: string;
};

export type RecipeNotePayloadRow = NotesPayload & {
  readonly id: string;
  readonly drink_style: DrinkStyle;
  readonly translations: Record<CatalogTranslationLocale, NotesPayload>;
};

/** Checks a whole file against one row schema; any error rejects everything. */
function validateFile<T extends { readonly id: string; readonly name: string }>(
  schema: z.ZodType<T>,
  value: unknown,
  rowErrors: (row: T) => readonly string[] = () => [],
): ProposalValidation<T> {
  const parsed = z.array(schema).safeParse(value);
  if (!parsed.success) {
    return {
      ok: false,
      errors: parsed.error.issues.map((issue) => {
        const index = issue.path[0];
        const row = Array.isArray(value) && typeof index === "number" ? value[index] : null;
        const name =
          row && typeof row === "object" && "name" in row && typeof row.name === "string"
            ? ` (${row.name})`
            : "";
        return `${issue.path.join(".")}${name}: ${issue.message}`;
      }),
    };
  }

  // Checked only once every row parses, so a failed field never shows up here too.
  const crossFieldErrors = parsed.data.flatMap((row, index) =>
    rowErrors(row).map((message) => `${index}.${message.replace(": ", ` (${row.name}): `)}`),
  );
  if (crossFieldErrors.length > 0) {
    return { ok: false, errors: crossFieldErrors };
  }

  const ids = parsed.data.map((p) => p.id);
  const duplicates = [...new Set(ids.filter((id, index) => ids.indexOf(id) !== index))];
  return duplicates.length > 0
    ? { ok: false, errors: duplicates.map((id) => `${id}: appears more than once`) }
    : { ok: true, proposals: parsed.data };
}

/** Checks the whole default file; any error rejects everything (AC-8). */
export function validateRecipeNoteProposals(
  value: unknown,
): ProposalValidation<RecipeNoteProposal> {
  return validateFile(RecipeNoteProposalSchema, value);
}

const trimNotes = (notes: NotesPayload): NotesPayload => ({
  drink_style_note: notes.drink_style_note.trim(),
  bartender_tip: notes.bartender_tip.trim(),
  presentation_tip: notes.presentation_tip.trim(),
});

/** Trimmed, without the reviewer only `name`. */
export function toRecipeNotePayload(
  proposals: readonly RecipeNoteProposal[],
): readonly RecipeNotePayloadRow[] {
  return proposals.map((p) => ({
    id: p.id,
    drink_style: p.drink_style,
    ...trimNotes(p),
    translations: Object.fromEntries(
      CATALOG_TRANSLATION_LOCALES.map((locale) => [locale, trimNotes(p.translations[locale])]),
    ) as Record<CatalogTranslationLocale, NotesPayload>,
  }));
}

// The --locale backfill (AC-17, AC-18): one locale's notes, translated from
// the reviewed English notes, filling only the fields that are empty.

type NoteTexts = Readonly<Record<NoteField, string | null>>;

export interface BackfillRecipe {
  readonly id: string;
  readonly name: string;
  /** The recipe's English notes, from `recipes`. */
  readonly english: NoteTexts;
  /** That locale's `recipe_translations` notes, or null when the row is missing. */
  readonly translation: NoteTexts | null;
}

export interface BackfillPick {
  readonly id: string;
  readonly name: string;
  readonly fields: readonly NoteField[];
  /** The English text of each picked field, verbatim. */
  readonly source: Partial<Record<NoteField, string>>;
}

export interface LocaleNoteBackfillPlan {
  readonly picked: readonly BackfillPick[];
  /** Left out: no translation row for the locale (fix: translate-catalog --locale). */
  readonly missingRow: readonly BackfillRecipe[];
  /** Left out: a blank English note (fix: the default notes run). */
  readonly missingEnglish: readonly BackfillRecipe[];
}

/**
 * Which live recipes and which fields a --locale run proposes (AC-17). Takes
 * recipes that are not deleted. With `all`, every field of every eligible
 * recipe; otherwise only the empty ones, leaving out a recipe with none.
 */
export function planLocaleNoteBackfill(
  recipes: readonly BackfillRecipe[],
  { all = false, limit }: { readonly all?: boolean; readonly limit?: number } = {},
): LocaleNoteBackfillPlan {
  const missingEnglish = recipes.filter((r) => NOTE_FIELDS.some((f) => isBlank(r.english[f])));
  const withEnglish = recipes.filter((r) => !missingEnglish.includes(r));
  const missingRow = withEnglish.filter((r) => r.translation === null);

  const picked = withEnglish.flatMap((r): BackfillPick[] => {
    const translation = r.translation;
    if (translation === null) return [];
    const fields = all ? NOTE_FIELDS : NOTE_FIELDS.filter((f) => isBlank(translation[f]));
    return fields.length === 0
      ? []
      : [
          {
            id: r.id,
            name: r.name,
            fields,
            source: Object.fromEntries(fields.map((f) => [f, r.english[f] ?? ""])),
          },
        ];
  });

  return {
    picked: limit === undefined ? picked : picked.slice(0, limit),
    missingRow,
    missingEnglish,
  };
}

const SourceTextSchema = z.string().refine((text) => !isBlank(text), { message: "is blank" });

export const RecipeTranslationNoteProposalSchema = z.object({
  id: z.guid(),
  /** For the reviewer; stripped before the RPC. */
  name: z.string(),
  /** The English text each note was translated from, copied verbatim from `recipes`. */
  source: z.strictObject({
    drink_style_note: SourceTextSchema.optional(),
    bartender_tip: SourceTextSchema.optional(),
    presentation_tip: SourceTextSchema.optional(),
  }),
  notes: z.strictObject({
    drink_style_note: NoteTextSchema.optional(),
    bartender_tip: NoteTextSchema.optional(),
    presentation_tip: NoteTextSchema.optional(),
  }),
});

export type RecipeTranslationNoteProposal = z.infer<typeof RecipeTranslationNoteProposalSchema>;

/** `notes` holds at least one field, and `source` exactly the same ones. */
function translationKeyErrors(p: RecipeTranslationNoteProposal): readonly string[] {
  const noteKeys = Object.keys(p.notes).sort().join();
  if (noteKeys === "") return ["notes: is empty"];
  return noteKeys === Object.keys(p.source).sort().join()
    ? []
    : ["source: must hold the same fields as notes"];
}

/** Checks the whole --locale file; any error rejects everything (AC-18). */
export function validateRecipeTranslationNoteProposals(
  value: unknown,
): ProposalValidation<RecipeTranslationNoteProposal> {
  return validateFile(RecipeTranslationNoteProposalSchema, value, translationKeyErrors);
}

export type RecipeTranslationNotePayloadRow = {
  readonly id: string;
  readonly source: Partial<Record<NoteField, string>>;
  readonly notes: Partial<Record<NoteField, string>>;
};

/** Notes trimmed, `source` untouched, without the reviewer only `name`. */
export function toRecipeTranslationNotePayload(
  proposals: readonly RecipeTranslationNoteProposal[],
): readonly RecipeTranslationNotePayloadRow[] {
  return proposals.map((p) => ({
    id: p.id,
    source: p.source,
    notes: Object.fromEntries(Object.entries(p.notes).map(([field, text]) => [field, text.trim()])),
  }));
}

/** Haiku's structured output for a --locale batch (AC-17). */
export const LocaleNotesReplySchema = z.object({
  recipes: z.array(
    z.object({
      id: z.string(),
      drink_style_note: z.string().nullable(),
      bartender_tip: z.string().nullable(),
      presentation_tip: z.string().nullable(),
    }),
  ),
});

export type LocaleNotesReply = z.infer<typeof LocaleNotesReplySchema>;

/**
 * Turns a reply into file rows. Fails when a recipe is missing, a requested
 * field is not a valid text, or an unrequested field is not null, so the
 * batch is retried (AC-17). `typeset` is the locale's punctuation pass
 * (spec 0046 AC-1), run before validation so the length check sees the
 * stored text.
 */
export function proposalsFromLocaleReply(
  batch: readonly BackfillPick[],
  reply: LocaleNotesReply,
  typeset: (text: string) => string = (text) => text,
): ProposalValidation<RecipeTranslationNoteProposal> {
  const byId = new Map(reply.recipes.map((r) => [r.id, r]));
  const errors = batch.flatMap((pick) => {
    const row = byId.get(pick.id);
    if (!row) return [`${pick.id} (${pick.name}): missing from the reply`];
    return NOTE_FIELDS.filter((f) => !pick.fields.includes(f) && row[f] !== null).map(
      (f) => `${pick.id} (${pick.name}): ${f} was not requested`,
    );
  });
  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return validateRecipeTranslationNoteProposals(
    batch.map((pick) => ({
      id: pick.id,
      name: pick.name,
      source: pick.source,
      notes: Object.fromEntries(
        pick.fields.map((f) => {
          const text = byId.get(pick.id)?.[f];
          return [f, typeof text === "string" ? typeset(text) : text];
        }),
      ),
    })),
  );
}

/** What apply_recipe_translation_notes returns (AC-18). */
export const RecipeTranslationNotesResultSchema = z.object({
  missing_row: z.array(z.guid()),
  stale: z.array(z.object({ id: z.guid(), field: z.enum(NOTE_FIELDS) })),
  gone: z.array(z.guid()),
});

export type RecipeTranslationNotesResult = z.infer<typeof RecipeTranslationNotesResultSchema>;
