import { describe, expect, it } from "vitest";
import {
  formatAmountOrRangeInUnit,
  validAmountMax,
  validateBarAmount,
  BAR_FORM_UNITS,
  COUNTED_UNITS,
  convertAmount,
  formatAmountInUnit,
  formatOunces,
  isCountedUnit,
  isVolumeUnit,
  parseMeasure,
  splitIngredientLine,
  splitIngredientLines,
  toBarFormUnit,
  toMl,
  toRecognizedUnit,
  unitLabel,
  type RecognizedUnit,
} from "./units";

describe("unitLabel (spec 0047 AC-13)", () => {
  it("writes the unit toggle labels in Cyrillic for ru", () => {
    expect(unitLabel("oz", "ru")).toBe("унц.");
    expect(unitLabel("ml", "ru")).toBe("мл");
    expect(unitLabel("cl", "ru")).toBe("сл");
  });

  it("writes the unit toggle labels in Devanagari with no dots for hi (spec 0048 AC-13)", () => {
    expect([unitLabel("oz", "hi"), unitLabel("ml", "hi"), unitLabel("cl", "hi")]).toEqual([
      "औंस",
      "मिली",
      "सेली",
    ]);
  });

  it("writes oz as オンス and keeps ml and cl for ja (spec 0050 AC-14)", () => {
    expect([unitLabel("oz", "ja"), unitLabel("ml", "ja"), unitLabel("cl", "ja")]).toEqual([
      "オンス",
      "ml",
      "cl",
    ]);
  });

  it("writes oz as 온스 and keeps ml and cl for ko (spec 0051 AC-13)", () => {
    expect([unitLabel("oz", "ko"), unitLabel("ml", "ko"), unitLabel("cl", "ko")]).toEqual([
      "온스",
      "ml",
      "cl",
    ]);
  });

  it("writes oz as 盎司 and keeps ml and cl for zh (spec 0052 AC-13)", () => {
    expect([unitLabel("oz", "zh"), unitLabel("ml", "zh"), unitLabel("cl", "zh")]).toEqual([
      "盎司",
      "ml",
      "cl",
    ]);
  });

  it("keeps the Latin labels in every other locale", () => {
    for (const locale of ["en", "es", "pt", "fr"] as const) {
      expect([unitLabel("oz", locale), unitLabel("ml", locale), unitLabel("cl", locale)]).toEqual([
        "oz",
        "ml",
        "cl",
      ]);
    }
  });

  it("defaults to English when no locale is given", () => {
    expect(unitLabel("ml")).toBe("ml");
  });
});

describe("parseMeasure (spec 0035 AC-1)", () => {
  const parses: readonly [string, number, RecognizedUnit][] = [
    ["1 shot", 1, "shot"],
    ["2 Jiggers", 2, "jigger"],
    ["3 parts", 3, "part"],
    ["1/2 part", 0.5, "part"],
    ["1 dl", 1, "dl"],
    ["1 L", 1, "l"],
    ["1 Tblsp", 1, "tbsp"],
    ["1 Tblsp.", 1, "tbsp"],
    ["1 fl. oz", 1, "oz"],
    ["1 fl oz", 1, "oz"],
    ["1 pint", 1, "pint"],
    ["2 qt", 2, "qt"],
    ["1 gallon", 1, "gal"],
    ["1 ½ oz", 1.5, "oz"],
    ["1½ oz", 1.5, "oz"],
    ["1 1/2 oz", 1.5, "oz"],
    ["1 oz Bacardi", 1, "oz"],
    ["1 oz.", 1, "oz"],
    ["1 tsp superfine", 1, "tsp"],
    ["2 cups cold", 2, "cup"],
    ["4 cl", 4, "cl"],
    ["30 ml", 30, "ml"],
    ["  2 oz  ", 2, "oz"],
  ];

  it.each(parses)("parses %s", (measure, value, unit) => {
    expect(parseMeasure(measure)).toEqual({ value, maxValue: null, unit });
  });

  // Ranges now parse (spec 0054 AC-2); two different units still do not.
  const unparsed = [
    "1 lime",
    "1 oz or 2 shots",
    "1 oz / 30 ml",
    "Juice of 1/2",
    "top up with",
    "",
    null,
  ];

  it.each(unparsed)("leaves %s unparsed (AC-11)", (measure) => {
    expect(parseMeasure(measure)).toBeNull();
  });
});

