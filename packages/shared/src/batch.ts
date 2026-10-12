// Batch cocktail conversion (spec 0022, amended by spec 0035): scales a
// recipe's parsed ingredient amounts into a large batch quantity, with
// optional scope filtering (alcohol only / except citrus / custom
// selection), a part size for recipes written in parts, and dilution water.
// Pure and side effect free per AGENTS.md: runs entirely client side from
// the already loaded recipe detail data.
// Specs: docs/specs/0022-batch-cocktail-conversion/index.md,
// docs/specs/0035-batch-calculator-correctness/index.md

import { DEFAULT_LOCALE, type Locale } from "./locale";
import { isVolumeUnit, toMl, type RecognizedUnit } from "./units";

export const BATCH_UNITS = ["oz", "ml", "cl", "l"] as const;
export type BatchUnit = (typeof BATCH_UNITS)[number];

export const BATCH_SCOPES = ["everything", "alcohol_only", "except_citrus", "custom"] as const;
export type BatchScope = (typeof BATCH_SCOPES)[number];

export const DILUTION_LEVELS = ["none", "15", "20", "25", "custom"] as const;
export type DilutionLevel = (typeof DILUTION_LEVELS)[number];

export const MIN_SERVINGS = 1;
export const MAX_SERVINGS = 500;
export const MIN_CUSTOM_DILUTION_PERCENT = 0;
export const MAX_CUSTOM_DILUTION_PERCENT = 50;

/** The unit family the "1 part = ..." input is entered in (spec 0035 AC-3). */
export type PartSizeUnit = "oz" | "ml";

export interface PartSize {
  value: number;
  unit: PartSizeUnit;
}

export const DEFAULT_PART_SIZE: Readonly<Record<PartSizeUnit, number>> = { oz: 1, ml: 30 };
export const PART_SIZE_RANGE: Readonly<Record<PartSizeUnit, { min: number; max: number }>> = {
  oz: { min: 0.25, max: 4 },
  ml: { min: 5, max: 120 },
};

const ML_PER_OZ = 29.5735;

export type IngredientCategory = "spirit" | "liqueur" | "citrus" | "other";
const ALCOHOL_CATEGORIES: ReadonlySet<IngredientCategory> = new Set(["spirit", "liqueur"]);

export interface BatchIngredientInput {
  ingredientId: string;
  name: string;
  measure: string | null;
  amountValue: number | null;
  amountUnit: RecognizedUnit | null;
  /** Null when the ingredient has not yet been classified (spec 0022 AC-4, AC-9). */
  category: IngredientCategory | null;
}

/** One servings count validated against spec 0022 AC-2 (a whole number, 1 to 500). */
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

/** A custom dilution percent validated against spec 0035 AC-5 (0 to 50, whole or decimal). */
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

