/**
 * Spec 0064 AC-7: the submit form warns when the typed name exactly matches a
 * live catalog recipe's localized or English name, ignoring case, accents, and
 * surrounding spaces. Pure; the search itself is `searchRecipes`.
 */

/** How many search results the form checks for an exact match (Value sourcing). */
export const DUPLICATE_SEARCH_LIMIT = 10;

/** Combining diacritical marks, U+0300 to U+036F. */
const LATIN_DIACRITICS = new RegExp(
  `[${String.fromCodePoint(0x300)}-${String.fromCodePoint(0x36f)}]`,
  "g",
);

/**
 * Lowercase, accents stripped, trimmed. Only Latin combining diacritics
 * (U+0300 to U+036F) are removed, so Japanese voicing marks (が) and other
 * scripts keep their meaning.
 */
export function normalizeRecipeNameForMatch(name: string): string {
  return name.trim().normalize("NFD").replace(LATIN_DIACRITICS, "").normalize("NFC").toLowerCase();
}

export interface DuplicateCandidate {
  id: string;
  /** The localized name the search returned. */
  name: string;
  /** The English base name. */
  baseName: string;
}

/** The candidates whose localized or English name equals the typed name. */
export function findDuplicateRecipes<T extends DuplicateCandidate>(
  typedName: string,
  candidates: readonly T[],
): T[] {
  const typed = normalizeRecipeNameForMatch(typedName);
  if (typed.length === 0) return [];
  return candidates.filter(
    (candidate) =>
      normalizeRecipeNameForMatch(candidate.name) === typed ||
      normalizeRecipeNameForMatch(candidate.baseName) === typed,
  );
}
