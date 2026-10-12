/**
 * Canonical glass and ingredient names for the recipe catalog (spec 0036).
 * Applied in every write path (the catalog import, the custom recipes
 * import, and admin saves) so no import or save flips a name back.
 */

/** Lowercased, trimmed, single spaced key used by both maps. */
export function catalogNameKey(raw: string): string {
  return raw.trim().replace(/\s+/g, " ").toLowerCase();
}

/**
 * Every glass spelling seen in the live catalog and `customRecipes.json`
 * (2026-10-12), mapped to one sentence case name. Synonyms merge here
 * (`Coupe glass` into `Coupe`, `Whiskey glass` into `Rocks glass`).
 * Proper nouns keep their capitals (`Irish coffee cup`, `Nick and Nora glass`).
 */
export const GLASS_MAP: Readonly<Record<string, string>> = {
  "balloon glass": "Balloon glass",
  "beer glass": "Beer glass",
  "beer mug": "Beer mug",
  "beer pilsner": "Pilsner glass",
  "brandy snifter": "Brandy snifter",
  "champagne flute": "Champagne flute",
  "cocktail glass": "Cocktail glass",
  "coffee mug": "Coffee mug",
  "collins glass": "Collins glass",
  "copper mug": "Copper mug",
  "cordial glass": "Cordial glass",
  coupe: "Coupe",
  "coupe glass": "Coupe",
  "double shot glass": "Double shot glass",
  "highball glass": "Highball glass",
  "hurricane glass": "Hurricane glass",
  "irish coffee cup": "Irish coffee cup",
  jar: "Jar",
  "margarita glass": "Margarita glass",
  "margarita/coupette glass": "Margarita/Coupette glass",
  "martini glass": "Martini glass",
  "mason jar": "Mason jar",
  "nick and nora glass": "Nick and Nora glass",
  "old-fashioned glass": "Old-fashioned glass",
  "pint glass": "Pint glass",
  pitcher: "Pitcher",
  "pousse cafe glass": "Pousse cafe glass",
  "punch bowl": "Punch bowl",
  "rocks glass": "Rocks glass",
  "shot glass": "Shot glass",
  "whiskey glass": "Rocks glass",
  "whiskey sour glass": "Whiskey sour glass",
  "white wine glass": "White wine glass",
  "wine glass": "Wine glass",
};

/**
 * Exceptions to the Title Case rule: short joining words that stay lower
 * case, and hyphenated brand names. Keys are `catalogNameKey` values.
 */
export const INGREDIENT_NAME_MAP: Readonly<Record<string, string>> = {
  "7-up": "7-Up",
  "cream of coconut": "Cream of Coconut",
  "creme de banane": "Creme de Banane",
  "creme de cacao": "Creme de Cacao",
  "creme de cassis": "Creme de Cassis",
  "creme de mure": "Creme de Mure",
  "giffard creme de pamplemousse rose": "Giffard Creme de Pamplemousse Rose",
  "green creme de menthe": "Green Creme de Menthe",
  "half-and-half": "Half-and-Half",
  "sirup of roses": "Sirup of Roses",
  "sweet and sour": "Sweet and Sour",
  "white creme de menthe": "White Creme de Menthe",
};

function sentenceCase(value: string): string {
  const lower = value.toLowerCase();
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

/** Capitalizes the first letter of each space or hyphen separated part, keeping inner capitals and digits. */
function titleCase(value: string): string {
  return value.replace(
    /(^|[\s-])(\p{L})/gu,
    (_match, separator: string, letter: string) => `${separator}${letter.toUpperCase()}`,
  );
}

/** Canonical glass name, or null for an empty value. An unknown glass falls back to sentence case. */
export function canonicalGlass(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const trimmed = raw.trim().replace(/\s+/g, " ");
  if (trimmed.length === 0) return null;
  return GLASS_MAP[catalogNameKey(trimmed)] ?? sentenceCase(trimmed);
}

/** True when `canonicalGlass` would fall back to sentence case for this value. */
export function isKnownGlass(raw: string): boolean {
  return catalogNameKey(raw) in GLASS_MAP;
}

/** Canonical ingredient display name: a map exception, else Title Case. */
export function canonicalIngredientName(raw: string): string {
  const trimmed = raw.trim().replace(/\s+/g, " ");
  return INGREDIENT_NAME_MAP[catalogNameKey(trimmed)] ?? titleCase(trimmed);
}
