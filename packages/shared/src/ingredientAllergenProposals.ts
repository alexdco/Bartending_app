// Pure validation for the reviewed ingredient allergen file (spec 0043,
// AC-9). propose-ingredient-allergens.ts checks Haiku's output with it and
// apply-ingredient-allergens.ts checks the reviewed file before the RPC.
// Kept out of the index barrel: only those scripts use it.
// Spec: docs/specs/0043-recipe-style-tips-allergens/index.md
import { z } from "zod/v4";
import { ALLERGENS, type Allergen } from "./allergens";

export const IngredientAllergenProposalSchema = z.object({
  id: z.guid(),
  /** For the reviewer; stripped before the RPC. */
  name: z.string(),
  allergens: z.array(z.enum(ALLERGENS)),
  /** Why each allergen is flagged, for the reviewer; never sent. */
  reasons: z.record(z.string(), z.string()),
});

export type IngredientAllergenProposal = z.infer<typeof IngredientAllergenProposalSchema>;

export interface IngredientAllergenPayloadRow {
  readonly id: string;
  readonly allergens: readonly Allergen[];
}

export type ProposalValidation<T> =
  | { readonly ok: true; readonly proposals: readonly T[] }
  | { readonly ok: false; readonly errors: readonly string[] };

function duplicateIdErrors(ids: readonly string[]): readonly string[] {
  return [...new Set(ids.filter((id, index) => ids.indexOf(id) !== index))].map(
    (id) => `${id}: appears more than once`,
  );
}

function rowErrors(proposal: IngredientAllergenProposal): readonly string[] {
  const label = `${proposal.id} (${proposal.name})`;
  const repeated = proposal.allergens.filter(
    (allergen, index) => proposal.allergens.indexOf(allergen) !== index,
  );
  const unexplained = proposal.allergens.filter(
    (allergen) => !(proposal.reasons[allergen]?.trim() ?? ""),
  );
  return [
    ...repeated.map((allergen) => `${label}: "${allergen}" is listed twice`),
    ...unexplained.map((allergen) => `${label}: "${allergen}" has no reason`),
  ];
}

/**
 * Checks the whole file; any error rejects everything (AC-9). An empty
 * allergen list is valid (reviewed, none); every flag needs a reason.
 */
export function validateIngredientAllergenProposals(
  value: unknown,
): ProposalValidation<IngredientAllergenProposal> {
  const parsed = z.array(IngredientAllergenProposalSchema).safeParse(value);
  if (!parsed.success) {
    return {
      ok: false,
      errors: parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`),
    };
  }

  const errors = [
    ...duplicateIdErrors(parsed.data.map((p) => p.id)),
    ...parsed.data.flatMap(rowErrors),
  ];
  return errors.length > 0 ? { ok: false, errors } : { ok: true, proposals: parsed.data };
}

/** Only `{ id, allergens }` reaches the database; name and reasons stay local. */
export function toIngredientAllergenPayload(
  proposals: readonly IngredientAllergenProposal[],
): readonly IngredientAllergenPayloadRow[] {
  return proposals.map(({ id, allergens }) => ({ id, allergens }));
}

/** Review file order: by ingredient name, then id. */
export function sortByName<T extends { readonly id: string; readonly name: string }>(
  rows: readonly T[],
): readonly T[] {
  return [...rows].sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
}
