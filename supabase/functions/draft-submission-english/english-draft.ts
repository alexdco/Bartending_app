// Pure prompt building and draft parsing for draft-submission-english
// (spec 0064 AC-12). No npm: or jsr: imports, so the root vitest runs it.
//
// The model answers only through the `report_english_draft` tool, with every
// optional field as a string ("" for none) so the strict schema stays simple.
// The draft must keep one ingredient per original ingredient, in order, so
// the admin can compare them line by line; anything else is a failed draft.

export const DRAFT_TOOL_NAME = "report_english_draft";

export interface DraftSource {
  readonly locale: string;
  readonly name: string;
  readonly instructions: string;
  readonly ingredients: unknown;
  readonly glass: string | null;
  readonly note: string | null;
}

export interface DraftIngredient {
  readonly name: string;
  readonly measure: string | null;
}

export interface EnglishDraft {
  readonly name: string;
  readonly instructions: string;
  readonly glass: string | null;
  readonly note: string | null;
  readonly ingredients: readonly DraftIngredient[];
}

export type DraftResult =
  | { readonly data: EnglishDraft; readonly error: null }
  | { readonly data: null; readonly error: string };

/** The slice of an Anthropic Message the parser reads. */
export interface DraftMessage {
  readonly stop_reason: string | null;
  readonly content: readonly {
    readonly type: string;
    readonly name?: string;
    readonly input?: unknown;
  }[];
}

const failed = (error: string): DraftResult => ({ data: null, error });

const optionalText = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

/** The submission's ingredients as name and measure pairs, skipping anything malformed. */
export function draftSourceIngredients(ingredients: unknown): DraftIngredient[] {
  if (!Array.isArray(ingredients)) return [];
  return ingredients.flatMap((item) => {
    if (typeof item !== "object" || item === null) return [];
    const { name, measure } = item as { name?: unknown; measure?: unknown };
    if (typeof name !== "string") return [];
    return [{ name, measure: optionalText(measure) }];
  });
}

export function parseEnglishDraft(message: DraftMessage, expectedIngredients: number): DraftResult {
  if (message.stop_reason !== "tool_use") {
    return failed(`stop_reason:${message.stop_reason ?? "null"}`);
  }

  const toolUse = message.content.find(
    (block) => block.type === "tool_use" && block.name === DRAFT_TOOL_NAME,
  );
  if (!toolUse) return failed("no_tool_call");

  const input = toolUse.input;
  if (typeof input !== "object" || input === null) return failed("bad_input");

  const { name, instructions, glass, note, ingredients } = input as Record<string, unknown>;

  const draftName = optionalText(name);
  const draftInstructions = optionalText(instructions);
  if (!draftName) return failed("missing_name");
  if (!draftInstructions) return failed("missing_instructions");
  if (!Array.isArray(ingredients)) return failed("bad_ingredients");
  if (ingredients.length !== expectedIngredients) return failed("ingredient_count_mismatch");

  const draftIngredients: DraftIngredient[] = [];
  for (const item of ingredients) {
    if (typeof item !== "object" || item === null) return failed("bad_ingredient");
    const { name: ingredientName, measure } = item as { name?: unknown; measure?: unknown };
    const trimmedName = optionalText(ingredientName);
    if (!trimmedName) return failed("missing_ingredient_name");
    draftIngredients.push({ name: trimmedName, measure: optionalText(measure) });
  }

  return {
    data: {
      name: draftName,
      instructions: draftInstructions,
      glass: optionalText(glass),
      note: optionalText(note),
      ingredients: draftIngredients,
    },
    error: null,
  };
}

/**
 * The submission as one JSON document inside a tag, so author text can never
 * read as instructions outside the data block.
 */
export function englishDraftText(source: DraftSource): string {
  const data = {
    language: source.locale,
    name: source.name,
    ingredients: draftSourceIngredients(source.ingredients),
    instructions: source.instructions,
    glass: source.glass ?? "",
    note: source.note ?? "",
  };
  return `<submission>\n${JSON.stringify(data, null, 2)}\n</submission>\n\nTranslate this recipe into English.`;
}
