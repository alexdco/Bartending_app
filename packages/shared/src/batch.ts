// Batch cocktail conversion (spec 0022, amended by specs 0035 and 0054):
// scales a recipe's parsed ingredient amounts into a large batch quantity,
// with optional scope filtering (alcohol only / except citrus / custom
// selection), a part size for recipes written in parts, counted lines
// (dashes, splashes, drops, plain counts), and dilution water.
// Pure and side effect free per AGENTS.md: runs entirely client side from
// the already loaded recipe detail data.
// Specs: docs/specs/0022-batch-cocktail-conversion/index.md,
// docs/specs/0035-batch-calculator-correctness/index.md,
// docs/specs/0054-batch-calculator-v2/index.md

import { DEFAULT_LOCALE, type Locale } from "./locale";
import type { RecipeMethod } from "./recipes";
import {
  COUNTED_UNIT_ML,
  isCountedUnit,
  isVolumeUnit,
  toMl,
  type CountedUnit,
  type RecognizedUnit,
  validAmountMax,
} from "./units";

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
  /** The high end of a range (spec 0054 AC-5); trusted only when above amountValue, else a single amount. */
  amountMaxValue: number | null;
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

/**
 * Line states (spec 0054 line state matrix). "counted" is a drop or a plain
 * count ("each") on a non alcohol line: rendered and scaled as a count, with
 * no volume. Dash and splash lines are "normal": a count plus a volume.
 */
export type BatchLineState = "normal" | "counted" | "unscaled" | "uncategorized" | "excluded";

/**
 * A scaled count, already rounded for display (spec 0054 AC-4). A range
 * carries its rounded high end in maxValue; maxValue is null for a single
 * count, and also when both ends round to the same count, so one value
 * shows (AC-5). The plural word follows the high end (maxValue ?? value).
 */
export interface BatchCount {
  value: number;
  maxValue: number | null;
  unit: CountedUnit;
}

