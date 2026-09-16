// "Parts" ratio display for Quick Build Mode (spec
// 0023-bartender-mode/0023-quick-build-mode.md, AC-2, AC-8): shows each
// ingredient's amount relative to the smallest parseable amount in the
// recipe, instead of an absolute unit. Pure and side effect free per
// AGENTS.md, mirroring batch.ts's unscaled-line handling for ingredients
// with no parseable amount.

import { toMl, type RecognizedUnit } from "./units";

const PARTS_ROUNDING_STEP = 0.25;
const MIN_DISPLAYED_PARTS = 0.25;

export type PartsLineState = "normal" | "unscaled";

export interface PartsIngredientInput {
  ingredientId: string;
  name: string;
  measure: string | null;
  amountValue: number | null;
  amountUnit: RecognizedUnit | null;
}

export interface PartsLine {
  ingredientId: string;
  name: string;
  state: PartsLineState;
  /** The parts ratio, rounded to the nearest quarter and clamped to a minimum of 0.25. Null for an "unscaled" line. */
  parts: number | null;
  /** The ingredient's original measure text, shown verbatim for an "unscaled" line. */
  measure: string | null;
}

function roundToQuarter(value: number): number {
  return Math.round(value / PARTS_ROUNDING_STEP) * PARTS_ROUNDING_STEP;
}

/**
 * Computes each ingredient's parts ratio relative to the smallest parseable
 * amount in the recipe (AC-2). An ingredient with no parseable amount
 * (amountValue or amountUnit null, e.g. "2 dashes") is excluded from the
 * ratio calculation entirely and rendered as an "unscaled" line showing its
 * original measure text (AC-8), never breaking or zeroing the others' ratios.
 * A ratio is never rounded down to 0; it is clamped to a minimum of 0.25 so a
 * very small ingredient relative to a very large one still shows a nonzero
 * part (AC-8).
 */
export function computeParts(ingredients: readonly PartsIngredientInput[]): PartsLine[] {
  const parseable = ingredients.filter(
    (
      ingredient,
    ): ingredient is PartsIngredientInput & { amountValue: number; amountUnit: RecognizedUnit } =>
      ingredient.amountValue !== null && ingredient.amountUnit !== null,
  );

  const minMl =
    parseable.length > 0
      ? Math.min(
          ...parseable.map((ingredient) => toMl(ingredient.amountValue, ingredient.amountUnit)),
        )
      : null;

  return ingredients.map((ingredient) => {
    if (ingredient.amountValue === null || ingredient.amountUnit === null || minMl === null) {
      return {
        ingredientId: ingredient.ingredientId,
        name: ingredient.name,
        state: "unscaled",
        parts: null,
        measure: ingredient.measure,
      };
    }

    const ml = toMl(ingredient.amountValue, ingredient.amountUnit);
    const ratio = Math.max(roundToQuarter(ml / minMl), MIN_DISPLAYED_PARTS);

    return {
      ingredientId: ingredient.ingredientId,
      name: ingredient.name,
      state: "normal",
      parts: ratio,
      measure: ingredient.measure,
    };
  });
}

/** Formats a parts value for display, trimming a trailing ".0" ("1" not "1.0", "1.25" stays "1.25"). */
export function formatParts(value: number): string {
  return String(value);
}
