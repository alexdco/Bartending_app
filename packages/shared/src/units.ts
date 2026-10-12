// Ingredient measure parsing and oz/ml/cl conversion (spec 0021). Parsing
// runs once at import time against the canonical English measure text;
// conversion is a pure function run client side on every toggle. Both stay
// side effect free per AGENTS.md's functional/immutable rule.
// Spec: docs/specs/0021-recipe-ingredient-unit-conversion/index.md

import { DEFAULT_LOCALE, type Locale } from "./locale";

/**
 * Units with a fixed volume, convertible to ml (spec 0035 AC-2). Enforced,
 * together with "part", by a DB check constraint on recipe_ingredients.amount_unit.
 */
export const VOLUME_UNITS = [
  "oz",
  "ml",
  "cl",
  "tsp",
  "tbsp",
  "cup",
  "shot",
  "jigger",
  "dl",
  "l",
  "pint",
  "qt",
  "gal",
] as const;
export type VolumeUnit = (typeof VOLUME_UNITS)[number];

/** All units the parser recognizes: every volume unit plus "part", a ratio with no fixed volume (spec 0035 AC-3). */
export const RECOGNIZED_UNITS = [...VOLUME_UNITS, "part"] as const;
export type RecognizedUnit = (typeof RECOGNIZED_UNITS)[number];

/** The original six units the bar recipe form picker offers; bar_recipe_ingredients keeps its own narrower check constraint (spec 0035). */
export const BAR_FORM_UNITS = ["oz", "ml", "cl", "tsp", "tbsp", "cup"] as const;
export type BarFormUnit = (typeof BAR_FORM_UNITS)[number];

/** The three units the recipe detail toggle switches between. */
export const CONVERTIBLE_UNITS = ["oz", "ml", "cl"] as const;
export type ConvertibleUnit = (typeof CONVERTIBLE_UNITS)[number];

export interface ParsedMeasure {
  value: number;
  unit: RecognizedUnit;
}

export function isVolumeUnit(unit: RecognizedUnit): unit is VolumeUnit {
  return unit !== "part";
}

/**
 * Runtime guard for a stored amount_unit read from the database (spec 0035
 * AC-12): anything this client doesn't know becomes null, so the line is
 * treated as unparsed instead of producing NaN.
 */
export function toRecognizedUnit(raw: unknown): RecognizedUnit | null {
  return typeof raw === "string" && (RECOGNIZED_UNITS as readonly string[]).includes(raw)
    ? (raw as RecognizedUnit)
    : null;
}

/** Narrows a stored bar_recipe_ingredients.amount_unit to the bar form's own units; anything else becomes null. */
export function toBarFormUnit(raw: unknown): BarFormUnit | null {
  return typeof raw === "string" && (BAR_FORM_UNITS as readonly string[]).includes(raw)
    ? (raw as BarFormUnit)
    : null;
}

// Whole token spellings (lowercase, one trailing dot already removed). A
// unit must match an entire token, so "1 lime" never reads as liters.
const UNIT_SPELLINGS: ReadonlyMap<string, RecognizedUnit> = new Map(
  Object.entries({
    oz: "oz",
    floz: "oz",
    ounce: "oz",
    ounces: "oz",
    ml: "ml",
    milliliter: "ml",
    milliliters: "ml",
    millilitre: "ml",
    millilitres: "ml",
    cl: "cl",
    centiliter: "cl",
    centiliters: "cl",
    centilitre: "cl",
    centilitres: "cl",
    tsp: "tsp",
    teaspoon: "tsp",
    teaspoons: "tsp",
    tbsp: "tbsp",
    tblsp: "tbsp",
    tablespoon: "tbsp",
    tablespoons: "tbsp",
    cup: "cup",
    cups: "cup",
    shot: "shot",
    shots: "shot",
    jigger: "jigger",
    jiggers: "jigger",
    part: "part",
    parts: "part",
    dl: "dl",
    deciliter: "dl",
    deciliters: "dl",
    decilitre: "dl",
    decilitres: "dl",
    l: "l",
    liter: "l",
    liters: "l",
    litre: "l",
    litres: "l",
    pint: "pint",
    pints: "pint",
    qt: "qt",
    quart: "qt",
    quarts: "qt",
    gal: "gal",
    gallon: "gal",
    gallons: "gal",
  } satisfies Record<string, RecognizedUnit>),
);

function normalizeToken(token: string): string {
  return token.toLowerCase().replace(/\.$/, "");
}

function unitFromToken(token: string): RecognizedUnit | null {
  return UNIT_SPELLINGS.get(normalizeToken(token)) ?? null;
}

/**
 * Reads the unit at the start of the text after the number: the first word,
 * or the two words "fl oz" ("fl. oz"). Returns the unit and whatever text
 * follows it.
 */
