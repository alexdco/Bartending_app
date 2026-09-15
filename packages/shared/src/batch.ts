// Batch cocktail conversion (spec 0022): scales a recipe's parsed ingredient
// amounts into a large batch quantity, with optional scope filtering
// (alcohol only / except citrus / custom selection) and dilution water. Pure
// and side effect free per AGENTS.md: runs entirely client side from the
// already loaded recipe detail data (AC-8).
// Spec: docs/specs/0022-batch-cocktail-conversion.md

import { DEFAULT_LOCALE, type Locale } from "./locale";
import { roundToTenth, toMl, type RecognizedUnit } from "./units";

export const BATCH_UNITS = ["oz", "ml", "liter"] as const;
export type BatchUnit = (typeof BATCH_UNITS)[number];

export const BATCH_SCOPES = ["everything", "alcohol_only", "except_citrus", "custom"] as const;
export type BatchScope = (typeof BATCH_SCOPES)[number];

export const DILUTION_LEVELS = ["none", "15", "20", "25", "custom"] as const;
export type DilutionLevel = (typeof DILUTION_LEVELS)[number];

export const MIN_SERVINGS = 1;
export const MAX_SERVINGS = 500;
export const MIN_CUSTOM_DILUTION_PERCENT = 0;
export const MAX_CUSTOM_DILUTION_PERCENT = 50;

export type IngredientCategory = "spirit" | "liqueur" | "citrus" | "other";
const ALCOHOL_CATEGORIES: ReadonlySet<IngredientCategory> = new Set(["spirit", "liqueur"]);

export interface BatchIngredientInput {
  ingredientId: string;
  name: string;
  measure: string | null;
  amountValue: number | null;
  amountUnit: RecognizedUnit | null;
  /** Null when the ingredient has not yet been classified (AC-4, AC-9). */
  category: IngredientCategory | null;
}

/** One servings count validated against AC-2 (a whole number, 1 to 500). */
export function validateServings(raw: string): number | null {
  if (!/^\d+$/.test(raw.trim())) {
    return null;
  }
  const value = Number(raw);
  if (value < MIN_SERVINGS || value > MAX_SERVINGS) {
    return null;
  }
  return value;
}

/** A custom dilution percent validated against AC-6 (0 to 50, whole or decimal). */
export function validateCustomDilutionPercent(raw: string): number | null {
  const trimmed = raw.trim();
  if (!/^\d+(\.\d+)?$/.test(trimmed)) {
    return null;
  }
  const value = Number(trimmed);
  if (value < MIN_CUSTOM_DILUTION_PERCENT || value > MAX_CUSTOM_DILUTION_PERCENT) {
    return null;
  }
  return value;
}

function dilutionPercent(level: DilutionLevel, customPercent: number | null): number {
  switch (level) {
    case "none":
      return 0;
    case "15":
      return 15;
    case "20":
      return 20;
    case "25":
      return 25;
    case "custom":
      return customPercent ?? 0;
  }
}

export type BatchLineState = "normal" | "unscaled" | "uncategorized" | "excluded";

export interface BatchLine {
  ingredientId: string;
  name: string;
  state: BatchLineState;
  /** Present for every rendered line except "excluded" (AC-3, AC-4, AC-5). */
  displayAmount: string | null;
  /** The original measure text, shown verbatim for an "unscaled" line (AC-3). */
  measure: string | null;
  /** Unrounded ml, used only for totals/dilution math; null for unscaled/excluded lines. */
  amountMl: number | null;
  isAlcohol: boolean;
}

export interface BatchOptions {
  servings: number;
  scope: BatchScope;
  unit: BatchUnit;
  dilutionLevel: DilutionLevel;
  customDilutionPercent?: number | null;
  /** Ingredient ids checked under the "custom" scope; ignored for other scopes (AC-5). */
  customSelectedIds?: ReadonlySet<string>;
  locale?: Locale;
}

export interface BatchResult {
  lines: BatchLine[];
  waterLine: { displayAmount: string; amountMl: number } | null;
  noAlcoholNote: boolean;
  totalDisplayAmount: string;
}

function isIncludedByScope(
  ingredient: BatchIngredientInput,
  scope: BatchScope,
  customSelectedIds: ReadonlySet<string> | undefined,
): boolean {
  switch (scope) {
    case "everything":
      return true;
    case "alcohol_only":
      return ingredient.category === null || ALCOHOL_CATEGORIES.has(ingredient.category);
    case "except_citrus":
      return ingredient.category !== "citrus";
    case "custom":
      return customSelectedIds?.has(ingredient.ingredientId) ?? true;
  }
}

