import { describe, expect, it } from "vitest";
import { SUPPORTED_LOCALES, type Locale } from "./locale";
import { formatNumber, localizeDecimalText, parseDecimalInput } from "./numberFormat";

const COMMA_LOCALES: readonly Locale[] = ["es", "pt", "fr", "ru"];
const DOT_LOCALES: readonly Locale[] = ["en", "hi", "ja", "ko", "zh"];

describe("formatNumber (spec 0055 AC-1, AC-2, AC-10)", () => {
  it("covers every supported locale", () => {
    expect([...COMMA_LOCALES, ...DOT_LOCALES].sort()).toEqual([...SUPPORTED_LOCALES].sort());
  });

  it.each(COMMA_LOCALES)("writes a decimal comma in %s", (locale) => {
    expect(formatNumber(44.4, locale, 1)).toBe("44,4");
    expect(formatNumber(0.5, locale, 1)).toBe("0,5");
  });

  it.each(DOT_LOCALES)("writes a decimal dot in %s", (locale) => {
    expect(formatNumber(44.4, locale, 1)).toBe("44.4");
    expect(formatNumber(0.5, locale, 1)).toBe("0.5");
  });

  it("drops trailing zeros and never rounds past the given precision", () => {
    expect(formatNumber(44, "fr", 1)).toBe("44");
    expect(formatNumber(1.25, "en", 2)).toBe("1.25");
    expect(formatNumber(0.001, "fr", 3)).toBe("0,001");
  });

  it("groups thousands by the locale's rule", () => {
    expect(formatNumber(30000, "en", 1)).toBe("30,000");
    expect(formatNumber(30000, "es", 1)).toBe("30.000");
    // The grouping space differs by engine (U+202F or U+00A0), so assert a space class.
    expect(formatNumber(30000, "fr", 1)).toMatch(/^30[\s  ]000$/);
    expect(formatNumber(30000, "ru", 1)).toMatch(/^30[\s  ]000$/);
  });

  it.each(SUPPORTED_LOCALES)("uses Latin digits in %s", (locale) => {
    expect(formatNumber(1234567.8, locale, 1)).toMatch(/^[0-9.,\s  ]+$/);
  });
});

describe("localizeDecimalText (spec 0055 AC-4, AC-5)", () => {
  it("swaps a dot between digits for a comma in comma locales", () => {
    expect(localizeDecimalText("2.5 cl", "es")).toBe("2,5 cl");
    expect(localizeDecimalText("1.5 oz", "fr")).toBe("1,5 oz");
    expect(localizeDecimalText("1.5-2.5 oz", "pt")).toBe("1,5-2,5 oz");
  });

  it("adds a zero before a bare leading decimal in comma locales", () => {
    expect(localizeDecimalText(".5 oz", "fr")).toBe("0,5 oz");
    expect(localizeDecimalText("top with .75 oz", "ru")).toBe("top with 0,75 oz");
  });

  it("swaps a comma before one or two digits for a dot in dot locales", () => {
    expect(localizeDecimalText("4,5 cl", "zh")).toBe("4.5 cl");
    expect(localizeDecimalText("1,25 oz", "en")).toBe("1.25 oz");
    // Documented edge: a two digit group after a comma always reads as a decimal.
    expect(localizeDecimalText("1,50", "en")).toBe("1.50");
  });

  it("leaves fractions, ranges, words, and three digit groups alone", () => {
    expect(localizeDecimalText("1 1/2 oz", "fr")).toBe("1 1/2 oz");
    expect(localizeDecimalText("2-3 dashes", "es")).toBe("2-3 dashes");
    expect(localizeDecimalText("1,000 ml", "en")).toBe("1,000 ml");
    expect(localizeDecimalText("Juice of 1 lime.", "fr")).toBe("Juice of 1 lime.");
    expect(localizeDecimalText("4,5 cl", "fr")).toBe("4,5 cl");
    expect(localizeDecimalText("1.5 oz", "en")).toBe("1.5 oz");
  });
});

describe("parseDecimalInput (spec 0055 AC-6)", () => {
  it.each([
    ["1,5", 1.5],
    ["1.5", 1.5],
    [" 0,75 ", 0.75],
    ["30", 30],
  ] as const)("reads %j as %d", (raw, expected) => {
    expect(parseDecimalInput(raw)).toBe(expected);
  });

  it.each(["1,5,0", "1.5.0", "1,5.0", "-1", "+1", "abc", "", "  ", "1,", ",5", "१,५", "1e3"])(
    "rejects %j",
    (raw) => {
      expect(parseDecimalInput(raw)).toBeNull();
    },
  );
});
