import type { Locale } from "./locale";

/**
 * Locale aware number formatting for measures, conversions, batch amounts,
 * and parts (spec 0055). The one place display numbers become text, so every
 * surface shows the same decimal separator and thousands rule as the locale.
 */

/**
 * Formats an already rounded number with the locale's separators (AC-1,
 * AC-2, AC-10). Callers round first and pass their rounding precision as
 * `maxFractionDigits`, so Intl never rounds a second time (AC-9). Trailing
 * zeros are dropped (44.0 -> "44"). Digits stay Latin in every locale: none
 * of the app's locales (hi included) default to a non Latin numbering system.
 * No formatter cache: a screen formats about ten numbers, and a module level
 * cache would be shared mutable state.
 */
export function formatNumber(value: number, locale: Locale, maxFractionDigits: number): string {
  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: 0,
    maximumFractionDigits: maxFractionDigits,
    useGrouping: true,
  }).format(value);
}

function usesDecimalComma(locale: Locale): boolean {
  return formatNumber(1.5, locale, 1).includes(",");
}

/**
 * Swaps the decimal separator in raw stored or generated measure text to the
 * locale's (AC-4, AC-5). Comma locale: a dot between digits becomes a comma,
 * and a bare leading decimal (".5 oz") gains a zero ("0,5 oz"). Dot locale: a
 * comma followed by exactly one or two digits becomes a dot, so a three digit
 * group ("1,000") is left alone. Nothing else in the text changes. Run only on
 * raw text, never on formatter output, so nothing is normalized twice.
 */
export function localizeDecimalText(text: string, locale: Locale): string {
  if (usesDecimalComma(locale)) {
    return text
      .replace(/(\d)\.(?=\d)/g, "$1,")
      .replace(/(^|\s)\.(?=\d)/g, (_match, lead: string) => `${lead}0,`);
  }
  return text.replace(/(\d),(?=\d{1,2}(?!\d))/g, "$1.");
}

const DECIMAL_INPUT = /^[0-9]+([.,][0-9]+)?$/;

/**
 * Parses a number typed into an input (AC-6): ASCII digits with at most one
 * `,` or `.` as the decimal point, in any locale. Anything else (two
 * separators, a sign, non Latin digits, a trailing separator, empty) is null,
 * so NaN never leaves this function.
 */
export function parseDecimalInput(raw: string): number | null {
  const trimmed = raw.trim();
  if (!DECIMAL_INPUT.test(trimmed)) {
    return null;
  }
  const value = Number(trimmed.replace(",", "."));
  return Number.isFinite(value) ? value : null;
}