/** A part size validated against spec 0035 AC-3 (0.25 to 4 oz, or 5 to 120 ml, whole or decimal). */
export function validatePartSize(raw: string, unit: PartSizeUnit): number | null {
  const trimmed = raw.trim();
  if (!/^\d+(\.\d+)?$/.test(trimmed)) {
    return null;
  }
  const value = Number(trimmed);
  const { min, max } = PART_SIZE_RANGE[unit];
  if (value < min || value > max) {
    return null;
  }
  return value;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/**
 * Converts a valid part size into the other unit family (spec 0035 AC-3):
 * oz to ml rounds to the nearest whole ml, ml to oz to the nearest quarter
 * oz, then clamps into the new family's range.
 */
export function convertPartSize(value: number, from: PartSizeUnit, to: PartSizeUnit): number {
  if (from === to) {
    return value;
  }
  const { min, max } = PART_SIZE_RANGE[to];
  const converted =
    to === "ml" ? Math.round(value * ML_PER_OZ) : Math.round((value / ML_PER_OZ) * 4) / 4;
  return clamp(converted, min, max);
}

/**
 * The part size input text after its unit family switches (spec 0035 AC-3):
 * a valid value is converted, an invalid one resets to the new family's
 * default.
 */
export function partSizeInputForUnit(input: string, from: PartSizeUnit, to: PartSizeUnit): string {
  if (from === to) {
    return input;
  }
  const current = validatePartSize(input, from);
  return String(current === null ? DEFAULT_PART_SIZE[to] : convertPartSize(current, from, to));
}

/** The part size input's unit family follows the batch unit: oz stays oz, ml/cl/l use ml (spec 0035 AC-3). */
export function partSizeUnitFor(batchUnit: BatchUnit): PartSizeUnit {
  return batchUnit === "oz" ? "oz" : "ml";
}

function partSizeMl(partSize: PartSize): number {
  return partSize.unit === "oz" ? partSize.value * ML_PER_OZ : partSize.value;
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
  /** Present for every rendered line except "unscaled" and "excluded". */
  displayAmount: string | null;
  /** The original measure text, shown verbatim for an "unscaled" line. */
  measure: string | null;
  /** Unrounded ml, used only for total/dilution math; null for unscaled/excluded lines. */
  amountMl: number | null;
}

export interface BatchOptions {
  servings: number;
  scope: BatchScope;
  unit: BatchUnit;
  dilutionLevel: DilutionLevel;
  customDilutionPercent?: number | null;
  /** Ingredient ids checked under the "custom" scope; ignored for other scopes. */
  customSelectedIds?: ReadonlySet<string>;
  /** The "1 part = ..." size; null when the recipe has no part line (spec 0035 AC-3). */
  partSize?: PartSize | null;
  locale?: Locale;
}

export interface BatchResult {
  lines: BatchLine[];
  waterLine: { displayAmount: string; amountMl: number } | null;
  /** A dilution level was chosen but no included line has volume to dilute (spec 0035 AC-5). */
  nothingToDiluteNote: boolean;
  /** Null when nothing is in the batch at all, so a total never displays as 0 (spec 0035 AC-7). */
  totalDisplayAmount: string | null;
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

const BATCH_UNIT_ML: Readonly<Record<BatchUnit, number>> = {
  oz: ML_PER_OZ,
  ml: 1,
  cl: 10,
  l: 1000,
};
const BATCH_UNIT_DECIMALS: Readonly<Record<BatchUnit, number>> = { oz: 1, ml: 1, cl: 1, l: 3 };

/**
 * Rounds an unrounded ml quantity to its display form exactly once (spec 0035
 * AC-6, AC-7): oz, ml, and cl to the nearest tenth, l to the nearest
 * thousandth, trailing zeros trimmed. A nonzero amount that rounds to zero
 * shows as "< 0.1 oz" (or "< 0.001 l"), never as 0.
 */
export function formatBatchAmount(ml: number, unit: BatchUnit): string {
  const decimals = BATCH_UNIT_DECIMALS[unit];
  const factor = 10 ** decimals;
  const rounded = Math.round((ml / BATCH_UNIT_ML[unit]) * factor) / factor;
  if (rounded === 0 && ml > 0) {
    return `< ${(1 / factor).toFixed(decimals)} ${unit}`;
  }
  return `${String(rounded)} ${unit}`;
}

/** The unrounded ml a parsed line contributes to the batch, or null when it can't be scaled. */
function scaledMl(
  amountValue: number,
  amountUnit: RecognizedUnit,
  servings: number,
  partSize: PartSize | null,
): number | null {
  if (isVolumeUnit(amountUnit)) {
    return toMl(amountValue * servings, amountUnit);
  }
  return partSize === null ? null : amountValue * partSizeMl(partSize) * servings;
}

/**
 * Computes a full batch: scales every eligible ingredient (volume lines by
 * servings, part lines by part size and servings), applies scope/selection
 * filtering, optionally adds a dilution water line based on every included
 * scaled line (spec 0035 AC-5), and totals everything, carrying every
 * intermediate value in unrounded milliliters and rounding once at final
 * display (key invariant).
 */
export function computeBatch(
  ingredients: readonly BatchIngredientInput[],
  options: BatchOptions,
): BatchResult {
  const { servings, scope, unit, dilutionLevel, customSelectedIds } = options;
  const customPercent = options.customDilutionPercent ?? null;
  const partSize = options.partSize ?? null;

  const lines: BatchLine[] = ingredients.map((ingredient) => {
    const ml =
      ingredient.amountValue === null || ingredient.amountUnit === null
        ? null
        : scaledMl(ingredient.amountValue, ingredient.amountUnit, servings, partSize);

    if (ml === null) {
      // Always rendered, never scaled, never counted, no checkbox (spec 0035 AC-11).
      return {
        ingredientId: ingredient.ingredientId,
        name: ingredient.name,
        state: "unscaled",
        displayAmount: null,
        measure: ingredient.measure,
        amountMl: null,
      };
    }

    if (!isIncludedByScope(ingredient, scope, customSelectedIds)) {
      return {
        ingredientId: ingredient.ingredientId,
        name: ingredient.name,
        state: "excluded",
        displayAmount: null,
        measure: null,
        amountMl: null,
      };
    }

    const isUncategorized =
      ingredient.category === null && (scope === "alcohol_only" || scope === "except_citrus");

    return {
      ingredientId: ingredient.ingredientId,
      name: ingredient.name,
      state: isUncategorized ? "uncategorized" : "normal",
      displayAmount: formatBatchAmount(ml, unit),
      measure: null,
      amountMl: ml,
    };
  });

  const includedMl = lines.reduce((sum, line) => sum + (line.amountMl ?? 0), 0);
  const waterMl = (includedMl * dilutionPercent(dilutionLevel, customPercent)) / 100;
  const nothingToDiluteNote = dilutionLevel !== "none" && includedMl === 0;
  const waterLine =
    waterMl > 0 ? { displayAmount: formatBatchAmount(waterMl, unit), amountMl: waterMl } : null;
  const totalMl = includedMl + waterMl;

  return {
    lines,
    waterLine,
    nothingToDiluteNote,
    totalDisplayAmount: totalMl > 0 ? formatBatchAmount(totalMl, unit) : null,
  };
}

/** Whether the batch control renders (spec 0035 AC-4): at least one line with a parsed amount, volume or part. */
export function hasConvertibleIngredient(
  ingredients: readonly Pick<BatchIngredientInput, "amountValue" | "amountUnit">[],
): boolean {
  return ingredients.some((i) => i.amountValue !== null && i.amountUnit !== null);
}

/** Whether the single serving oz/ml/cl toggle renders (spec 0035 AC-4): at least one line with a volume unit. */
export function hasVolumeIngredient(
  ingredients: readonly Pick<BatchIngredientInput, "amountValue" | "amountUnit">[],
): boolean {
  return ingredients.some(
    (i) => i.amountValue !== null && i.amountUnit !== null && isVolumeUnit(i.amountUnit),
  );
}

/** Whether the "1 part = ..." input renders (spec 0035 AC-3): at least one part line. */
export function hasPartIngredient(
  ingredients: readonly Pick<BatchIngredientInput, "amountValue" | "amountUnit">[],
): boolean {
  return ingredients.some((i) => i.amountValue !== null && i.amountUnit === "part");
}

/** Batch unit labels, the same text in every locale (spec 0035 AC-6). */
export const BATCH_UNIT_LABELS: Record<BatchUnit, Record<Locale, string>> = {
  oz: { en: "oz", es: "oz" },
  ml: { en: "ml", es: "ml" },
  cl: { en: "cl", es: "cl" },
  l: { en: "l", es: "l" },
};

export function batchUnitLabel(unit: BatchUnit, locale: Locale = DEFAULT_LOCALE): string {
  return BATCH_UNIT_LABELS[unit][locale] ?? BATCH_UNIT_LABELS[unit][DEFAULT_LOCALE];
}
