import type { UploadRecipeImageError } from "../recipeImages";
import type { SaveSubmissionError } from "./errors";
import {
  SUBMISSION_GLASS_MAX_LENGTH,
  SUBMISSION_INGREDIENT_NAME_MAX_LENGTH,
  SUBMISSION_INSTRUCTIONS_MAX_LENGTH,
  SUBMISSION_MAX_INGREDIENTS,
  SUBMISSION_MEASURE_MAX_LENGTH,
  SUBMISSION_NAME_MAX_LENGTH,
  SUBMISSION_NOTE_MAX_LENGTH,
  type SubmissionValidationError,
} from "./validation";

/**
 * Which `submissions` message each validation or save error shows, as a key
 * plus its values, so web (next-intl) and mobile (i18next) word every refusal
 * the same way (spec 0064 AC-2, AC-5, AC-18, AC-24). Keys name entries in the
 * `submissions` namespace of both apps' message files.
 */
export type SubmissionMessageKey =
  | "errorRequired"
  | "errorTooLong"
  | "errorInvalidStatus"
  | "errorIngredientsRequired"
  | "errorTooManyIngredients"
  | "errorPendingCap"
  | "errorDailyCap"
  | "errorBlocked"
  | "errorNotEditable"
  | "errorDisplayNameRequired"
  | "errorSaveFailed"
  | "signInTitle"
  | "photoErrorUploadRejected"
  | "photoUploadFailed";

export interface SubmissionMessage {
  key: SubmissionMessageKey;
  values?: { max: number };
}

/** Spec 0018: a display name is 1 to 50 characters. */
const DISPLAY_NAME_MAX_LENGTH = 50;

export type SubmissionTopField =
  "name" | "instructions" | "glass" | "note" | "displayName" | "alcoholicStatus";

const FIELD_MAX_LENGTH: Readonly<Record<SubmissionTopField, number>> = {
  name: SUBMISSION_NAME_MAX_LENGTH,
  instructions: SUBMISSION_INSTRUCTIONS_MAX_LENGTH,
  glass: SUBMISSION_GLASS_MAX_LENGTH,
  note: SUBMISSION_NOTE_MAX_LENGTH,
  displayName: DISPLAY_NAME_MAX_LENGTH,
  alcoholicStatus: DISPLAY_NAME_MAX_LENGTH,
};

/** The message under one top level field, or null when it has no error. */
export function submissionFieldMessage(
  errors: readonly SubmissionValidationError[],
  field: SubmissionTopField,
): SubmissionMessage | null {
  const match = errors.find((error) => error.field === field);
  if (!match) return null;
  if (match.reason === "required") return { key: "errorRequired" };
  if (match.reason === "invalid") return { key: "errorInvalidStatus" };
  return { key: "errorTooLong", values: { max: FIELD_MAX_LENGTH[field] } };
}

/** The message for the ingredient list as a whole (none, or too many). */
export function submissionIngredientsMessage(
  errors: readonly SubmissionValidationError[],
): SubmissionMessage | null {
  const match = errors.find(
    (error) =>
      error.field === "ingredients" && (error.reason === "required" || error.reason === "too_many"),
  );
  if (!match) return null;
  return match.reason === "too_many"
    ? { key: "errorTooManyIngredients", values: { max: SUBMISSION_MAX_INGREDIENTS } }
    : { key: "errorIngredientsRequired" };
}

/** The message under one ingredient row's name or measure. */
export function submissionIngredientRowMessage(
  errors: readonly SubmissionValidationError[],
  index: number,
  part: "name" | "measure",
): SubmissionMessage | null {
  const match = errors.find(
    (error) =>
      error.field === "ingredients" &&
      "index" in error &&
      error.index === index &&
      (part === "measure"
        ? error.reason === "measure_too_long"
        : error.reason !== "measure_too_long"),
  );
  if (!match || !("index" in match)) return null;
  if (match.reason === "name_required") return { key: "errorRequired" };
  return {
    key: "errorTooLong",
    values: {
      max:
        part === "measure" ? SUBMISSION_MEASURE_MAX_LENGTH : SUBMISSION_INGREDIENT_NAME_MAX_LENGTH,
    },
  };
}

export type SaveSubmissionFormError =
  | { reason: "validation"; errors: readonly SubmissionValidationError[] }
  | SaveSubmissionError
  | { reason: "photo_failed"; upload: UploadRecipeImageError };

/** A save refusal that is not a field error, in the form's words; null for validation. */
export function submissionSaveMessage(error: SaveSubmissionFormError): SubmissionMessage | null {
  switch (error.reason) {
    case "validation":
      return null;
    case "photo_failed":
      return {
        key:
          error.upload.reason === "too_large" || error.upload.reason === "wrong_type"
            ? "photoErrorUploadRejected"
            : "photoUploadFailed",
      };
    case "pending_cap":
      return { key: "errorPendingCap" };
    case "daily_cap":
      return { key: "errorDailyCap" };
    case "blocked":
      return { key: "errorBlocked" };
    case "not_editable":
      return { key: "errorNotEditable" };
    case "anonymous":
      return { key: "signInTitle" };
    case "display_name_required":
      return { key: "errorDisplayNameRequired" };
    case "invalid":
    case "request_failed":
      return { key: "errorSaveFailed" };
  }
}
