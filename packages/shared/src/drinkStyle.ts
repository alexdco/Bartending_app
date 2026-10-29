// Drink style families (spec 0043). Mirrors recipes_drink_style_check in
// 20261029120000_recipe_style_tips_allergens.sql; labels live in the apps'
// i18n files under recipe.drinkStyles.<value>, never in the DB.

export const DRINK_STYLES = [
  "sour",
  "highball",
  "spirit_forward",
  "fizz_collins",
  "tiki",
  "flip_cream",
  "punch",
  "shooter",
  "hot",
  "frozen",
  "other",
] as const;

export type DrinkStyle = (typeof DRINK_STYLES)[number];

/** The longest style sentence or tip, in characters (code points), AC-2 and AC-12. */
export const RECIPE_NOTE_MAX_LENGTH = 240;

export function isDrinkStyle(value: unknown): value is DrinkStyle {
  return typeof value === "string" && (DRINK_STYLES as readonly string[]).includes(value);
}

/** Length in code points, matching Postgres char_length. */
export function noteLength(value: string): number {
  return [...value].length;
}

export interface DrinkStyleDisplay {
  /** The family whose label to show; null for `other`, which hides the label. */
  readonly label: DrinkStyle | null;
  readonly note: string | null;
}

/**
 * What the Drink Style section shows (AC-1), or null to hide it: no family
 * hides it; `other` shows only the sentence (hidden without one).
 */
export function drinkStyleDisplay(
  style: DrinkStyle | null,
  note: string | null,
): DrinkStyleDisplay | null {
  if (style === null) {
    return null;
  }

  if (style === "other") {
    return note ? { label: null, note } : null;
  }

  return { label: style, note };
}
