import type { SubmissionField } from "./validation";

/**
 * The explicit codes the spec 0064 Postgres functions raise as their message
 * (errcode P0001). Pure mapping from a PostgREST error to a typed reason, so
 * both apps show the same message for the same refusal.
 */
export const SAVE_SUBMISSION_CODES = [
  "anonymous",
  "blocked",
  "display_name_required",
  "pending_cap",
  "daily_cap",
  "not_editable",
] as const;

export type SaveSubmissionCode = (typeof SAVE_SUBMISSION_CODES)[number];

/** invalid_<field> from save_recipe_submission, mapped to the form field it names. */
const INVALID_FIELD_CODES: Readonly<Record<string, SubmissionField | "photo" | "locale">> = {
  invalid_name: "name",
  invalid_ingredients: "ingredients",
  invalid_instructions: "instructions",
  invalid_glass: "glass",
  invalid_alcoholic_status: "alcoholicStatus",
  invalid_note: "note",
  invalid_display_name: "displayName",
  invalid_photo: "photo",
  invalid_locale: "locale",
};

export type SaveSubmissionError =
  | { reason: SaveSubmissionCode }
  | { reason: "invalid"; field: SubmissionField | "photo" | "locale" }
  | { reason: "request_failed"; message: string };

interface PostgrestLikeError {
  code?: string;
  message: string;
}

/** The raised code, or null when the error is not one of ours. */
export function raisedCode(error: PostgrestLikeError): string | null {
  return error.code === "P0001" ? error.message : null;
}

export function toSaveSubmissionError(error: PostgrestLikeError): SaveSubmissionError {
  const code = raisedCode(error);
  if (code !== null) {
    if ((SAVE_SUBMISSION_CODES as readonly string[]).includes(code)) {
      return { reason: code as SaveSubmissionCode };
    }
    const field = INVALID_FIELD_CODES[code];
    if (field !== undefined) {
      return { reason: "invalid", field };
    }
  }
  return { reason: "request_failed", message: error.message };
}