/** Rounds an unrounded ml quantity to its final display form exactly once, per AC-2's batch specific rules. */
export function formatBatchAmount(ml: number, unit: BatchUnit): string {
  switch (unit) {
    case "oz":
      return `${formatDecimalTenth(ml * OZ_PER_ML_BATCH)} oz`;
    case "ml":
      return `${formatDecimalTenth(roundToTenth(ml))} ml`;
    case "liter":
      return `${formatLiter(ml)} l`;
  }
}

// Duplicated from units.ts's private OZ_PER_ML constant: batch amounts are
// always a decimal (formatOunces renders a fraction instead, which spec
// 0022's Rationale rejects as spurious precision at batch scale, e.g.
// "312 3/8 oz").
const OZ_PER_ML_BATCH = 1 / 29.5735;

function formatDecimalTenth(value: number): string {
  const rounded = roundToTenth(value);
  return String(rounded);
}

function formatLiter(ml: number): string {
  const liters = Math.round((ml / 1000) * 100) / 100;
  return String(liters);
}

/**
 * Computes a full batch (AC-2 through AC-7): scales every eligible
 * ingredient, applies scope/selection filtering, optionally adds a dilution
 * water line, and totals everything, carrying every intermediate value in
 * unrounded milliliters and rounding once at final display (key invariant).
 */
export function computeBatch(
  ingredients: readonly BatchIngredientInput[],
  options: BatchOptions,
): BatchResult {
  const { servings, scope, unit, dilutionLevel, customSelectedIds } = options;
  const customPercent = options.customDilutionPercent ?? null;

  const lines: BatchLine[] = [];
  let totalMl = 0;
  let alcoholBaseMl = 0;

  for (const ingredient of ingredients) {
    const unparsed = ingredient.amountValue === null || ingredient.amountUnit === null;

    if (unparsed) {
      // Always rendered, never scaled, never counted, no checkbox (AC-3).
      lines.push({
        ingredientId: ingredient.ingredientId,
        name: ingredient.name,
        state: "unscaled",
        displayAmount: null,
        measure: ingredient.measure,
        amountMl: null,
        isAlcohol: false,
      });
      continue;
    }

    const included = isIncludedByScope(ingredient, scope, customSelectedIds);
    if (!included) {
      lines.push({
        ingredientId: ingredient.ingredientId,
        name: ingredient.name,
        state: "excluded",
        displayAmount: null,
        measure: null,
        amountMl: null,
        isAlcohol: false,
      });
      continue;
    }

    const sourceValue = ingredient.amountValue! * servings;
    const ml = toMl(sourceValue, ingredient.amountUnit!);
    const isAlcohol = ingredient.category !== null && ALCOHOL_CATEGORIES.has(ingredient.category);
    const isUncategorized =
      ingredient.category === null && (scope === "alcohol_only" || scope === "except_citrus");

    totalMl += ml;
    if (isAlcohol) {
      alcoholBaseMl += ml;
    }

    lines.push({
      ingredientId: ingredient.ingredientId,
      name: ingredient.name,
      state: isUncategorized ? "uncategorized" : "normal",
      displayAmount: formatBatchAmount(ml, unit),
      measure: null,
      amountMl: ml,
      isAlcohol,
    });
  }

  const percent = dilutionPercent(dilutionLevel, customPercent);
  let waterLine: BatchResult["waterLine"] = null;
  let noAlcoholNote = false;

  if (dilutionLevel !== "none") {
    if (alcoholBaseMl > 0) {
      const waterMl = (alcoholBaseMl * percent) / 100;
      totalMl += waterMl;
      waterLine = { displayAmount: formatBatchAmount(waterMl, unit), amountMl: waterMl };
    } else {
      noAlcoholNote = true;
    }
  }

  return {
    lines,
    waterLine,
    noAlcoholNote,
    totalDisplayAmount: formatBatchAmount(totalMl, unit),
  };
}

/** Whether the batch control should render at all (AC-1): at least one convertible ingredient. */
export function hasConvertibleIngredient(ingredients: readonly BatchIngredientInput[]): boolean {
  return ingredients.some((i) => i.amountValue !== null && i.amountUnit !== null);
}

export const BATCH_UNIT_LABELS: Record<BatchUnit, Record<Locale, string>> = {
  oz: { en: "oz", es: "oz" },
  ml: { en: "ml", es: "ml" },
  liter: { en: "liter", es: "litro" },
};

export function batchUnitLabel(unit: BatchUnit, locale: Locale = DEFAULT_LOCALE): string {
  return BATCH_UNIT_LABELS[unit][locale] ?? BATCH_UNIT_LABELS[unit][DEFAULT_LOCALE];
}
