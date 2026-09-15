// Ingredient measure parsing and oz/ml/cl conversion (spec 0021). Parsing
// runs once at import time against the canonical English measure text;
// conversion is a pure function run client side on every toggle. Both stay
// side effect free per AGENTS.md's functional/immutable rule.
// Spec: docs/specs/0021-recipe-ingredient-unit-conversion/index.md

import { DEFAULT_LOCALE, type Locale } from "./locale";

/** All units the parser recognizes. Enforced by a DB check constraint on recipe_ingredients.amount_unit. */
export const RECOGNIZED_UNITS = ["oz", "ml", "cl", "tsp", "tbsp", "cup"] as const;
export type RecognizedUnit = (typeof RECOGNIZED_UNITS)[number];

/** The three units the recipe detail toggle switches between. */
export const CONVERTIBLE_UNITS = ["oz", "ml", "cl"] as const;
export type ConvertibleUnit = (typeof CONVERTIBLE_UNITS)[number];

export interface ParsedMeasure {
  value: number;
  unit: RecognizedUnit;
}

const UNIT_SPELLINGS: Record<RecognizedUnit, RegExp> = {
  oz: /^(fl\s*oz|oz\.?|ounces?)$/i,
  ml: /^(ml|milli ?liters?|milli ?litres?)$/i,
  cl: /^(cl|centi ?liters?|centi ?litres?)$/i,
  tsp: /^(tsp\.?|teaspoons?)$/i,
  tbsp: /^(tbsp\.?|tablespoons?)$/i,
  cup: /^(cups?)$/i,
};

function unitFromSpelling(spelling: string): RecognizedUnit | null {
  const normalized = spelling.trim().toLowerCase();
  for (const unit of RECOGNIZED_UNITS) {
    if (UNIT_SPELLINGS[unit].test(normalized)) {
      return unit;
    }
  }
  return null;
}

// A leading number: an integer/decimal ("2", "1.5"), a mixed fraction with a
// space ("1 1/2"), a bare fraction ("3/4"), or a unicode fraction glyph
// ("1½"). Captured as three groups so a mixed fraction's whole and
// fractional parts can be summed separately from a bare fraction.
const UNICODE_FRACTIONS: Record<string, number> = {
  "½": 1 / 2,
  "¼": 1 / 4,
  "¾": 3 / 4,
  "⅓": 1 / 3,
  "⅔": 2 / 3,
  "⅕": 1 / 5,
  "⅛": 1 / 8,
  "⅜": 3 / 8,
  "⅝": 5 / 8,
  "⅞": 7 / 8,
};

const GLYPH_ALTERNATION = Object.keys(UNICODE_FRACTIONS).join("|");

const NUMBER_PATTERN = new RegExp(
  `^(?<mixedWhole>\\d+)\\s+(?<mixedNum>\\d+)\\/(?<mixedDen>\\d+)` + // mixed fraction: "1 1/2"
    `|^(?<bareNum>\\d+)\\/(?<bareDen>\\d+)` + // bare fraction: "3/4"
    `|^(?<decWithGlyph>\\d+(?:\\.\\d+)?)(?<glyphAfterDecimal>${GLYPH_ALTERNATION})` + // "1½"
    `|^(?<glyphOnly>${GLYPH_ALTERNATION})` + // "½"
    `|^(?<plain>\\d+(?:\\.\\d+)?)`, // plain integer/decimal: "2", "1.5"
);

function parseLeadingNumber(text: string): { value: number; rest: string } | null {
  const match = NUMBER_PATTERN.exec(text.trim());
  if (!match?.groups) {
    return null;
  }

  const {
    mixedWhole,
    mixedNum,
    mixedDen,
    bareNum,
    bareDen,
    decWithGlyph,
    glyphAfterDecimal,
    glyphOnly,
    plain,
  } = match.groups;

  let value: number;
  if (mixedWhole !== undefined) {
    value = Number(mixedWhole) + Number(mixedNum) / Number(mixedDen);
  } else if (bareNum !== undefined) {
    value = Number(bareNum) / Number(bareDen);
  } else if (decWithGlyph !== undefined) {
    value = Number(decWithGlyph) + UNICODE_FRACTIONS[glyphAfterDecimal];
  } else if (glyphOnly !== undefined) {
    value = UNICODE_FRACTIONS[glyphOnly];
  } else if (plain !== undefined) {
    value = Number(plain);
  } else {
    return null;
  }

  return { value, rest: text.slice(match[0].length).trim() };
}

