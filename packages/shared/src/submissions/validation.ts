import { validateDisplayName } from "../initials";
import { ADMIN_ALCOHOLIC_STATUSES, type AdminAlcoholicStatus } from "../adminRecipes";

/** Spec 0064 AC-2: the same limits save_recipe_submission and its checks enforce. */
export const SUBMISSION_NAME_MAX_LENGTH = 100;
export const SUBMISSION_INSTRUCTIONS_MAX_LENGTH = 2000;
export const SUBMISSION_INGREDIENT_NAME_MAX_LENGTH = 80;
export const SUBMISSION_MEASURE_MAX_LENGTH = 50;
export const SUBMISSION_MAX_INGREDIENTS = 20;
export const SUBMISSION_NOTE_MAX_LENGTH = 300;
export const SUBMISSION_GLASS_MAX_LENGTH = 100;
/** AC-5. */
export const SUBMISSION_PENDING_CAP = 5;
export const SUBMISSION_DAILY_CAP = 10;

export const SUBMISSION_ALCOHOLIC_STATUSES = ADMIN_ALCOHOLIC_STATUSES;
export type SubmissionAlcoholicStatus = AdminAlcoholicStatus;

export type SubmissionFormIngredient = { name: string; measure: string };

export interface SubmissionFormValues {
  name: string;
  ingredients: readonly SubmissionFormIngredient[];
  instructions: string;
  glass: string;
  alcoholicStatus: string;
  note: string;
  /** Only checked when the form asks for one (AC-3). */
  displayName: string;
}

export type SubmissionField =
  "name" | "ingredients" | "instructions" | "glass" | "alcoholicStatus" | "note" | "displayName";

export type SubmissionValidationError =
  | { field: "name" | "instructions"; reason: "required" | "too_long" }
  | { field: "ingredients"; reason: "required" | "too_many" }
  | {
      field: "ingredients";
      reason: "name_required" | "name_too_long" | "measure_too_long";
      index: number;
    }
  | { field: "glass" | "note"; reason: "too_long" }
  | { field: "alcoholicStatus"; reason: "invalid" }
  | { field: "displayName"; reason: "required" | "too_long" };

/** The server trims spaces, tabs, and line breaks (E' \t\r\n'); so does this. */
export function trimSubmissionText(text: string): string {
  return text.replace(/^[ \t\r\n]+|[ \t\r\n]+$/g, "");
}

/** Counts code points, like Postgres char_length, not UTF-16 units. */
export function submissionTextLength(text: string): number {
  return [...text].length;
}

// A type alias, not an interface, so it stays assignable to the RPC's Json arg.
export type SubmissionIngredientPayload = {
  name: string;
  measure: string | null;
};

/**
 * Trimmed rows with a blank measure as null. A row with neither a name nor a
 * measure is an untouched form row and is dropped; a measure with no name is
 * kept so validation can point at it.
 */
export function toSubmissionIngredients(
  ingredients: readonly SubmissionFormIngredient[],
): SubmissionIngredientPayload[] {
  return ingredients
    .map((ingredient) => ({
      name: trimSubmissionText(ingredient.name),
      measure: trimSubmissionText(ingredient.measure) || null,
    }))
    .filter((ingredient) => ingredient.name.length > 0 || ingredient.measure !== null);
}

/**
 * AC-2 and AC-3, before the round trip. Pure; the database enforces the same
 * rules again, so this is a convenience, never the guard.
 */
export function validateSubmissionForm(
  values: SubmissionFormValues,
  options: { requireDisplayName: boolean },
): SubmissionValidationError[] {
  const errors: SubmissionValidationError[] = [];
  const name = trimSubmissionText(values.name);
  const instructions = trimSubmissionText(values.instructions);
  const glass = trimSubmissionText(values.glass);
  const note = trimSubmissionText(values.note);
  const ingredients = toSubmissionIngredients(values.ingredients);

  if (name.length === 0) {
    errors.push({ field: "name", reason: "required" });
  } else if (submissionTextLength(name) > SUBMISSION_NAME_MAX_LENGTH) {
    errors.push({ field: "name", reason: "too_long" });
  }

  if (ingredients.length === 0) {
    errors.push({ field: "ingredients", reason: "required" });
  } else if (ingredients.length > SUBMISSION_MAX_INGREDIENTS) {
    errors.push({ field: "ingredients", reason: "too_many" });
  }

  ingredients.forEach((ingredient, index) => {
    if (ingredient.name.length === 0) {
      errors.push({ field: "ingredients", reason: "name_required", index });
    } else if (submissionTextLength(ingredient.name) > SUBMISSION_INGREDIENT_NAME_MAX_LENGTH) {
      errors.push({ field: "ingredients", reason: "name_too_long", index });
    }
    if (
      ingredient.measure !== null &&
      submissionTextLength(ingredient.measure) > SUBMISSION_MEASURE_MAX_LENGTH
    ) {
      errors.push({ field: "ingredients", reason: "measure_too_long", index });
    }
  });

  if (instructions.length === 0) {
    errors.push({ field: "instructions", reason: "required" });
  } else if (submissionTextLength(instructions) > SUBMISSION_INSTRUCTIONS_MAX_LENGTH) {
    errors.push({ field: "instructions", reason: "too_long" });
  }

  if (submissionTextLength(glass) > SUBMISSION_GLASS_MAX_LENGTH) {
    errors.push({ field: "glass", reason: "too_long" });
  }

  if (!(SUBMISSION_ALCOHOLIC_STATUSES as readonly string[]).includes(values.alcoholicStatus)) {
    errors.push({ field: "alcoholicStatus", reason: "invalid" });
  }

  if (submissionTextLength(note) > SUBMISSION_NOTE_MAX_LENGTH) {
    errors.push({ field: "note", reason: "too_long" });
  }

  if (options.requireDisplayName) {
    const displayName = validateDisplayName(values.displayName);
    if (displayName.trimmed.length === 0) {
      errors.push({ field: "displayName", reason: "required" });
    } else if (displayName.error === "too_long") {
      errors.push({ field: "displayName", reason: "too_long" });
    }
  }

  return errors;
}
