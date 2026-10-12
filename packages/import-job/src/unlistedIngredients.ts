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
  ingredientName: string;
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
 * juice" consumes its text before "lime" can match it. A match counts as
 * listed when the recipe lists that ingredient or lists a name containing
 * the matched phrase as a word ("rum" with "Light Rum" listed). Staples are
 * skipped.
 */
export function findUnlistedIngredients(
  recipes: readonly ReportRecipe[],
  ingredientNames: readonly string[],
  synonyms: Readonly<Record<string, string>>,
  staples: readonly string[],
): UnlistedIngredient[] {
  const stapleKeys = new Set(staples.map(catalogNameKey));

  const phrases: Phrase[] = [
    ...ingredientNames.map((name) => ({ phrase: catalogNameKey(name), ingredientName: name })),
    ...Object.entries(synonyms).map(([phrase, ingredientName]) => ({
      phrase: catalogNameKey(phrase),
      ingredientName,
    })),
  ]
    .filter(
      (entry) => entry.phrase.length > 0 && !stapleKeys.has(catalogNameKey(entry.ingredientName)),
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