/**
 * Parses a single leading number followed by a recognized unit out of raw
 * measure text (AC-3, AC-5). Returns null for anything else: no number, a
 * range ("1 to 2 oz", "1-2 oz"), a bare number with no unit word, or a non
 * volume unit ("Dashes", "sprig", "wedge", "a splash", "to taste").
 */
export function parseMeasure(measure: string | null | undefined): ParsedMeasure | null {
  if (!measure) {
    return null;
  }

  const leading = parseLeadingNumber(measure);
  if (!leading || leading.rest.length === 0) {
    return null;
  }

  // A range never parses: "1 to 2 oz", "1-2 oz" leave a second number
  // (or a dash straight into one) in `rest` before the unit word.
  if (/^-/.test(leading.rest) || /^(to|-)\s*\d/i.test(leading.rest)) {
    return null;
  }

  const unit = unitFromSpelling(leading.rest);
  if (!unit) {
    return null;
  }

  return { value: leading.value, unit };
}

const OZ_PER_ML = 1 / 29.5735;
const ML_PER_CL = 10;

function toMl(value: number, unit: RecognizedUnit): number {
  switch (unit) {
    case "oz":
      return value / OZ_PER_ML;
    case "ml":
      return value;
    case "cl":
      return value * ML_PER_CL;
    case "tsp":
      return value * 4.92892;
    case "tbsp":
      return value * 14.7868;
    case "cup":
      return value * 236.588;
  }
}

function roundToTenth(value: number): number {
  return Math.round(value * 10) / 10;
}

/**
 * Converts a stored amount + source unit into a target display unit
 * (AC-2, AC-7). Always converts from the stored source value, never from a
 * previously displayed, already rounded number. ml/cl round to the nearest
 * tenth; oz is left unrounded here, formatOunces handles its display form.
 */
export function convertAmount(
  value: number,
  sourceUnit: RecognizedUnit,
  targetUnit: ConvertibleUnit,
): number {
  const ml = toMl(value, sourceUnit);

  switch (targetUnit) {
    case "ml":
      return roundToTenth(ml);
    case "cl":
      return roundToTenth(ml / ML_PER_CL);
    case "oz":
      return ml * OZ_PER_ML;
  }
}

/** Trims a trailing ".0" for display (44.0 -> "44", 44.4 stays "44.4"). */
export function formatDecimal(value: number): string {
  return String(value);
}

/**
 * Formats an oz amount as a mixed number rounded to the nearest eighth
 * ("1 1/2", not "1.5"; "2", not "2 0/8"). Used only when displaying a non oz
 * sourced amount converted into oz; an oz sourced line renders its original
 * `measure` text verbatim instead (never re derived from this).
 */
export function formatOunces(value: number): string {
  const eighths = Math.round(value * 8);
  const whole = Math.floor(eighths / 8);
  const remainder = eighths % 8;

  if (remainder === 0) {
    return String(whole);
  }

  const divisor = gcd(remainder, 8);
  const fractionNumerator = remainder / divisor;
  const fractionDenominator = 8 / divisor;
  const fraction = `${fractionNumerator}/${fractionDenominator}`;

  return whole === 0 ? fraction : `${whole} ${fraction}`;
}

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}

/**
 * Formats a converted amount for display in the given target unit: ml/cl as
 * a decimal rounded to the nearest tenth, oz as a fraction via formatOunces
 * (AC-2).
 */
export function formatConvertedAmount(value: number, targetUnit: ConvertibleUnit): string {
  if (targetUnit === "oz") {
    return formatOunces(value);
  }
  return formatDecimal(roundToTenth(value));
}

/** Per locale unit word labels (not machine translated), mirroring locale.ts's Record<Locale, ...> lookup idiom. */
export const UNIT_LABELS: Record<ConvertibleUnit, Record<Locale, string>> = {
  oz: { en: "oz", es: "oz" },
  ml: { en: "ml", es: "ml" },
  cl: { en: "cl", es: "cl" },
};

export function unitLabel(unit: ConvertibleUnit, locale: Locale = DEFAULT_LOCALE): string {
  return UNIT_LABELS[unit][locale] ?? UNIT_LABELS[unit][DEFAULT_LOCALE];
}