function readUnit(text: string): { unit: RecognizedUnit; after: string } | null {
  const tokens = text.split(/\s+/).filter((token) => token.length > 0);
  if (tokens.length === 0) {
    return null;
  }

  if (
    tokens.length >= 2 &&
    normalizeToken(tokens[0]) === "fl" &&
    normalizeToken(tokens[1]) === "oz"
  ) {
    return { unit: "oz", after: tokens.slice(2).join(" ") };
  }

  const unit = unitFromToken(tokens[0]);
  return unit ? { unit, after: tokens.slice(1).join(" ") } : null;
}

// A leading number: an integer/decimal ("2", "1.5"), a mixed fraction with a
// space ("1 1/2"), a bare fraction ("3/4"), or a unicode fraction glyph
// ("1½", or "1 ½" with a space per spec 0035 AC-1). Captured as named
// groups so a mixed fraction's whole and fractional parts can be summed
// separately from a bare fraction.
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
    `|^(?<spacedWhole>\\d+)\\s+(?<spacedGlyph>${GLYPH_ALTERNATION})` + // "1 ½"
    `|^(?<decWithGlyph>\\d+(?:\\.\\d+)?)(?<glyphAfterDecimal>${GLYPH_ALTERNATION})` + // "1½"
    `|^(?<glyphOnly>${GLYPH_ALTERNATION})` + // "½"
    `|^(?<plain>\\d+(?:\\.\\d+)?)`, // plain integer/decimal: "2", "1.5"
);

function parseLeadingNumber(text: string): { value: number; rest: string } | null {
  const trimmed = text.trim();
  const match = NUMBER_PATTERN.exec(trimmed);
  if (!match?.groups) {
    return null;
  }

  const {
    mixedWhole,
    mixedNum,
    mixedDen,
    bareNum,
    bareDen,
    spacedWhole,
    spacedGlyph,
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
  } else if (spacedWhole !== undefined) {
    value = Number(spacedWhole) + UNICODE_FRACTIONS[spacedGlyph];
  } else if (decWithGlyph !== undefined) {
    value = Number(decWithGlyph) + UNICODE_FRACTIONS[glyphAfterDecimal];
  } else if (glyphOnly !== undefined) {
    value = UNICODE_FRACTIONS[glyphOnly];
  } else if (plain !== undefined) {
    value = Number(plain);
  } else {
    return null;
  }

  return { value, rest: trimmed.slice(match[0].length).trim() };
}

// After the unit, a second number introduced by "-", "to", "or", or "/"
// means the measure names the unit twice ("1 oz to 2 oz", "1 oz or 2
// shots"): a range or an alternative, never a single amount (AC-11).
const SECOND_AMOUNT_AFTER_UNIT = new RegExp(
  `^(-|to\\b|or\\b|\\/)\\s*(\\d|${GLYPH_ALTERNATION})`,
  "i",
);

/**
 * Parses a leading number followed by a unit token out of raw measure text
 * (spec 0021 AC-3, spec 0035 AC-1). The unit is the first word after the
 * number (or the two words "fl oz"), matched as a whole token, case
 * insensitive, with one optional trailing dot; any further words are
 * ignored. Returns null for anything else: no number, a range ("1 to 2 oz",
 * "1-2 oz", "1 oz - 2 oz"), a bare number with no unit word, or a counted or
 * non volume word ("Dashes", "sprig", "wedge", "lime", "to taste").
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

  const read = readUnit(leading.rest);
  if (!read || SECOND_AMOUNT_AFTER_UNIT.test(read.after)) {
    return null;
  }

  return { value: leading.value, unit: read.unit };
}

const ML_PER_OZ = 29.5735;
const OZ_PER_ML = 1 / ML_PER_OZ;
const ML_PER_CL = 10;
// A US shot and a jigger are both 1.5 oz (spec 0035 AC-2).
const ML_PER_SHOT = 1.5 * ML_PER_OZ;

/**
 * Converts a value in any volume unit to unrounded milliliters. Exported for
 * the batch math, which carries every intermediate value in unrounded ml. A
 * "part" has no fixed volume and is rejected by the type (spec 0035).
 */
export function toMl(value: number, unit: VolumeUnit): number {
  switch (unit) {
    case "oz":
      return value * ML_PER_OZ;
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
    case "shot":
    case "jigger":
      return value * ML_PER_SHOT;
    case "dl":
      return value * 100;
    case "l":
      return value * 1000;
    case "pint":
      return value * 473.176;
    case "qt":
      return value * 946.353;
    case "gal":
      return value * 3785.41;
  }
}

export function roundToTenth(value: number): number {
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
  sourceUnit: VolumeUnit,
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

/**
 * Converts and formats a stored amount into a toggle unit (number only, no
 * unit label). Null when the line can't convert: unparsed, or a "part" line,
 * which has no fixed volume and shows its measure text instead (spec 0035
 * AC-4, AC-10).
 */
export function formatAmountInUnit(
  amountValue: number | null,
  amountUnit: RecognizedUnit | null,
  targetUnit: ConvertibleUnit,
): string | null {
  if (amountValue === null || amountUnit === null || !isVolumeUnit(amountUnit)) {
    return null;
  }
  return formatConvertedAmount(convertAmount(amountValue, amountUnit, targetUnit), targetUnit);
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
