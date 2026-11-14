// Ingredient measure parsing and oz/ml/cl conversion (spec 0021). Parsing
// runs once at import time against the canonical English measure text;
// conversion is a pure function run client side on every toggle. Both stay
// side effect free per AGENTS.md's functional/immutable rule.
// Spec: docs/specs/0021-recipe-ingredient-unit-conversion/index.md

import { DEFAULT_LOCALE, type Locale } from "./locale";
import { formatNumber, parseDecimalInput } from "./numberFormat";

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

/**
 * Units that count rather than measure (spec 0054 AC-1): dash, splash, drop,
 * and "each", a bare number with no unit word ("1" Lime). Dash and splash
 * also carry a conventional volume (COUNTED_UNIT_ML); drop and each do not.
 */
export const COUNTED_UNITS = ["dash", "splash", "drop", "each"] as const;
export type CountedUnit = (typeof COUNTED_UNITS)[number];

/**
 * All units the parser recognizes: every volume unit, "part" (a ratio with
 * no fixed volume, spec 0035 AC-3), and the counted units (spec 0054).
 */
export const RECOGNIZED_UNITS = [...VOLUME_UNITS, "part", ...COUNTED_UNITS] as const;
export type RecognizedUnit = (typeof RECOGNIZED_UNITS)[number];

/**
 * The conventional volume of one dash (1/8 tsp) and one splash (1/4 oz), in
 * ml (spec 0054 AC-4). Lives only in code, never in data, and never in toMl,
 * so a counted unit can't pass for a volume unit in the toggle.
 */
export const COUNTED_UNIT_ML: Readonly<Record<"dash" | "splash", number>> = {
  dash: 0.616115,
  splash: 7.393375,
};

/** The original six units the bar recipe form picker offers; bar_recipe_ingredients keeps its own narrower check constraint (spec 0035). */
export const BAR_FORM_UNITS = ["oz", "ml", "cl", "tsp", "tbsp", "cup"] as const;
export type BarFormUnit = (typeof BAR_FORM_UNITS)[number];

/** The three units the recipe detail toggle switches between. */
export const CONVERTIBLE_UNITS = ["oz", "ml", "cl"] as const;
export type ConvertibleUnit = (typeof CONVERTIBLE_UNITS)[number];

export interface ParsedMeasure {
  /** The amount, or the low end of a range. */
  value: number;
  /** The high end of a range, always above value; null for a single amount (spec 0054 AC-2). */
  maxValue: number | null;
  unit: RecognizedUnit;
}

/** A membership check (spec 0054), so a unit added later never reaches toMl by default. */
export function isVolumeUnit(unit: RecognizedUnit): unit is VolumeUnit {
  return (VOLUME_UNITS as readonly string[]).includes(unit);
}

