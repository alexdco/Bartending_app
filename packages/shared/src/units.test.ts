import { describe, expect, it } from "vitest";
import {
  convertAmount,
  formatOunces,
  parseMeasure,
  splitIngredientLine,
  splitIngredientLines,
  toBarFormUnit,
  toMl,
  toRecognizedUnit,
  type RecognizedUnit,
} from "./units";

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
    expect(parseMeasure(measure)).toEqual({ value, unit });
  });

  const unparsed = [
    "1 lime",
    "2-3 oz",
    "1-2 oz",
    "1 to 2 oz",
    "1 oz to 2 oz",
    "1 oz - 2 oz",
    "1 oz or 2 shots",
    "1 oz / 30 ml",
    "2 dashes",
    "1",
    "Juice of 1/2",
    "top up with",
    "",
    null,
  ];

  it.each(unparsed)("leaves %s unparsed (AC-11)", (measure) => {
    expect(parseMeasure(measure)).toBeNull();
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
