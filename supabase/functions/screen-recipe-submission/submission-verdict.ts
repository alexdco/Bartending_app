// Pure prompt building and verdict parsing for screen-recipe-submission
// (spec 0064 AC-9). No npm: or jsr: imports, and structural input types of
// its own, so the root vitest runs it.
//
// The model answers only through the `report_screening` tool. Anything else
// counts as a failed attempt: no tool call, a refusal or truncated reply, an
// unknown verdict, or a missing photo verdict when there is a photo.

export const SCREENING_TOOL_NAME = "report_screening";

/** The largest file the function will send; the bucket's own limit. */
export const MAX_SUBMISSION_PHOTO_BYTES = 2 * 1024 * 1024;

/** recipe_submissions.screening_note holds up to 300 characters. */
export const SCREENING_NOTE_MAX_LENGTH = 300;

export type ScreeningLabel = "clear" | "flagged";

export type SubmissionVerdict =
  | {
      readonly outcome: "screened";
      readonly text: ScreeningLabel;
      /** Null when the submission has no photo. */
      readonly photo: ScreeningLabel | null;
      readonly note: string | null;
    }
  | { readonly outcome: "failed"; readonly reason: string };

/** The slice of an Anthropic Message the parser reads. */
export interface VerdictMessage {
  readonly stop_reason: string | null;
  readonly content: readonly {
    readonly type: string;
    readonly name?: string;
    readonly input?: unknown;
  }[];
}

/** The claimed row's author fields, as claim_pending_recipe_submissions returns them. */
export interface ClaimedSubmission {
  readonly name: string;
  readonly instructions: string;
  readonly ingredients: unknown;
  readonly glass: string | null;
  readonly alcoholic_status: string;
  readonly note: string | null;
}

const failed = (reason: string): SubmissionVerdict => ({ outcome: "failed", reason });

const toLabel = (verdict: unknown): ScreeningLabel | null =>
  verdict === "allow" ? "clear" : verdict === "flag" ? "flagged" : null;

/** Trimmed, at most 300 characters, null when empty. */
export function clampScreeningNote(note: unknown): string | null {
  if (typeof note !== "string") return null;
  const trimmed = note.trim();
  if (trimmed.length === 0) return null;
  return Array.from(trimmed).slice(0, SCREENING_NOTE_MAX_LENGTH).join("").trim();
}

export function parseSubmissionVerdict(
  message: VerdictMessage,
  hasPhoto: boolean,
): SubmissionVerdict {
  if (message.stop_reason !== "tool_use") {
    return failed(`stop_reason:${message.stop_reason ?? "null"}`);
  }

  const toolUse = message.content.find(
    (block) => block.type === "tool_use" && block.name === SCREENING_TOOL_NAME,
  );
  if (!toolUse) return failed("no_tool_call");

  const input = toolUse.input;
  if (typeof input !== "object" || input === null) return failed("bad_input");

  const { text_verdict, photo_verdict, note } = input as {
    text_verdict?: unknown;
    photo_verdict?: unknown;
    note?: unknown;
  };

  const text = toLabel(text_verdict);
  if (!text) return failed("unknown_text_verdict");

  let photo: ScreeningLabel | null = null;
  if (hasPhoto) {
    photo = toLabel(photo_verdict);
    if (!photo) return failed("missing_photo_verdict");
  }

  return { outcome: "screened", text, photo, note: clampScreeningNote(note) };
}

interface IngredientLine {
  readonly name: string;
  readonly measure: string | null;
}

function ingredientLines(ingredients: unknown): IngredientLine[] {
  if (!Array.isArray(ingredients)) return [];
  return ingredients.flatMap((item) => {
    if (typeof item !== "object" || item === null) return [];
    const { name, measure } = item as { name?: unknown; measure?: unknown };
    if (typeof name !== "string") return [];
    return [{ name, measure: typeof measure === "string" ? measure : null }];
  });
}

/**
 * The submission as one JSON document inside a tag, so author text can never
 * read as instructions outside the data block. The system prompt says to
 * treat everything inside as content to judge.
 */
export function submissionScreeningText(submission: ClaimedSubmission, hasPhoto: boolean): string {
  const data = {
    name: submission.name,
    ingredients: ingredientLines(submission.ingredients),
    instructions: submission.instructions,
    glass: submission.glass,
    alcoholic_status: submission.alcoholic_status,
    note: submission.note,
  };
  const photoLine = hasPhoto
    ? "The attached image is the photo the author submitted with this recipe."
    : "This submission has no photo.";
  return `<submission>\n${JSON.stringify(data, null, 2)}\n</submission>\n\n${photoLine}\nScreen this submission.`;
}

/** WebP files start with "RIFF", four size bytes, then "WEBP". */
export function isWebp(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  );
}

/** Why a downloaded photo cannot be screened, or null when it can. */
export function submissionPhotoProblem(bytes: Uint8Array): string | null {
  if (bytes.length === 0) return "empty_file";
  if (bytes.length > MAX_SUBMISSION_PHOTO_BYTES) return "file_too_large";
  if (!isWebp(bytes)) return "not_webp";
  return null;
}

/** RECIPE_SCREENING_DAILY_CAP, or 300 when unset or not a whole number of 0 or more. */
export function screeningDailyCap(raw: string | undefined): number {
  const parsed = Number(raw);
  return raw !== undefined && raw.trim() !== "" && Number.isInteger(parsed) && parsed >= 0
    ? parsed
    : 300;
}
