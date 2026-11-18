// Pure checks for generate-drink-idea (spec 0059 AC-10). No npm: or jsr:
// imports, and a structural input type of its own, so the root vitest runs it.
//
// - Pantry rule (spec 0036 AC-11): every ingredient comes from the pantry or the
//   staples, and at least one from the pantry.
// - Name rule (spec 0059 AC-3): every name_source_names entry is one of the
//   recipe's ingredient source names.
// - Garnish (spec 0059 AC-1, AC-8): a blank garnish becomes null, and the server
//   alone decides in_pantry, folding a trailing plural on both sides.

export interface IdeaIngredient {
  readonly name: string;
  readonly source_name: string;
  readonly amount: string;
}

export interface IdeaGarnish {
  readonly name: string;
  readonly source_name: string;
}

/** The model's output, in the shape the structured output schema produces. */
export interface RawDrinkIdea {
  readonly ingredients: readonly IdeaIngredient[];
  readonly name_source_names: readonly string[];
  readonly name: string;
  readonly garnish: IdeaGarnish | null;
  readonly steps: readonly string[];
}

export interface CheckedGarnish extends IdeaGarnish {
  readonly in_pantry: boolean;
}

/** A passed idea: garnish checked, name_source_names stripped. */
export interface CheckedDrinkIdea {
  readonly name: string;
  readonly ingredients: readonly IdeaIngredient[];
  readonly garnish: CheckedGarnish | null;
  readonly steps: readonly string[];
}

export type IdeaCheckFailure = "pantry_mismatch" | "name_mismatch";

export type IdeaCheckResult =
  | { readonly ok: true; readonly idea: CheckedDrinkIdea }
  | { readonly ok: false; readonly reason: IdeaCheckFailure; readonly offending?: string };

export function normalizeIngredientName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Staples (Ice, Water) are always on hand, so the pantry never holds them
 * (spec 0036 AC-10). Drop any the pantry somehow lists, so no name is offered twice.
 */
export function stapleNamesOutsidePantry(
  stapleNames: readonly string[],
  pantryNames: readonly string[],
): readonly string[] {
  const pantrySet = new Set(pantryNames.map(normalizeIngredientName));
  return stapleNames.filter((name) => !pantrySet.has(normalizeIngredientName(name)));
}

/**
 * Every ingredient must come from the pantry or the staples, and at least one
 * from the pantry: an idea of only Ice and Water is no idea (spec 0036 AC-11).
 */
export function usesOnlyAvailableIngredients(
  ingredients: readonly IdeaIngredient[],
  pantryNames: readonly string[],
  stapleNames: readonly string[],
): boolean {
  const pantrySet = new Set(pantryNames.map(normalizeIngredientName));
  const stapleSet = new Set(stapleNames.map(normalizeIngredientName));
  const sourceNames = ingredients.map((ingredient) =>
    normalizeIngredientName(ingredient.source_name),
  );
  return (
    sourceNames.every((name) => pantrySet.has(name) || stapleSet.has(name)) &&
    sourceNames.some((name) => pantrySet.has(name))
  );
}

/**
 * The first name_source_names entry the recipe does not use, or null when every
 * entry is in the recipe. Blank entries are ignored, duplicates allowed (AC-3).
 */
export function nameEntryOutsideRecipe(
  nameSourceNames: readonly string[],
  ingredients: readonly IdeaIngredient[],
): string | null {
  const recipeSet = new Set(
    ingredients.map((ingredient) => normalizeIngredientName(ingredient.source_name)),
  );
  return (
    nameSourceNames
      .map((entry) => entry.trim())
      .find((entry) => entry !== "" && !recipeSet.has(normalizeIngredientName(entry))) ?? null
  );
}

/** A normalized name plus its forms with a trailing plural `s` or `es` removed. */
function pluralForms(name: string): readonly string[] {
  const normalized = normalizeIngredientName(name);
  return [
    normalized,
    ...(normalized.endsWith("s") ? [normalized.slice(0, -1)] : []),
    ...(normalized.endsWith("es") ? [normalized.slice(0, -2)] : []),
  ];
}

/**
 * Null for a missing or blank garnish (AC-8); else the trimmed garnish with
 * in_pantry true only when its source name, plural folded on both sides,
 * matches a pantry ingredient or a staple (AC-1).
 */
export function checkGarnish(
  garnish: IdeaGarnish | null,
  pantryNames: readonly string[],
  stapleNames: readonly string[],
): CheckedGarnish | null {
  if (garnish === null) return null;
  const name = garnish.name.trim();
  const sourceName = garnish.source_name.trim();
  if (name === "" || sourceName === "") return null;
  const available = new Set([...pantryNames, ...stapleNames].flatMap(pluralForms));
  return {
    name,
    source_name: sourceName,
    in_pantry: pluralForms(sourceName).some((form) => available.has(form)),
  };
}

/** Runs every check; the pantry rule wins when an idea fails both (AC-7). */
export function checkIdea(
  idea: RawDrinkIdea,
  pantryNames: readonly string[],
  stapleNames: readonly string[],
): IdeaCheckResult {
  if (!usesOnlyAvailableIngredients(idea.ingredients, pantryNames, stapleNames)) {
    return { ok: false, reason: "pantry_mismatch" };
  }
  const offending = nameEntryOutsideRecipe(idea.name_source_names, idea.ingredients);
  if (offending !== null) {
    return { ok: false, reason: "name_mismatch", offending };
  }
  return {
    ok: true,
    idea: {
      name: idea.name,
      ingredients: idea.ingredients,
      garnish: checkGarnish(idea.garnish, pantryNames, stapleNames),
      steps: idea.steps,
    },
  };
}
