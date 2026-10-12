import { catalogNameKey } from "@bartendingapp/shared/catalog-names";

// Spec 0036 AC-8: finds recipes whose instructions name an ingredient the
// recipe doesn't list. Pure: plain data in, plain data out.

export interface ReportRecipe {
  sourceId: string;
  name: string;
  instructions: string;
  ingredientNames: readonly string[];
}

export interface UnlistedIngredient {
  sourceId: string;
  recipeName: string;
  /** The catalog ingredient the instructions name. */
  ingredientName: string;
  /** The phrase as matched in the instructions. */
  matchedPhrase: string;
}

interface Phrase {
  phrase: string;
  /** Null for an ignored phrase, which is consumed without a finding. */
  ingredientName: string | null;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Whole word, case insensitive, with an optional trailing `s`. */
function phrasePattern(phrase: string): RegExp {
  return new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegExp(phrase)}s?(?![\\p{L}\\p{N}])`, "giu");
}

function containsWord(haystack: string, phrase: string): boolean {
  return phrasePattern(phrase).test(haystack);
}

/**
 * Matches catalog ingredient names and synonyms longest first, so "lime
 * juice" consumes its text before "lime" can match it. A synonym wins over
 * an ingredient name spelled the same way. `ignoredPhrases` (glass names
 * such as "whiskey sour glass" or "coffee mug") are consumed without a
 * finding. A match counts as listed when the recipe lists that ingredient or
 * lists a name containing the matched phrase as a word ("rum" with "Light
 * Rum" listed). Staples are skipped.
 */
export function findUnlistedIngredients(
  recipes: readonly ReportRecipe[],
  ingredientNames: readonly string[],
  synonyms: Readonly<Record<string, string>>,
  staples: readonly string[],
  ignoredPhrases: readonly string[] = [],
): UnlistedIngredient[] {
  const stapleKeys = new Set(staples.map(catalogNameKey));

  const byPhrase = new Map<string, string | null>([
    ...ingredientNames.map((name) => [catalogNameKey(name), name] as const),
    ...Object.entries(synonyms).map(([phrase, name]) => [catalogNameKey(phrase), name] as const),
    ...ignoredPhrases.map((phrase) => [catalogNameKey(phrase), null] as const),
  ]);

  const phrases: Phrase[] = [...byPhrase]
    .map(([phrase, ingredientName]) => ({ phrase, ingredientName }))
    .filter(
      (entry) =>
        entry.phrase.length > 0 &&
        (entry.ingredientName === null || !stapleKeys.has(catalogNameKey(entry.ingredientName))),
    )
    .sort((a, b) => b.phrase.length - a.phrase.length || a.phrase.localeCompare(b.phrase));

  return recipes.flatMap((recipe) => {
    const listedKeys = recipe.ingredientNames.map(catalogNameKey);
    const listedSet = new Set(listedKeys);

    const { found } = phrases.reduce<{ text: string; found: Map<string, UnlistedIngredient> }>(
      (state, entry) => {
        const pattern = phrasePattern(entry.phrase);
        if (!pattern.test(state.text)) return state;
        // Blank the matched text so shorter phrases can't match inside it.
        const text = state.text.replace(phrasePattern(entry.phrase), (m) => " ".repeat(m.length));
        if (entry.ingredientName === null) return { text, found: state.found };
        const key = catalogNameKey(entry.ingredientName);
        const listed =
          listedSet.has(key) || listedKeys.some((name) => containsWord(name, entry.phrase));
        if (listed || state.found.has(key)) return { text, found: state.found };
        const found = new Map(state.found).set(key, {
          sourceId: recipe.sourceId,
          recipeName: recipe.name,
          ingredientName: entry.ingredientName,
          matchedPhrase: entry.phrase,
        });
        return { text, found };
      },
      { text: recipe.instructions.toLowerCase(), found: new Map() },
    );

    return [...found.values()];
  });
}
