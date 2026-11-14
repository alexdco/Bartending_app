// "Parts" ratio display for Quick Build Mode (spec
// 0023-bartender-mode/0023-quick-build-mode.md, AC-2, AC-8, amended by spec
// 0035 AC-10): shows each ingredient's amount relative to the smallest
// parseable volume amount in the recipe, instead of an absolute unit. A
// recipe written only in parts shows its stored part counts directly. Pure
// and side effect free per AGENTS.md, mirroring batch.ts's unscaled-line
// handling for ingredients with no parseable amount.

import type { Locale } from "./locale";
import { formatNumber } from "./numberFormat";
import { isCountedUnit, isVolumeUnit, toMl, type RecognizedUnit } from "./units";

const PARTS_ROUNDING_STEP = 0.25;
const MIN_DISPLAYED_PARTS = 0.25;

export type PartsLineState = "normal" | "unscaled";

export interface PartsIngredientInput {
  ingredientId: string;
  name: string;
  measure: string | null;
  amountValue: number | null;
  /** The high end of a range; a range line is never in the ratio (spec 0054 AC-6). */
  amountMaxValue: number | null;
  amountUnit: RecognizedUnit | null;
}

export interface PartsLine {
  ingredientId: string;
  name: string;
  state: PartsLineState;
  /** The parts value; null for an "unscaled" line. */
  parts: number | null;
  /** The ingredient's original measure text, shown verbatim for an "unscaled" line. */
  measure: string | null;
}

function roundToQuarter(value: number): number {
  return Math.round(value / PARTS_ROUNDING_STEP) * PARTS_ROUNDING_STEP;
}

function roundToHundredth(value: number): number {
  return Math.round(value * 100) / 100;
}

function unscaledLine(ingredient: PartsIngredientInput): PartsLine {
  return {
    ingredientId: ingredient.ingredientId,
    name: ingredient.name,
    state: "unscaled",
    parts: null,
    measure: ingredient.measure,
  };
}

function normalLine(ingredient: PartsIngredientInput, parts: number): PartsLine {
  return {
    ingredientId: ingredient.ingredientId,
    name: ingredient.name,
    state: "normal",
    parts,
    measure: ingredient.measure,
  };
}

/**
 * A single parsed amount that is not a counted unit: the only lines a parts
 * ratio can use. Counted lines and ranges show their measure text (spec 0054
 * AC-6).
 */
function isRatioCandidate(ingredient: PartsIngredientInput): boolean {
  return (
    ingredient.amountValue !== null &&
    ingredient.amountMaxValue === null &&
    ingredient.amountUnit !== null &&
    !isCountedUnit(ingredient.amountUnit)
  );
}

/**
 * Computes each ingredient's parts value.
 *
 * When every parsed line is a `part` line, each shows its stored part count
 * directly, rounded to at most two decimals with no quarter rounding (spec
 * 0035 AC-10). Otherwise part lines show their measure text and are left out,
 * and each volume line's ratio is relative to the smallest volume amount
 * (spec 0023 AC-2), rounded to the nearest quarter and clamped to a minimum
 * of 0.25 so it never shows as 0 (AC-8). An ingredient with no parseable
 * amount, a counted one ("2 dashes", "1" Lime), or a range ("2-3 oz") is always an "unscaled"
 * line showing its measure, and is left out of the ratio (spec 0054 AC-6).
 */
export function computeParts(ingredients: readonly PartsIngredientInput[]): PartsLine[] {
  const parsed = ingredients.filter(isRatioCandidate);
  const allParts =
    parsed.length > 0 && parsed.every((ingredient) => ingredient.amountUnit === "part");

  if (allParts) {
    return ingredients.map((ingredient) =>
      isRatioCandidate(ingredient) &&
      ingredient.amountValue !== null &&
      ingredient.amountUnit === "part"
        ? normalLine(ingredient, roundToHundredth(ingredient.amountValue))
        : unscaledLine(ingredient),
    );
  }

  const volumeMl = (ingredient: PartsIngredientInput): number | null =>
    isRatioCandidate(ingredient) &&
    ingredient.amountValue !== null &&
    ingredient.amountUnit !== null &&
    isVolumeUnit(ingredient.amountUnit)
      ? toMl(ingredient.amountValue, ingredient.amountUnit)
      : null;

  const volumes = ingredients.map(volumeMl).filter((ml): ml is number => ml !== null);
  const minMl = volumes.length > 0 ? Math.min(...volumes) : null;

  return ingredients.map((ingredient) => {
    const ml = volumeMl(ingredient);
    if (ml === null || minMl === null) {
      return unscaledLine(ingredient);
    }
    return normalLine(ingredient, Math.max(roundToQuarter(ml / minMl), MIN_DISPLAYED_PARTS));
  });
}

/**
 * Formats a parts value for display, trimming trailing zeros ("1" not "1.0",
 * "0.33" stays "0.33"), with the locale's decimal separator ("1,5" in pt;
 * spec 0055 AC-3).
 */
export function formatParts(value: number, locale: Locale): string {
  return formatNumber(value, locale, 2);
}