export interface BatchLine {
  ingredientId: string;
  name: string;
  state: BatchLineState;
  /** The batch amount of a rendered volume or part line, a range string for a range; null for count lines, unscaled, and excluded. */
  displayAmount: string | null;
  /**
   * The scaled count of a rendered counted line (dash, splash, drop, each).
   * The panel renders it with its plural word from the message catalog; an
   * "each" count shows as the number alone.
   */
  count: BatchCount | null;
  /** The "≈" volume of a dash or splash line, in the batch unit, once its (high end) volume reaches 1/4 oz; else null. */
  approxAmount: string | null;
  /** The original measure text, shown verbatim for an "unscaled" line. */
  measure: string | null;
  /** Unrounded ml (the low end of a range), used only for total/dilution math; null for lines without volume, unscaled, or excluded. */
  amountMl: number | null;
  /** Unrounded ml at the high end of a range; null for a single amount and for lines without volume (spec 0054). */
  amountMlMax: number | null;
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
  /** amountMl is the low end; amountMlMax is set only when a range makes the two ends differ. */
  waterLine: { displayAmount: string; amountMl: number; amountMlMax: number | null } | null;
  /** A dilution level was chosen but no included line has volume to dilute (spec 0035 AC-5); with ranges, judged at the high end. */
  nothingToDiluteNote: boolean;
  /** Null when nothing is in the batch at all, so a total never displays as 0 (spec 0035 AC-7); a range string when a range line is included. */
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

/**
 * Formats a batch range (spec 0054 AC-5): each end is rounded and floored on
 * its own through formatBatchAmount; when the two strings match one value
 * shows ("2 oz"), otherwise "<low>–<high> <unit>" with an en dash, no
 * spaces, and the unit once ("20–30 oz", "< 0.1–2 oz").
 */
export function formatBatchRange(lowMl: number, highMl: number, unit: BatchUnit): string {
  const low = formatBatchAmount(lowMl, unit);
  const high = formatBatchAmount(highMl, unit);
  if (low === high) {
    return low;
  }
  return `${low.slice(0, -(unit.length + 1))}–${high}`;
}

/** formatBatchRange with a null high end meaning a single amount. */
function formatBatchAmountOrRange(lowMl: number, highMl: number | null, unit: BatchUnit): string {
  return highMl === null ? formatBatchAmount(lowMl, unit) : formatBatchRange(lowMl, highMl, unit);
}

// The volume hint threshold, 1/4 oz (one splash), compared with a tolerance
// so exactly one splash qualifies (spec 0054 AC-4).
const APPROX_HINT_MIN_ML = COUNTED_UNIT_ML.splash;
const APPROX_HINT_TOLERANCE_ML = 1e-9;

/**
 * Rounds a scaled count for display only (spec 0054 AC-4): dash, splash, and
 * drop to the nearest whole number, never below 1; "each" to the nearest
 * half (ties up), never below 0.5. Volumes always use the unrounded count.
 */
export function roundBatchCount(value: number, unit: CountedUnit): number {
  return unit === "each"
    ? Math.max(0.5, Math.round(value * 2) / 2)
    : Math.max(1, Math.round(value));
}

/**
 * Builds a display count, single or range (spec 0054 AC-5): each end is
 * rounded on its own, and a range whose two ends round alike shows once.
 */
export function batchCount(
  unroundedLow: number,
  unroundedHigh: number | null,
  unit: CountedUnit,
): BatchCount {
  const value = roundBatchCount(unroundedLow, unit);
  const high = unroundedHigh === null ? null : roundBatchCount(unroundedHigh, unit);
  return { value, maxValue: high === null || high === value ? null : high, unit };
}

/** A count's number text: "50", or a range "2–3" with an en dash and no spaces (spec 0054 AC-5). */
export function batchCountText(count: BatchCount): string {
  return count.maxValue === null
    ? String(count.value)
    : `${String(count.value)}–${String(count.maxValue)}`;
}

/** The count that picks a count's plural word: the high end of a range (spec 0054 AC-5). */
export function batchCountPluralValue(count: BatchCount): number {
  return count.maxValue ?? count.value;
}

/**
 * A plain count on a spirit, liqueur, or unclassified line means a share of
 * a layered shot glass ("1/3" Baileys), not a number of items, so it stays
 * unscaled (spec 0054 AC-4).
 */
function isShooterShare(
  ingredient: Pick<BatchIngredientInput, "amountUnit" | "category">,
): boolean {
  return (
    ingredient.amountUnit === "each" &&
    (ingredient.category === null || ALCOHOL_CATEGORIES.has(ingredient.category))
  );
}

/**
 * How a parsed line scales: an unrounded volume (low and, for a range, high
 * end), a count, or both; null when it can't be scaled.
 */
interface Scaled {
  ml: number | null;
  mlMax: number | null;
  count: BatchCount | null;
}

function scaleLine(
  ingredient: BatchIngredientInput,
  servings: number,
  partSize: PartSize | null,
): Scaled | null {
  const { amountValue, amountUnit } = ingredient;
  if (amountValue === null || amountUnit === null || isShooterShare(ingredient)) {
    return null;
  }
  const amountMax = validAmountMax(amountValue, ingredient.amountMaxValue);

  // Scales one end by the unit's rule (spec 0035 for volume and part, spec
  // 0054 AC-4 for counted units); the same rule runs on both range ends.
  let mlPerUnit: number | null;
  if (isVolumeUnit(amountUnit)) {
    mlPerUnit = toMl(1, amountUnit);
  } else if (amountUnit === "part") {
    if (partSize === null) {
      return null;
    }
    mlPerUnit = partSizeMl(partSize);
  } else {
    mlPerUnit =
      amountUnit === "dash" || amountUnit === "splash" ? COUNTED_UNIT_ML[amountUnit] : null;
  }

  const low = amountValue * servings;
  const high = amountMax === null ? null : amountMax * servings;
  return {
    ml: mlPerUnit === null ? null : low * mlPerUnit,
    mlMax: mlPerUnit === null || high === null ? null : high * mlPerUnit,
    count: isCountedUnit(amountUnit) ? batchCount(low, high, amountUnit) : null,
  };
}

function approxAmountFor(scaled: Scaled, unit: BatchUnit): string | null {
  const { ml, mlMax, count } = scaled;
  const highMl = mlMax ?? ml;
  return count !== null &&
    ml !== null &&
    highMl !== null &&
    highMl + APPROX_HINT_TOLERANCE_ML >= APPROX_HINT_MIN_ML
    ? formatBatchAmountOrRange(ml, mlMax, unit)
    : null;
}

/**
 * Computes a full batch: scales every eligible ingredient (volume lines by
 * servings, part lines by part size and servings, counted lines as a count
 * plus, for dashes and splashes, a volume), applies scope/selection
 * filtering, optionally adds a dilution water line based on every included
 * line with volume (spec 0035 AC-5), and totals everything, carrying every
 * intermediate value in unrounded milliliters and rounding once at final
 * display (key invariant). A range line scales both ends, and the water
 * line and total are summed once over the low ends and once over the high
 * ends (spec 0054 AC-5); with no range line the result is a single value.
 */
export function computeBatch(
  ingredients: readonly BatchIngredientInput[],
  options: BatchOptions,
): BatchResult {
  const { servings, scope, unit, dilutionLevel, customSelectedIds } = options;
  const customPercent = options.customDilutionPercent ?? null;
  const partSize = options.partSize ?? null;

  const lines: BatchLine[] = ingredients.map((ingredient) => {
    const base = {
      ingredientId: ingredient.ingredientId,
      name: ingredient.name,
      displayAmount: null,
      count: null,
      approxAmount: null,
      measure: null,
      amountMl: null,
      amountMlMax: null,
    };
    const scaled = scaleLine(ingredient, servings, partSize);

    if (scaled === null) {
      // Always rendered, never scaled, never counted, no checkbox (spec 0035 AC-11).
      return { ...base, state: "unscaled", measure: ingredient.measure };
    }

    if (!isIncludedByScope(ingredient, scope, customSelectedIds)) {
      return { ...base, state: "excluded" };
    }

    const isUncategorized =
      ingredient.category === null && (scope === "alcohol_only" || scope === "except_citrus");
    const { ml, mlMax, count } = scaled;

    return {
      ...base,
      state: isUncategorized ? "uncategorized" : ml === null ? "counted" : "normal",
      displayAmount:
        count === null && ml !== null ? formatBatchAmountOrRange(ml, mlMax, unit) : null,
      count,
      approxAmount: approxAmountFor(scaled, unit),
      amountMl: ml,
      amountMlMax: mlMax,
    };
  });

  const hasRange = lines.some((line) => line.amountMlMax !== null);
  const lowMl = lines.reduce((sum, line) => sum + (line.amountMl ?? 0), 0);
  const highMl = lines.reduce((sum, line) => sum + (line.amountMlMax ?? line.amountMl ?? 0), 0);
  const percent = dilutionPercent(dilutionLevel, customPercent);
  const waterLowMl = (lowMl * percent) / 100;
  const waterHighMl = (highMl * percent) / 100;
  const rangeEnd = (high: number) => (hasRange ? high : null);

  const nothingToDiluteNote = dilutionLevel !== "none" && highMl === 0;
  const waterLine =
    waterHighMl > 0
      ? {
          displayAmount: formatBatchAmountOrRange(waterLowMl, rangeEnd(waterHighMl), unit),
          amountMl: waterLowMl,
          amountMlMax: rangeEnd(waterHighMl),
        }
      : null;
  const totalLowMl = lowMl + waterLowMl;
  const totalHighMl = highMl + waterHighMl;

  return {
    lines,
    waterLine,
    nothingToDiluteNote,
    totalDisplayAmount:
      totalHighMl > 0 ? formatBatchAmountOrRange(totalLowMl, rangeEnd(totalHighMl), unit) : null,
  };
}

/**
 * Whether a line can take part in a batch at all, so it gets a Custom
 * selection checkbox: a parsed amount that is not a shooter share (spec 0054
 * AC-4). Unscaled lines get no checkbox (spec 0035 AC-11).
 */
export function isBatchableIngredient(
  ingredient: Pick<BatchIngredientInput, "amountValue" | "amountUnit" | "category">,
): boolean {
  return (
    ingredient.amountValue !== null && ingredient.amountUnit !== null && !isShooterShare(ingredient)
  );
}

/**
 * Whether the batch control renders (spec 0054 AC-7): at least one line adds
 * volume at 1 serving under the Everything scope, a volume, part, dash, or
 * splash line. Drops and plain counts alone (or a layered shooter of spirit
 * and liqueur shares) show no batch control.
 */
export function hasScalableIngredient(
  ingredients: readonly Pick<BatchIngredientInput, "amountValue" | "amountUnit" | "category">[],
): boolean {
  return ingredients.some(
    (i) => isBatchableIngredient(i) && i.amountUnit !== "drop" && i.amountUnit !== "each",
  );
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

/**
 * Batch unit labels (spec 0035 AC-6): the same Latin text in every locale
 * except Russian, which writes them in Cyrillic (spec 0047 AC-13), and
 * Hindi, which writes them in Devanagari with no dots (spec 0048 AC-13).
 * Japanese writes oz as オンス and the litre as a capital L, as Japanese
 * packaging does (spec 0050 AC-14). Korean writes oz as 온스 and the litre as
 * a capital L too (spec 0051 AC-13), and Simplified Chinese writes oz as 盎司
 * with a capital L (spec 0052 AC-13).
 */
export const BATCH_UNIT_LABELS: Record<BatchUnit, Record<Locale, string>> = {
  oz: {
    en: "oz",
    es: "oz",
    pt: "oz",
    fr: "oz",
    ru: "унц.",
    hi: "औंस",
    ja: "オンス",
    ko: "온스",
    zh: "盎司",
  },
  ml: {
    en: "ml",
    es: "ml",
    pt: "ml",
    fr: "ml",
    ru: "мл",
    hi: "मिली",
    ja: "ml",
    ko: "ml",
    zh: "ml",
  },
  cl: {
    en: "cl",
    es: "cl",
    pt: "cl",
    fr: "cl",
    ru: "сл",
    hi: "सेली",
    ja: "cl",
    ko: "cl",
    zh: "cl",
  },
  l: { en: "l", es: "l", pt: "l", fr: "l", ru: "л", hi: "ली", ja: "L", ko: "L", zh: "L" },
};

export function batchUnitLabel(unit: BatchUnit, locale: Locale = DEFAULT_LOCALE): string {
  return BATCH_UNIT_LABELS[unit][locale] ?? BATCH_UNIT_LABELS[unit][DEFAULT_LOCALE];
}

// ---------------------------------------------------------------------------
// Method dilution defaults (spec 0054 AC-10)
// ---------------------------------------------------------------------------

/** The dilution a batch starts at for each method: stirred 20%, shaken 25%, everything else none. */
export function defaultDilutionFor(method: RecipeMethod | null): DilutionLevel {
  switch (method) {
    case "stir":
      return "20";
    case "shake":
      return "25";
    case "build":
    case "blend":
    case "layer":
    case null:
      return "none";
  }
}

/** The methods whose default gets a hint below the dilution control. */
export type DilutionHintMethod = Extract<RecipeMethod, "stir" | "shake" | "build" | "blend">;

/**
 * The batch panel's dilution state: the level, whether the bartender has
 * picked one, and the recipe (by id) whose default it started from.
 */
export interface DilutionState {
  readonly recipeId: string;
  readonly method: RecipeMethod | null;
  readonly level: DilutionLevel;
  readonly picked: boolean;
}

/** A recipe's panel opens at its method's default, not yet picked. */
export function initialDilutionState(recipeId: string, method: RecipeMethod | null): DilutionState {
  return { recipeId, method, level: defaultDilutionFor(method), picked: false };
}

/** Any pick, even the default level itself, marks the level picked and hides the hint. */
export function pickDilution(state: DilutionState, level: DilutionLevel): DilutionState {
  return { ...state, level, picked: true };
}

/**
 * Resets to the new recipe's default only when the recipe id changes. A
 * refetch of the same recipe (a locale switch, a background refresh, even
 * a changed method) keeps the level and the picked flag. Returns the same
 * object when nothing changes, so a caller can compare by reference.
 */
export function syncDilutionState(
  state: DilutionState,
  recipeId: string,
  method: RecipeMethod | null,
): DilutionState {
  return state.recipeId === recipeId ? state : initialDilutionState(recipeId, method);
}

/** The method whose hint shows, or null: only while the level is still the untouched default. */
export function dilutionHintMethod(state: DilutionState): DilutionHintMethod | null {
  if (state.picked) {
    return null;
  }
  switch (state.method) {
    case "stir":
    case "shake":
    case "build":
    case "blend":
      return state.method;
    case "layer":
    case null:
      return null;
  }
}