describe("parseMeasure counted units (spec 0054 AC-1)", () => {
  const parses: readonly [string, number, string][] = [
    ["1 dash", 1, "dash"],
    ["2 Dashes", 2, "dash"],
    ["2 dashes", 2, "dash"],
    ["1 dash.", 1, "dash"],
    ["1/2 dash", 0.5, "dash"],
    ["1 splash", 1, "splash"],
    ["2 Splashes", 2, "splash"],
    ["3 Drops", 3, "drop"],
    ["1 drop", 1, "drop"],
    ["2 dashes Angostura", 2, "dash"],
    ["1", 1, "each"],
    ["1/2", 0.5, "each"],
    ["6", 6, "each"],
    ["1 ½", 1.5, "each"],
    ["  2  ", 2, "each"],
  ];

  it.each(parses)("parses %s", (measure, value, unit) => {
    expect(parseMeasure(measure)).toEqual({ value, maxValue: null, unit });
  });

  const unparsed = ["0", "2.", "1 (optional)", "1 whole", "2 Wheels", "1 lime", "2 dashy"];

  it.each(unparsed)("leaves %s unparsed", (measure) => {
    expect(parseMeasure(measure)).toBeNull();
  });

  it("never sets maxValue on a single amount", () => {
    expect(parseMeasure("2 dashes")?.maxValue).toBeNull();
  });

  it("keeps the bar form units unchanged", () => {
    expect(BAR_FORM_UNITS).toEqual(["oz", "ml", "cl", "tsp", "tbsp", "cup"]);
  });
});

describe("parseMeasure ranges (spec 0054 AC-2)", () => {
  const ranges: readonly [string, number, number, string][] = [
    ["2-3 oz", 2, 3, "oz"],
    ["3/4-1 cup", 0.75, 1, "cup"],
    ["1-2 shot", 1, 2, "shot"],
    ["2-3 dashes", 2, 3, "dash"],
    ["2 or 3", 2, 3, "each"],
    ["1 oz to 2 oz", 1, 2, "oz"],
    ["8-10 oz cold", 8, 10, "oz"],
    ["1 1/2-2 oz", 1.5, 2, "oz"],
    ["½-1 oz", 0.5, 1, "oz"],
    ["1/2 - 3/4 cup", 0.5, 0.75, "cup"],
    ["1 oz - 2 ounces", 1, 2, "oz"],
    ["2 - 3 oz", 2, 3, "oz"],
    ["2–3 oz", 2, 3, "oz"],
    ["2 to 3 oz", 2, 3, "oz"],
    ["2 or 3 oz", 2, 3, "oz"],
    ["1 oz or 2 oz", 1, 2, "oz"],
    ["2-3 parts", 2, 3, "part"],
    ["2-3", 2, 3, "each"],
    ["2 to 3", 2, 3, "each"],
  ];

  it.each(ranges)("parses %s", (measure, value, maxValue, unit) => {
    expect(parseMeasure(measure)).toEqual({ value, maxValue, unit });
  });

  const unparsed = [
    "3-2 oz",
    "2-2 oz",
    "1 oz or 2 shots",
    "2-3 Wheels",
    "3-4 crushed",
    "4-5 whole green",
    "1 oz - 2",
    "2-ish oz",
    "1 to taste",
    "1 oz / 30 ml",
  ];

  it.each(unparsed)("leaves %s unparsed", (measure) => {
    expect(parseMeasure(measure)).toBeNull();
  });
});

describe("isVolumeUnit and isCountedUnit (spec 0054)", () => {
  it("treats counted units and part as non volume", () => {
    expect(COUNTED_UNITS.some((unit) => isVolumeUnit(unit))).toBe(false);
    expect(isVolumeUnit("part")).toBe(false);
    expect(isVolumeUnit("oz")).toBe(true);
    expect(COUNTED_UNITS.every((unit) => isCountedUnit(unit))).toBe(true);
    expect(isCountedUnit("oz")).toBe(false);
  });

  it("keeps counted lines out of the toggle", () => {
    expect(formatAmountInUnit(2, "dash", "ml", "en")).toBeNull();
    expect(formatAmountInUnit(1, "each", "oz", "en")).toBeNull();
  });

  it("recognizes the counted units when read back from the database", () => {
    expect(COUNTED_UNITS.map((unit) => toRecognizedUnit(unit))).toEqual([...COUNTED_UNITS]);
  });
});

describe("toMl and convertAmount (spec 0035 AC-2)", () => {
  it("uses 1.5 oz for a shot and a jigger", () => {
    expect(toMl(1, "shot")).toBeCloseTo(44.36025, 5);
    expect(toMl(1, "jigger")).toBeCloseTo(44.36025, 5);
  });

  it("uses metric and US volume constants", () => {
    expect(toMl(1, "dl")).toBe(100);
    expect(toMl(1, "l")).toBe(1000);
    expect(toMl(1, "pint")).toBe(473.176);
    expect(toMl(1, "qt")).toBe(946.353);
    expect(toMl(1, "gal")).toBe(3785.41);
  });

  it("shows 1 shot as 1 1/2 oz and 44.4 ml in the toggle", () => {
    expect(formatOunces(convertAmount(1, "shot", "oz"))).toBe("1 1/2");
    expect(convertAmount(1, "shot", "ml")).toBe(44.4);
  });
});

