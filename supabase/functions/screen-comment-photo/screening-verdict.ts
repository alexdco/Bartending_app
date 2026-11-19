// Pure verdict parsing for screen-comment-photo (spec 0062 AC-2, AC-3). No
// npm: or jsr: imports, and structural input types of its own, so the root
// vitest runs it.
//
// The model answers only through the `report_verdict` tool. Anything else
// counts as a failed attempt: no tool call, a refusal or truncated reply, an
// unknown verdict or category, or `flag` with no categories.

export const SCREENING_CATEGORIES = [
  "nudity_sexual",
  "gore_violence",
  "hate_symbols",
  "illegal_drugs",
  "minor_with_alcohol",
  "personal_info",
] as const;

export type ScreeningCategory = (typeof SCREENING_CATEGORIES)[number];

export const VERDICT_TOOL_NAME = "report_verdict";

/** The largest file the function will screen; the bucket's own limit. */
export const MAX_PHOTO_BYTES = 5 * 1024 * 1024;

export type ScreeningVerdict =
  | { readonly outcome: "approved" }
  | { readonly outcome: "flagged"; readonly categories: readonly ScreeningCategory[] }
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

const isCategory = (value: unknown): value is ScreeningCategory =>
  typeof value === "string" && (SCREENING_CATEGORIES as readonly string[]).includes(value);

const failed = (reason: string): ScreeningVerdict => ({ outcome: "failed", reason });

export function parseVerdict(message: VerdictMessage): ScreeningVerdict {
  if (message.stop_reason !== "tool_use") {
    return failed(`stop_reason:${message.stop_reason ?? "null"}`);
  }

  const toolUse = message.content.find(
    (block) => block.type === "tool_use" && block.name === VERDICT_TOOL_NAME,
  );
  if (!toolUse) return failed("no_tool_call");

  const input = toolUse.input;
  if (typeof input !== "object" || input === null) return failed("bad_input");

  const { verdict, categories } = input as { verdict?: unknown; categories?: unknown };
  const rawCategories = categories === undefined ? [] : categories;
  if (!Array.isArray(rawCategories)) return failed("bad_categories");
  if (!rawCategories.every(isCategory)) return failed("unknown_category");

  const unique = [...new Set(rawCategories)];

  if (verdict === "allow") return { outcome: "approved" };
  if (verdict === "flag") {
    return unique.length > 0
      ? { outcome: "flagged", categories: unique }
      : failed("flag_without_categories");
  }
  return failed("unknown_verdict");
}

/** JPEG files start with FF D8 FF. */
export function isJpeg(bytes: Uint8Array): boolean {
  return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
}

/** Why a downloaded file cannot be screened, or null when it can (invariant 8). */
export function photoFileProblem(bytes: Uint8Array): string | null {
  if (bytes.length === 0) return "empty_file";
  if (bytes.length > MAX_PHOTO_BYTES) return "file_too_large";
  if (!isJpeg(bytes)) return "not_jpeg";
  return null;
}