export function isCountedUnit(unit: RecognizedUnit): unit is CountedUnit {
  return (COUNTED_UNITS as readonly string[]).includes(unit);
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

/**
 * The high end of a stored range, trusted only when it is a finite number
 * above the low end (spec 0054: clients narrow stored values). Anything else
 * reads as a single amount.
 */
export function validAmountMax(
  amountValue: number | null,
  amountMaxValue: number | null | undefined,
): number | null {
  return amountValue !== null &&
    typeof amountMaxValue === "number" &&
    Number.isFinite(amountMaxValue) &&
    amountMaxValue > amountValue
    ? amountMaxValue
    : null;
}

/** Narrows a stored bar_recipe_ingredients.amount_unit to the bar form's own units; anything else becomes null. */
export function toBarFormUnit(raw: unknown): BarFormUnit | null {
  return typeof raw === "string" && (BAR_FORM_UNITS as readonly string[]).includes(raw)
    ? (raw as BarFormUnit)
    : null;
}

/** A bar recipe form amount: empty saves as no amount; anything else must parse. */
export type BarAmountInput = { ok: true; value: number | null } | { ok: false };

/**
 * Reads a bar recipe form amount (spec 0055 AC-6, AC-8): empty or blank is
 * no amount, as before; otherwise `,` or `.` reads as the decimal point and
 * the value must be greater than 0 (no upper limit). An invalid amount is an
 * explicit failure, so the form blocks saving instead of storing NaN.
 */
export function validateBarAmount(raw: string): BarAmountInput {
  if (raw.trim() === "") {
    return { ok: true, value: null };
  }
  const value = parseDecimalInput(raw);
  return value === null || value <= 0 ? { ok: false } : { ok: true, value };
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
    dash: "dash",
    dashes: "dash",
    splash: "splash",
    splashes: "splash",
    drop: "drop",
    drops: "drop",
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

// After the unit, a second number introduced by "-", "–", "to", "or", or "/"
// means the measure names a second amount. Only a matching unit after it
// makes a range (spec 0054 AC-2); otherwise the line stays unparsed.
const SECOND_AMOUNT_AFTER_UNIT = new RegExp(
  `^(-|–|to\\b|or\\b|\\/)\\s*(\\d|${GLYPH_ALTERNATION})`,
  "i",
);

// The dash or word joining the two ends of a range: "-", "–" (en dash), "to", "or".
const RANGE_SEPARATOR = /^(?:-|–|to\b|or\b)\s*/i;

/** Reads a range separator plus the high number ("- 3 oz" gives 3 and "oz"); null without one. */
function readRangeHigh(text: string): { value: number; rest: string } | null {
  const separator = RANGE_SEPARATOR.exec(text);
  return separator ? parseLeadingNumber(text.slice(separator[0].length)) : null;
}

function single(value: number, unit: RecognizedUnit): ParsedMeasure | null {
  return unit === "each" && value <= 0 ? null : { value, maxValue: null, unit };
}

function range(low: number, high: number, unit: RecognizedUnit): ParsedMeasure | null {
  return high > low && (unit !== "each" || low > 0) ? { value: low, maxValue: high, unit } : null;
}

/**
 * Parses a leading number followed by a unit token out of raw measure text
 * (spec 0021 AC-3, spec 0035 AC-1, spec 0054 AC-1 and AC-2). The unit is the
 * first word after the number (or the two words "fl oz"), matched as a whole
 * token, case insensitive, with one optional trailing dot; any further words
 * are ignored. A number with nothing after it is a plain count, unit "each"
 * ("1" Lime), when it is above 0.
 *
 * A range reads into value (low) and maxValue (high): "2-3 oz", "2 - 3 oz",
 * "2–3 oz", "2 to 3 oz", "2 or 3 oz", "1 oz - 2 ounces" (the same unit both
 * times), and the unitless "2-3", "2 to 3", "2 or 3" as "each". It parses
 * only when the high end is above the low end.
 *
 * Returns null for anything else: no number, a number followed by any other
 * character or word ("2.", "1 (optional)", "1 lime", "2 Wheels"), a range out
 * of order or in two units ("3-2 oz", "1 oz or 2 shots"), or a non volume
 * word ("sprig", "wedge", "to taste").
 */
export function parseMeasure(measure: string | null | undefined): ParsedMeasure | null {
  if (!measure) {
    return null;
  }

  const leading = parseLeadingNumber(measure);
  if (!leading) {
    return null;
  }

  if (leading.rest.length === 0) {
    return single(leading.value, "each");
  }

  // "A-B unit", "A to B unit", "A or B unit", or the unitless "A-B".
  const high = readRangeHigh(leading.rest);
  if (high) {
    if (high.rest.length === 0) {
      return range(leading.value, high.value, "each");
    }
    const read = readUnit(high.rest);
    return read && !SECOND_AMOUNT_AFTER_UNIT.test(read.after)
      ? range(leading.value, high.value, read.unit)
      : null;
  }
  if (/^[-–]/.test(leading.rest)) {
    return null;
  }

  const read = readUnit(leading.rest);
  if (!read) {
    return null;
  }

  // "A unit - B unit", "A unit to B unit", "A unit or B unit", one unit both times.
  const highAfterUnit = readRangeHigh(read.after);
  if (highAfterUnit) {
    const second = readUnit(highAfterUnit.rest);
    return second && second.unit === read.unit && !SECOND_AMOUNT_AFTER_UNIT.test(second.after)
      ? range(leading.value, highAfterUnit.value, read.unit)
      : null;
  }

  return SECOND_AMOUNT_AFTER_UNIT.test(read.after) ? null : single(leading.value, read.unit);
}

// Counted or non volume words that still belong to the measure when a line
// is split into measure and name ("2 dashes Angostura bitters").
const COUNTED_MEASURE_WORDS: ReadonlySet<string> = new Set([
  "dash",
  "dashes",
  "drop",
  "drops",
  "splash",
  "splashes",
  "pinch",
  "pinches",
  "barspoon",
  "barspoons",
  "sprig",
  "sprigs",
  "leaf",
  "leaves",
  "slice",
  "slices",
  "wedge",
  "wedges",
  "twist",
  "twists",
  "piece",
  "pieces",
  "cube",
  "cubes",
]);

export interface IngredientLine {
  name: string;
  measure: string | null;
}

/**
 * Splits one pasted recipe line into its measure and ingredient name:
 * "½ oz RumChata" -> { measure: "½ oz", name: "RumChata" }. The measure is a
 * leading number plus a unit word ("fl oz" too) or a counted word ("dashes");
 * a number with neither keeps just the number ("2 Eggs"). A line with no
 * leading number is all name ("Soda water, to top"). A leading list bullet
 * and an "of" after the measure ("1 oz of gin") are dropped.
 */
export function splitIngredientLine(line: string): IngredientLine {
  const text = line.trim().replace(/^[-*•·–]\s*/, "");
  const leading = parseLeadingNumber(text);
  if (!leading || leading.rest.length === 0) {
    return { name: text, measure: null };
  }

  const numberText = text.slice(0, text.length - leading.rest.length).trim();
  const tokens = leading.rest.split(/\s+/);
  const first = normalizeToken(tokens[0] ?? "");
  const second = normalizeToken(tokens[1] ?? "");
  const measureWordCount =
    first === "fl" && second === "oz"
      ? 2
      : unitFromToken(tokens[0]) || COUNTED_MEASURE_WORDS.has(first)
        ? 1
        : 0;

  const measure = [numberText, ...tokens.slice(0, measureWordCount)].join(" ");
  const name = tokens
    .slice(measureWordCount)
    .join(" ")
    .replace(/^of\s+/i, "");

  return { name, measure };
}

/**
 * Splits pasted multi line text into ingredient lines, one per non blank
 * line, for the admin form's paste to fill (blank lines between entries are
 * common when copying from a recipe site).
 */
export function splitIngredientLines(text: string): IngredientLine[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map(splitIngredientLine);
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

/**
 * Formats a tenth rounded value with the locale's separators, trimming a
 * trailing zero (44.0 -> "44"; 44.4 -> "44.4" in en, "44,4" in fr; spec 0055).
 */
export function formatDecimal(value: number, locale: Locale): string {
  return formatNumber(value, locale, 1);
}

/**
 * Formats an oz amount as a mixed number rounded to the nearest eighth
 * ("1 1/2", not "1.5"; "2", not "2 0/8"). Used only when displaying a non oz
 * sourced amount converted into oz; an oz sourced line renders its original
 * `measure` text verbatim instead (never re derived from this). Locale free
 * by design: whole and fraction stay ASCII digits in every locale (spec 0055).
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
export function formatConvertedAmount(
  value: number,
  targetUnit: ConvertibleUnit,
  locale: Locale,
): string {
  if (targetUnit === "oz") {
    return formatOunces(value);
  }
  return formatDecimal(roundToTenth(value), locale);
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
  locale: Locale,
): string | null {
  if (amountValue === null || amountUnit === null || !isVolumeUnit(amountUnit)) {
    return null;
  }
  return formatConvertedAmount(
    convertAmount(amountValue, amountUnit, targetUnit),
    targetUnit,
    locale,
  );
}

/**
 * formatAmountInUnit for a line that may be a range (spec 0054 AC-6): both
 * ends convert through the same single serving formatting, joined by "–"
 * ("20–30" ml). A single amount formats as before. Null when the line can't
 * convert (unparsed, part, or a counted unit), so it shows its measure text.
 */
export function formatAmountOrRangeInUnit(
  amountValue: number | null,
  amountMaxValue: number | null,
  amountUnit: RecognizedUnit | null,
  targetUnit: ConvertibleUnit,
  locale: Locale,
): string | null {
  const low = formatAmountInUnit(amountValue, amountUnit, targetUnit, locale);
  if (low === null || amountMaxValue === null) {
    return low;
  }
  const high = formatAmountInUnit(amountMaxValue, amountUnit, targetUnit, locale);
  return high === null || high === low ? low : `${low}–${high}`;
}

/** Per locale unit word labels (not machine translated), mirroring locale.ts's Record<Locale, ...> lookup idiom. */
export const UNIT_LABELS: Record<ConvertibleUnit, Record<Locale, string>> = {
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
};

export function unitLabel(unit: ConvertibleUnit, locale: Locale = DEFAULT_LOCALE): string {
  return UNIT_LABELS[unit][locale] ?? UNIT_LABELS[unit][DEFAULT_LOCALE];
}