describe("toRecognizedUnit (spec 0035 AC-12)", () => {
  it("keeps every known unit", () => {
    expect(toRecognizedUnit("oz")).toBe("oz");
    expect(toRecognizedUnit("part")).toBe("part");
    expect(toRecognizedUnit("gal")).toBe("gal");
  });

  it("turns unknown or missing units into null", () => {
    expect(toRecognizedUnit("firkin")).toBeNull();
    expect(toRecognizedUnit(null)).toBeNull();
    expect(toRecognizedUnit(undefined)).toBeNull();
    expect(toRecognizedUnit(3)).toBeNull();
  });

  it("narrows bar units to the bar form's six", () => {
    expect(toBarFormUnit("cup")).toBe("cup");
    expect(toBarFormUnit("part")).toBeNull();
    expect(toBarFormUnit("shot")).toBeNull();
  });
});

describe("splitIngredientLine", () => {
  it.each([
    ["½ oz RumChata", "½ oz", "RumChata"],
    ["1 1/2 oz Gin", "1 1/2 oz", "Gin"],
    ["1½ oz Vanilla Vodka", "1½ oz", "Vanilla Vodka"],
    ["30 ml Lime juice", "30 ml", "Lime juice"],
    ["1 fl oz Cream", "1 fl oz", "Cream"],
    ["2 dashes Angostura bitters", "2 dashes", "Angostura bitters"],
    ["1 oz of gin", "1 oz", "gin"],
    ["- 2 oz Bourbon", "2 oz", "Bourbon"],
    ["2 Eggs", "2", "Eggs"],
  ])("splits %j", (line, measure, name) => {
    expect(splitIngredientLine(line)).toEqual({ measure, name });
  });

  it("keeps a line with no leading number as the name", () => {
    expect(splitIngredientLine("Soda water, to top")).toEqual({
      measure: null,
      name: "Soda water, to top",
    });
  });
});

describe("splitIngredientLines", () => {
  it("splits pasted text into one entry per non blank line", () => {
    const pasted =
      "½ oz RumChata\r\n\r\n½ oz Domaine de Canton Ginger Liqueur\n\n½ oz Vanilla Vodka\n";
    expect(splitIngredientLines(pasted)).toEqual([
      { measure: "½ oz", name: "RumChata" },
      { measure: "½ oz", name: "Domaine de Canton Ginger Liqueur" },
      { measure: "½ oz", name: "Vanilla Vodka" },
    ]);
  });
});

describe("formatAmountOrRangeInUnit (spec 0054 AC-6)", () => {
  it("converts both ends of a volume range, joined by an en dash", () => {
    expect(formatAmountOrRangeInUnit(2, 3, "cl", "ml", "en")).toBe("20–30");
  });

  it("formats a single amount as before", () => {
    expect(formatAmountOrRangeInUnit(2, null, "cl", "ml", "en")).toBe("20");
  });

  it("uses the locale's decimal separator and keeps oz fractions (spec 0055 AC-1, AC-9)", () => {
    expect(formatAmountOrRangeInUnit(1, null, "shot", "ml", "fr")).toBe("44,4");
    expect(formatAmountOrRangeInUnit(1, null, "shot", "ml", "en")).toBe("44.4");
    expect(formatAmountOrRangeInUnit(1, null, "shot", "cl", "es")).toBe("4,4");
    expect(formatAmountOrRangeInUnit(1, null, "shot", "ml", "zh")).toBe("44.4");
    expect(formatAmountOrRangeInUnit(2, 3, "cl", "ml", "fr")).toBe("20–30");
    expect(formatAmountOrRangeInUnit(45, null, "ml", "oz", "fr")).toBe("1 1/2");
  });

  it("returns null for a counted range, which shows its measure text", () => {
    expect(formatAmountOrRangeInUnit(2, 3, "dash", "ml", "en")).toBeNull();
  });
});

describe("validAmountMax (spec 0054)", () => {
  it("keeps a max above the value", () => {
    expect(validAmountMax(2, 3)).toBe(3);
  });

  it.each([
    [2, 2],
    [2, 1],
    [null, 3],
    [2, null],
    [2, undefined],
    [2, Number.NaN],
  ] as const)("drops %s to %s", (value, max) => {
    expect(validAmountMax(value, max)).toBeNull();
  });
});

describe("validateBarAmount (spec 0055 AC-6, AC-8)", () => {
  it("reads a comma or a dot as the decimal point", () => {
    expect(validateBarAmount("0,5")).toEqual({ ok: true, value: 0.5 });
    expect(validateBarAmount("1.5")).toEqual({ ok: true, value: 1.5 });
    expect(validateBarAmount("750")).toEqual({ ok: true, value: 750 });
  });

  it("treats an empty amount as no amount", () => {
    expect(validateBarAmount("")).toEqual({ ok: true, value: null });
    expect(validateBarAmount("  ")).toEqual({ ok: true, value: null });
  });

  it.each(["0", "0,0", "-1", "1,5,0", "abc", "१,५", "1,"])("rejects %j", (raw) => {
    expect(validateBarAmount(raw)).toEqual({ ok: false });
  });
});
