// Pure validation for the reviewed recipe notes file (spec 0043, AC-7,
// AC-8). propose-recipe-notes.ts checks Haiku's output with it and
// apply-recipe-notes.ts checks the reviewed file before the RPC. Mirrors the
// checks in apply_recipe_notes. Kept out of the index barrel: only those
// scripts use it.
// Spec: docs/specs/0043-recipe-style-tips-allergens/index.md
import { z } from "zod/v4";
import { DRINK_STYLES, noteLength, RECIPE_NOTE_MAX_LENGTH, type DrinkStyle } from "./drinkStyle";
import type { ProposalValidation } from "./ingredientAllergenProposals";

/** Present, not blank after trimming, and at most 240 code points (AC-8). */
const NoteTextSchema = z
  .string()
  .refine((text) => text.trim().length > 0, { message: "is blank" })
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
  es: NotesSchema,
});

export type RecipeNoteProposal = z.infer<typeof RecipeNoteProposalSchema>;

interface NotesPayload {
  readonly drink_style_note: string;
  readonly bartender_tip: string;
  readonly presentation_tip: string;
}

export interface RecipeNotePayloadRow extends NotesPayload {
  readonly id: string;
  readonly drink_style: DrinkStyle;
  readonly es: NotesPayload;
}

/** Checks the whole file; any error rejects everything (AC-8). */
export function validateRecipeNoteProposals(
  value: unknown,
): ProposalValidation<RecipeNoteProposal> {
  const parsed = z.array(RecipeNoteProposalSchema).safeParse(value);
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

  const ids = parsed.data.map((p) => p.id);
  const duplicates = [...new Set(ids.filter((id, index) => ids.indexOf(id) !== index))];
  return duplicates.length > 0
    ? { ok: false, errors: duplicates.map((id) => `${id}: appears more than once`) }
    : { ok: true, proposals: parsed.data };
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
    es: trimNotes(p.es),
  }));
}
