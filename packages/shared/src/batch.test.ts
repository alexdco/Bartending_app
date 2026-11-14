import { describe, expect, it } from "vitest";
import {
  batchCount,
  batchCountPluralValue,
  batchCountText,
  batchUnitLabel,
  computeBatch,
  convertPartSize,
  formatBatchAmount,
  formatBatchRange,
  hasPartIngredient,
  hasScalableIngredient,
  hasVolumeIngredient,
  isBatchableIngredient,
  partSizeInputForUnit,
  partSizeUnitFor,
  roundBatchCount,
  validatePartSize,
  validateCustomDilutionPercent,
  validateServings,
  type BatchIngredientInput,
} from "./batch";

describe("batchUnitLabel (spec 0047 AC-13)", () => {
  it("writes every batch unit in Cyrillic for ru, liters included", () => {
    expect((["oz", "ml", "cl", "l"] as const).map((unit) => batchUnitLabel(unit, "ru"))).toEqual([
      "унц.",
      "мл",
      "сл",
      "л",
    ]);
  });

  it("writes every batch unit in Devanagari with no dots for hi (spec 0048 AC-13)", () => {
    expect((["oz", "ml", "cl", "l"] as const).map((unit) => batchUnitLabel(unit, "hi"))).toEqual([
      "औंस",
      "मिली",
      "सेली",
      "ली",
    ]);
  });

  it("writes oz as オンス and the litre as a capital L for ja (spec 0050 AC-14)", () => {
    expect((["oz", "ml", "cl", "l"] as const).map((unit) => batchUnitLabel(unit, "ja"))).toEqual([
      "オンス",
      "ml",
      "cl",
      "L",
    ]);
  });

  it("writes oz as 온스 and the litre as a capital L for ko (spec 0051 AC-13)", () => {
    expect((["oz", "ml", "cl", "l"] as const).map((unit) => batchUnitLabel(unit, "ko"))).toEqual([
      "온스",
      "ml",
      "cl",
      "L",
    ]);
  });

  it("writes oz as 盎司 and the litre as a capital L for zh (spec 0052 AC-13)", () => {
    expect((["oz", "ml", "cl", "l"] as const).map((unit) => batchUnitLabel(unit, "zh"))).toEqual([
      "盎司",
      "ml",
      "cl",
      "L",
    ]);
  });

  it("keeps the Latin labels in every other locale", () => {
    for (const locale of ["en", "es", "pt", "fr"] as const) {
      expect(
        (["oz", "ml", "cl", "l"] as const).map((unit) => batchUnitLabel(unit, locale)),
      ).toEqual(["oz", "ml", "cl", "l"]);
    }
  });
});

function ingredient(overrides: Partial<BatchIngredientInput> = {}): BatchIngredientInput {
  return {
    ingredientId: "rum",
    name: "Rum",
    measure: "1 oz",
    amountValue: 1,
    amountMaxValue: null,
    amountUnit: "oz",
    category: "spirit",
    ...overrides,
  };
}

describe("validateServings", () => {
  it("accepts whole numbers from 1 to 500", () => {
    expect(validateServings("1")).toBe(1);
    expect(validateServings("500")).toBe(500);
    expect(validateServings("50")).toBe(50);
  });

  it("rejects 0, out of range, decimals, and non numeric input", () => {
    expect(validateServings("0")).toBeNull();
    expect(validateServings("501")).toBeNull();
    expect(validateServings("1.5")).toBeNull();
    expect(validateServings("abc")).toBeNull();
    expect(validateServings("")).toBeNull();
  });
});

describe("validateCustomDilutionPercent", () => {
  it("accepts 0 through 50, whole or decimal", () => {
    expect(validateCustomDilutionPercent("0")).toBe(0);
    expect(validateCustomDilutionPercent("50")).toBe(50);
    expect(validateCustomDilutionPercent("18.5")).toBe(18.5);
  });

  it("rejects values outside 0 to 50", () => {
    expect(validateCustomDilutionPercent("-1")).toBeNull();
    expect(validateCustomDilutionPercent("51")).toBeNull();
    expect(validateCustomDilutionPercent("abc")).toBeNull();
  });
});

describe("hasScalableIngredient (spec 0054 AC-7)", () => {
  it("is true when at least one ingredient has a parsed volume amount", () => {
    expect(hasScalableIngredient([ingredient()])).toBe(true);
  });

  it("is false when every ingredient is unparseable", () => {
    expect(hasScalableIngredient([ingredient({ amountValue: null, amountUnit: null })])).toBe(
      false,
    );
  });

  it("is true for a dash or splash line alone, since it adds volume", () => {
    expect(hasScalableIngredient([ingredient({ amountValue: 2, amountUnit: "dash" })])).toBe(true);
    expect(hasScalableIngredient([ingredient({ amountValue: 1, amountUnit: "splash" })])).toBe(
      true,
    );
  });

  it("is false for a recipe of only drops and plain counts", () => {
    expect(
      hasScalableIngredient([
        ingredient({ ingredientId: "bitters", amountValue: 3, amountUnit: "drop" }),
        ingredient({
          ingredientId: "lime",
          amountValue: 1,
          amountUnit: "each",
          category: "citrus",
        }),
      ]),
    ).toBe(false);
  });

  it("is false for a layered shooter made only of liqueur shares", () => {
    const b52 = ["kahlua", "baileys", "grand-marnier"].map((id) =>
      ingredient({ ingredientId: id, amountValue: 1 / 3, amountUnit: "each", category: "liqueur" }),
    );
    expect(hasScalableIngredient(b52)).toBe(false);
  });
});

describe("roundBatchCount (spec 0054 AC-4)", () => {
  it("rounds dash, splash, and drop to whole numbers, never below 1", () => {
    expect(roundBatchCount(1.5, "dash")).toBe(2);
    expect(roundBatchCount(0.25, "drop")).toBe(1);
    expect(roundBatchCount(50.4, "splash")).toBe(50);
  });

  it("rounds each to the nearest half with ties up, never below 0.5", () => {
    expect(roundBatchCount(12.5, "each")).toBe(12.5);
    expect(roundBatchCount(8.25, "each")).toBe(8.5);
    expect(roundBatchCount(8.2, "each")).toBe(8);
    expect(roundBatchCount(0.1, "each")).toBe(0.5);
  });
});

describe("computeBatch counted lines (spec 0054 AC-4)", () => {
  const gin = ingredient({ ingredientId: "gin", amountValue: 2, amountUnit: "oz" });
  const bitters = ingredient({
    ingredientId: "bitters",
    name: "Angostura bitters",
    measure: "2 dashes",
    amountValue: 2,
    amountUnit: "dash",
    category: "other",
  });

  it("scales 2 dashes × 25 to 50 dashes with a ≈ 1 oz hint, counted in the total", () => {
    const result = computeBatch([gin, bitters], {
      servings: 25,
      scope: "everything",
      unit: "oz",
      dilutionLevel: "none",
      locale: "en",
    });
    const line = result.lines[1];
    expect(line.state).toBe("normal");
    expect(line.count).toEqual({ value: 50, maxValue: null, unit: "dash" });
    expect(line.displayAmount).toBeNull();
    expect(line.approxAmount).toBe("1 oz");
    expect(line.amountMl).toBeCloseTo(30.80575, 6);
    expect(result.totalDisplayAmount).toBe(formatBatchAmount(50 * 29.5735 + 30.80575, "oz", "en"));
  });

  it("shows 2 dashes × 1 with no ≈ hint", () => {
    const result = computeBatch([bitters], {
      servings: 1,
      scope: "everything",
      unit: "oz",
      dilutionLevel: "none",
      locale: "en",
    });
    expect(result.lines[0].count).toEqual({ value: 2, maxValue: null, unit: "dash" });
    expect(result.lines[0].approxAmount).toBeNull();
  });

  it("shows the hint for exactly one splash", () => {
    const result = computeBatch(
      [ingredient({ amountValue: 1, amountUnit: "splash", category: "other" })],
      { servings: 1, scope: "everything", unit: "ml", dilutionLevel: "none", locale: "en" },
    );
    expect(result.lines[0].approxAmount).toBe("7.4 ml");
  });

  it("rounds 1/2 dash × 3 to 2 dashes while the volume uses 1.5 dashes", () => {
    const result = computeBatch([ingredient({ amountValue: 0.5, amountUnit: "dash" })], {
      servings: 3,
      scope: "everything",
      unit: "ml",
      dilutionLevel: "none",
      locale: "en",
    });
    expect(result.lines[0].count).toEqual({ value: 2, maxValue: null, unit: "dash" });
    expect(result.lines[0].amountMl).toBeCloseTo(1.5 * 0.616115, 9);
  });

  it("dilutes dash volume like any volume line", () => {
    const result = computeBatch([bitters], {
      servings: 25,
      scope: "everything",
      unit: "ml",
      dilutionLevel: "20",
      locale: "en",
    });
    expect(result.waterLine?.amountMl).toBeCloseTo(30.80575 * 0.2, 6);
  });

  it("scales 3 drops × 10 to 30 drops, outside the total and dilution base", () => {
    const result = computeBatch(
      [gin, ingredient({ ingredientId: "saline", amountValue: 3, amountUnit: "drop" })],
      { servings: 10, scope: "everything", unit: "oz", dilutionLevel: "20", locale: "en" },
    );
    expect(result.lines[1]).toMatchObject({
      state: "counted",
      count: { value: 30, maxValue: null, unit: "drop" },
      approxAmount: null,
      amountMl: null,
    });
    expect(result.waterLine?.amountMl).toBeCloseTo(20 * 29.5735 * 0.2, 6);
  });

  it("scales 1/2 Lime × 25 to 12.5 and leaves a 1/3 Baileys share unscaled", () => {
    const result = computeBatch(
      [
        ingredient({
          ingredientId: "lime",
          amountValue: 0.5,
          amountUnit: "each",
          category: "citrus",
        }),
        ingredient({
          ingredientId: "baileys",
          measure: "1/3",
          amountValue: 1 / 3,
          amountUnit: "each",
          category: "liqueur",
        }),
        ingredient({
          ingredientId: "mystery",
          measure: "1",
          amountValue: 1,
          amountUnit: "each",
          category: null,
        }),
      ],
      { servings: 25, scope: "everything", unit: "oz", dilutionLevel: "none", locale: "en" },
    );
    expect(result.lines[0]).toMatchObject({
      state: "counted",
      count: { value: 12.5, maxValue: null, unit: "each" },
    });
    expect(result.lines[1]).toMatchObject({ state: "unscaled", measure: "1/3", count: null });
    expect(result.lines[2]).toMatchObject({ state: "unscaled", measure: "1" });
    expect(result.totalDisplayAmount).toBeNull();
  });

  it("follows the scope presets and Custom selection like volume lines", () => {
    const lime = ingredient({
      ingredientId: "lime",
      amountValue: 1,
      amountUnit: "each",
      category: "citrus",
    });
    const exceptCitrus = computeBatch([gin, bitters, lime], {
      servings: 2,
      scope: "except_citrus",
      unit: "oz",
      dilutionLevel: "none",
      locale: "en",
    });
    expect(exceptCitrus.lines.map((l) => l.state)).toEqual(["normal", "normal", "excluded"]);

    const custom = computeBatch([gin, bitters, lime], {
      servings: 2,
      scope: "custom",
      unit: "oz",
      dilutionLevel: "none",
      locale: "en",
      customSelectedIds: new Set(["gin", "lime"]),
    });
    expect(custom.lines.map((l) => l.state)).toEqual(["normal", "excluded", "counted"]);
  });

  it("flags an unclassified drop under Alcohol only, still as a count", () => {
    const result = computeBatch(
      [
        gin,
        ingredient({ ingredientId: "drop", amountValue: 2, amountUnit: "drop", category: null }),
      ],
      { servings: 2, scope: "alcohol_only", unit: "oz", dilutionLevel: "none", locale: "en" },
    );
    expect(result.lines[1]).toMatchObject({
      state: "uncategorized",
      count: { value: 4, maxValue: null, unit: "drop" },
      amountMl: null,
    });
  });

  it("gives a shooter share no Custom checkbox", () => {
    expect(isBatchableIngredient(bitters)).toBe(true);
    expect(
      isBatchableIngredient(
        ingredient({ amountValue: 0.5, amountUnit: "each", category: "spirit" }),
      ),
    ).toBe(false);
  });
});

describe("computeBatch", () => {
  it("scales every ingredient by servings and totals in the selected unit (AC-2, AC-7)", () => {
    const result = computeBatch(
      [ingredient({ ingredientId: "rum", amountValue: 2, amountUnit: "oz" })],
      { servings: 50, scope: "everything", unit: "oz", dilutionLevel: "none", locale: "en" },
    );

    // 2 oz * 50 servings = 100 oz, unrounded ml pipeline round trips back to 100.0 oz.
    expect(result.lines[0].displayAmount).toBe("100 oz");
    expect(result.totalDisplayAmount).toBe("100 oz");
  });

  it("agrees with a single serving at servings = 1 with no dilution", () => {
    const result = computeBatch([ingredient({ amountValue: 1.5, amountUnit: "oz" })], {
      servings: 1,
      scope: "everything",
      unit: "ml",
      dilutionLevel: "none",
      locale: "en",
    });

    // 1.5 oz -> ml
    expect(result.lines[0].displayAmount).toBe("44.4 ml");
  });

  it("shows an unparseable line unscaled and flagged, excluded from the total (AC-3)", () => {
    const result = computeBatch(
      [
        ingredient({ ingredientId: "rum", amountValue: 1, amountUnit: "oz" }),
        ingredient({
          ingredientId: "bitters",
          name: "Bitters",
          measure: "2 Dashes",
          amountValue: null,
          amountUnit: null,
          category: null,
        }),
      ],
      { servings: 10, scope: "everything", unit: "oz", dilutionLevel: "none", locale: "en" },
    );

    const bittersLine = result.lines.find((l) => l.ingredientId === "bitters")!;
    expect(bittersLine.state).toBe("unscaled");
    expect(bittersLine.measure).toBe("2 Dashes");
    expect(bittersLine.amountMl).toBeNull();
    // Total only reflects the rum line (1 oz * 10 = 10 oz), bitters excluded.
    expect(result.totalDisplayAmount).toBe("10 oz");
  });

  it("alcohol only scope includes spirit/liqueur, excludes other categories, includes null flagged (AC-4)", () => {
    const result = computeBatch(
      [
        ingredient({ ingredientId: "rum", category: "spirit" }),
        ingredient({ ingredientId: "lime", name: "Lime", category: "citrus" }),
        ingredient({ ingredientId: "mystery", name: "Mystery", category: null }),
      ],
      { servings: 1, scope: "alcohol_only", unit: "oz", dilutionLevel: "none", locale: "en" },
    );

    const byId = Object.fromEntries(result.lines.map((l) => [l.ingredientId, l]));
    expect(byId.rum.state).toBe("normal");
    expect(byId.lime.state).toBe("excluded");
    expect(byId.mystery.state).toBe("uncategorized");
  });

  it("except citrus scope excludes only citrus, includes null flagged (AC-4)", () => {
    const result = computeBatch(
      [
        ingredient({ ingredientId: "rum", category: "spirit" }),
        ingredient({ ingredientId: "lime", name: "Lime", category: "citrus" }),
        ingredient({ ingredientId: "mystery", name: "Mystery", category: null }),
      ],
      { servings: 1, scope: "except_citrus", unit: "oz", dilutionLevel: "none", locale: "en" },
    );

    const byId = Object.fromEntries(result.lines.map((l) => [l.ingredientId, l]));
    expect(byId.rum.state).toBe("normal");
    expect(byId.lime.state).toBe("excluded");
    expect(byId.mystery.state).toBe("uncategorized");
  });

  it("custom selection excludes unchecked ingredients entirely (AC-5)", () => {
    const result = computeBatch(
      [
        ingredient({ ingredientId: "rum", category: "spirit" }),
        ingredient({ ingredientId: "lime", name: "Lime", category: "citrus" }),
      ],
      {
        servings: 1,
        scope: "custom",
        unit: "oz",
        dilutionLevel: "none",
        locale: "en",
        customSelectedIds: new Set(["rum"]),
      },
    );

    const byId = Object.fromEntries(result.lines.map((l) => [l.ingredientId, l]));
    expect(byId.rum.state).toBe("normal");
    expect(byId.lime.state).toBe("excluded");
  });

  it("bases dilution on every included line, not only alcohol (spec 0035 AC-5)", () => {
    const lines = [
      ingredient({ ingredientId: "rum", amountValue: 60, amountUnit: "oz", category: "spirit" }),
      ingredient({
        ingredientId: "lime",
        name: "Lime",
        amountValue: 30,
        amountUnit: "oz",
        category: "citrus",
      }),
    ];

    const everything = computeBatch(lines, {
      servings: 1,
      scope: "everything",
      unit: "oz",
      dilutionLevel: "20",
      locale: "en",
    });
    expect(everything.waterLine?.displayAmount).toBe("18 oz");
    expect(everything.totalDisplayAmount).toBe("108 oz");
    expect(everything.nothingToDiluteNote).toBe(false);

    const alcoholOnly = computeBatch(lines, {
      servings: 1,
      scope: "alcohol_only",
      unit: "oz",
      dilutionLevel: "20",
      locale: "en",
    });
    expect(alcoholOnly.waterLine?.displayAmount).toBe("12 oz");
  });

  it("shows the nothing to dilute note when every line is unchecked (spec 0035 AC-5)", () => {
    const result = computeBatch([ingredient({ ingredientId: "rum", category: "spirit" })], {
      servings: 1,
      scope: "custom",
      unit: "oz",
      dilutionLevel: "20",
      locale: "en",
      customSelectedIds: new Set(),
    });

    expect(result.waterLine).toBeNull();
    expect(result.nothingToDiluteNote).toBe(true);
    expect(result.totalDisplayAmount).toBeNull();
  });

  it("dilutes a batch with no alcohol at all (spec 0035 AC-5)", () => {
    const result = computeBatch(
      [ingredient({ ingredientId: "juice", amountValue: 10, amountUnit: "oz", category: "other" })],
      { servings: 1, scope: "everything", unit: "oz", dilutionLevel: "15", locale: "en" },
    );

    expect(result.waterLine?.displayAmount).toBe("1.5 oz");
    expect(result.nothingToDiluteNote).toBe(false);
  });

  it("adds no water line for a custom 0 percent dilution", () => {
    const result = computeBatch([ingredient()], {
      servings: 1,
      scope: "everything",
      unit: "oz",
      dilutionLevel: "custom",
      locale: "en",
      customDilutionPercent: 0,
    });

    expect(result.waterLine).toBeNull();
    expect(result.nothingToDiluteNote).toBe(false);
  });

  it("computes the total from unrounded ml, not the sum of already rounded per line displays (AC-7)", () => {
    // Two lines whose individual oz displays round to the same tenth but
    // whose unrounded ml sum differs from summing the rounded oz values.
    const result = computeBatch(
      [
        ingredient({ ingredientId: "a", amountValue: 0.351, amountUnit: "oz", category: "other" }),
        ingredient({ ingredientId: "b", amountValue: 0.351, amountUnit: "oz", category: "other" }),
      ],
      { servings: 1, scope: "everything", unit: "oz", dilutionLevel: "none", locale: "en" },
    );

    // Each line rounds to "0.4 oz" individually; the true unrounded total is
    // 0.702 oz, which rounds to "0.7 oz", not "0.8 oz" (0.4 + 0.4).
    expect(result.lines[0].displayAmount).toBe("0.4 oz");
    expect(result.lines[1].displayAmount).toBe("0.4 oz");
    expect(result.totalDisplayAmount).toBe("0.7 oz");
  });
});

describe("parts (spec 0035 AC-3, AC-4)", () => {
  const part = (ingredientId: string, amountValue: number): BatchIngredientInput =>
    ingredient({
      ingredientId,
      name: ingredientId,
      measure: `${amountValue} parts`,
      amountValue,
      amountUnit: "part",
      category: "other",
    });
  const afterglow = [part("grenadine", 1), part("orange", 4), part("pineapple", 1)];

  it("scales part lines by part size and servings", () => {
    const result = computeBatch(afterglow, {
      servings: 10,
      scope: "everything",
      unit: "oz",
      dilutionLevel: "none",
      locale: "en",
      partSize: { value: 1, unit: "oz" },
    });

    expect(result.lines.map((l) => l.displayAmount)).toEqual(["10 oz", "40 oz", "10 oz"]);
    expect(result.totalDisplayAmount).toBe("60 oz");
  });

  it("uses a ml part size and includes part lines in the dilution base", () => {
    const result = computeBatch(afterglow, {
      servings: 1,
      scope: "everything",
      unit: "ml",
      dilutionLevel: "20",
      locale: "en",
      partSize: { value: 30, unit: "ml" },
    });

    expect(result.lines.map((l) => l.displayAmount)).toEqual(["30 ml", "120 ml", "30 ml"]);
    expect(result.waterLine?.displayAmount).toBe("36 ml");
  });

  it("leaves part lines unscaled when no part size is given", () => {
    const result = computeBatch(afterglow, {
      servings: 1,
      scope: "everything",
      unit: "oz",
      dilutionLevel: "none",
      locale: "en",
    });

    expect(result.lines.every((l) => l.state === "unscaled")).toBe(true);
  });

  it("follows scope presets by category like volume lines", () => {
    const result = computeBatch(
      [
        ingredient({ ingredientId: "gin", amountValue: 2, amountUnit: "part", category: "spirit" }),
        ingredient({
          ingredientId: "lime",
          amountValue: 1,
          amountUnit: "part",
          category: "citrus",
        }),
      ],
      {
        servings: 1,
        scope: "except_citrus",
        unit: "oz",
        dilutionLevel: "none",
        locale: "en",
        partSize: { value: 1, unit: "oz" },
      },
    );

    expect(result.lines.map((l) => l.state)).toEqual(["normal", "excluded"]);
  });

  it("validates the part size range per unit family", () => {
    expect(validatePartSize("1", "oz")).toBe(1);
    expect(validatePartSize("0.25", "oz")).toBe(0.25);
    expect(validatePartSize("4", "oz")).toBe(4);
    expect(validatePartSize("5", "oz")).toBeNull();
    expect(validatePartSize("0.2", "oz")).toBeNull();
    expect(validatePartSize("30", "ml")).toBe(30);
    expect(validatePartSize("4", "ml")).toBeNull();
    expect(validatePartSize("121", "ml")).toBeNull();
    expect(validatePartSize("", "ml")).toBeNull();
    expect(validatePartSize("abc", "oz")).toBeNull();
  });

  it("converts a part size between families with pourable rounding and clamping", () => {
    expect(convertPartSize(1, "oz", "ml")).toBe(30);
    expect(convertPartSize(1.5, "oz", "ml")).toBe(44);
    expect(convertPartSize(30, "ml", "oz")).toBe(1);
    expect(convertPartSize(44, "ml", "oz")).toBe(1.5);
    expect(convertPartSize(5, "ml", "oz")).toBe(0.25);
    expect(convertPartSize(120, "ml", "oz")).toBe(4);
    expect(convertPartSize(4, "oz", "ml")).toBe(118);
    expect(convertPartSize(2, "oz", "oz")).toBe(2);
  });

  it("carries the part size input across a family switch, resetting an invalid value", () => {
    expect(partSizeInputForUnit("1", "oz", "ml", "en")).toBe("30");
    expect(partSizeInputForUnit("30", "ml", "oz", "en")).toBe("1");
    expect(partSizeInputForUnit("abc", "oz", "ml", "en")).toBe("30");
    expect(partSizeInputForUnit("9", "oz", "ml", "en")).toBe("30");
    expect(partSizeInputForUnit("", "ml", "oz", "en")).toBe("1");
    expect(partSizeInputForUnit("2.5", "oz", "oz", "en")).toBe("2.5");
  });

  it("picks the part size family from the batch unit", () => {
    expect(partSizeUnitFor("oz")).toBe("oz");
    expect(partSizeUnitFor("ml")).toBe("ml");
    expect(partSizeUnitFor("cl")).toBe("ml");
    expect(partSizeUnitFor("l")).toBe("ml");
  });

  it("shows the batch control for a parts only recipe but no toggle", () => {
    expect(hasScalableIngredient(afterglow)).toBe(true);
    expect(hasVolumeIngredient(afterglow)).toBe(false);
    expect(hasPartIngredient(afterglow)).toBe(true);
    expect(hasVolumeIngredient([...afterglow, ingredient()])).toBe(true);
    expect(hasPartIngredient([ingredient()])).toBe(false);
  });
});

describe("formatBatchAmount (spec 0035 AC-6, AC-7)", () => {
  it("rounds oz, ml, and cl to the tenth and l to the thousandth, trimming zeros", () => {
    expect(formatBatchAmount(29.5735 * 2.5, "oz", "en")).toBe("2.5 oz");
    expect(formatBatchAmount(44.36025, "ml", "en")).toBe("44.4 ml");
    expect(formatBatchAmount(44.36025, "cl", "en")).toBe("4.4 cl");
    expect(formatBatchAmount(2500, "l", "en")).toBe("2.5 l");
    expect(formatBatchAmount(1000, "l", "en")).toBe("1 l");
    expect(formatBatchAmount(1234.56, "l", "en")).toBe("1.235 l");
  });

  it("never shows a nonzero amount as 0", () => {
    expect(formatBatchAmount(0.616115, "l", "en")).toBe("0.001 l");
    expect(formatBatchAmount(0.2, "l", "en")).toBe("< 0.001 l");
    expect(formatBatchAmount(0.04, "ml", "en")).toBe("< 0.1 ml");
    expect(formatBatchAmount(0.4, "cl", "en")).toBe("< 0.1 cl");
    expect(formatBatchAmount(1, "oz", "en")).toBe("< 0.1 oz");
  });

  it("batches a 1/8 tsp line and a 1 L line in liters", () => {
    const result = computeBatch(
      [
        ingredient({
          ingredientId: "salt",
          amountValue: 0.125,
          amountUnit: "tsp",
          category: "other",
        }),
        ingredient({ ingredientId: "soda", amountValue: 1, amountUnit: "l", category: "other" }),
      ],
      { servings: 1, scope: "everything", unit: "l", dilutionLevel: "none", locale: "en" },
    );

    expect(result.lines.map((l) => l.displayAmount)).toEqual(["0.001 l", "1 l"]);
    expect(result.totalDisplayAmount).toBe("1.001 l");
  });
});

describe("formatBatchRange (spec 0054 AC-5)", () => {
  const ML_PER_OZ = 29.5735;

  it("joins two different ends with an en dash and the unit once", () => {
    expect(formatBatchRange(20 * ML_PER_OZ, 30 * ML_PER_OZ, "oz", "en")).toBe("20–30 oz");
  });

  it("shows one value when both ends round alike", () => {
    expect(formatBatchRange(1, 1.2, "l", "en")).toBe("0.001 l");
  });

  it("keeps a floored low end's < sign", () => {
    expect(formatBatchRange(0.5, 2 * ML_PER_OZ, "oz", "en")).toBe("< 0.1–2 oz");
  });
});

describe("batch counts (spec 0054 AC-5)", () => {
  it("rounds each end on its own and shows one value when they match", () => {
    expect(batchCount(0.5, 1, "dash")).toEqual({ value: 1, maxValue: null, unit: "dash" });
    expect(batchCount(50, 75, "dash")).toEqual({ value: 50, maxValue: 75, unit: "dash" });
  });

  it("writes a range as low–high and picks the plural by the high end", () => {
    const count = batchCount(1, 2, "dash");
    expect(batchCountText(count, "en")).toBe("1–2");
    expect(batchCountPluralValue(count)).toBe(2);
    expect(batchCountText(batchCount(25, null, "each"), "en")).toBe("25");
  });
});

describe("computeBatch ranges (spec 0054 AC-5)", () => {
  const gin = ingredient({
    ingredientId: "gin",
    measure: "2-3 oz",
    amountValue: 2,
    amountMaxValue: 3,
    amountUnit: "oz",
  });
  const lime = ingredient({
    ingredientId: "lime",
    measure: "1 oz",
    amountValue: 1,
    amountUnit: "oz",
    category: "citrus",
  });

  it("batches a range line, its water, and its total at both ends", () => {
    const result = computeBatch([gin, lime], {
      servings: 10,
      scope: "everything",
      unit: "oz",
      dilutionLevel: "20",
      locale: "en",
    });

    expect(result.lines[0].displayAmount).toBe("20–30 oz");
    expect(result.lines[1].displayAmount).toBe("10 oz");
    expect(result.waterLine?.displayAmount).toBe("6–8 oz");
    expect(result.totalDisplayAmount).toBe("36–48 oz");
  });

  it("looks exactly as before with no range line", () => {
    const result = computeBatch([lime], {
      servings: 10,
      scope: "everything",
      unit: "oz",
      dilutionLevel: "20",
      locale: "en",
    });

    expect(result.waterLine).toEqual({
      displayAmount: "2 oz",
      amountMl: expect.closeTo(2 * 29.5735, 6),
      amountMlMax: null,
    });
    expect(result.totalDisplayAmount).toBe("12 oz");
  });

  it("scales a dash range as a count range with a ≈ range", () => {
    const result = computeBatch(
      [
        gin,
        ingredient({
          ingredientId: "bitters",
          amountValue: 2,
          amountMaxValue: 3,
          amountUnit: "dash",
          category: "other",
        }),
      ],
      { servings: 25, scope: "everything", unit: "oz", dilutionLevel: "none", locale: "en" },
    );

    expect(result.lines[1].count).toEqual({ value: 50, maxValue: 75, unit: "dash" });
    expect(result.lines[1].approxAmount).toBe("1–1.6 oz");
  });

  it("floors both ends of a 1/2-1 dash range to one dash", () => {
    const result = computeBatch(
      [
        gin,
        ingredient({
          ingredientId: "bitters",
          amountValue: 0.5,
          amountMaxValue: 1,
          amountUnit: "dash",
          category: "other",
        }),
      ],
      { servings: 1, scope: "everything", unit: "oz", dilutionLevel: "none", locale: "en" },
    );

    expect(result.lines[1].count).toEqual({ value: 1, maxValue: null, unit: "dash" });
    expect(result.lines[1].approxAmount).toBeNull();
  });

  it("scales a part range at the part size, and leaves it unscaled without one", () => {
    const parts = ingredient({
      ingredientId: "gin",
      measure: "2-3 parts",
      amountValue: 2,
      amountMaxValue: 3,
      amountUnit: "part",
    });
    const options = {
      servings: 10,
      scope: "everything",
      unit: "oz",
      dilutionLevel: "none",
      locale: "en",
    } as const;

    expect(
      computeBatch([parts], { ...options, partSize: { value: 1, unit: "oz" } }).lines[0]
        .displayAmount,
    ).toBe("20–30 oz");
    expect(computeBatch([parts], options).lines[0]).toMatchObject({
      state: "unscaled",
      measure: "2-3 parts",
    });
  });

  it("excludes a citrus range under Alcohol only", () => {
    const citrusRange = ingredient({
      ingredientId: "lime",
      amountValue: 1,
      amountMaxValue: 2,
      amountUnit: "oz",
      category: "citrus",
    });
    const result = computeBatch([gin, citrusRange], {
      servings: 1,
      scope: "alcohol_only",
      unit: "oz",
      dilutionLevel: "none",
      locale: "en",
    });

    expect(result.lines[1].state).toBe("excluded");
    expect(result.totalDisplayAmount).toBe("2–3 oz");
  });

  it("treats a stored max at or below the value as a single amount", () => {
    const result = computeBatch(
      [ingredient({ amountValue: 2, amountMaxValue: 2, amountUnit: "oz" })],
      { servings: 1, scope: "everything", unit: "oz", dilutionLevel: "none", locale: "en" },
    );

    expect(result.lines[0].displayAmount).toBe("2 oz");
    expect(result.lines[0].amountMlMax).toBeNull();
  });

  it("counts a range line toward the toggle, the part input, and the batch control", () => {
    expect(hasVolumeIngredient([gin])).toBe(true);
    expect(hasScalableIngredient([gin])).toBe(true);
    expect(
      hasPartIngredient([ingredient({ amountValue: 2, amountMaxValue: 3, amountUnit: "part" })]),
    ).toBe(true);
  });
});

describe("locale aware batch numbers (spec 0055 AC-2, AC-9)", () => {
  const ML_PER_OZ = 29.5735;
  const GROUP_SPACE = "[\s\u202f\u00a0]";

  it("writes amounts and the floor text with the locale's decimal separator", () => {
    expect(formatBatchAmount(44.36025, "ml", "fr")).toBe("44,4 ml");
    expect(formatBatchAmount(1234.56, "l", "pt")).toBe("1,235 l");
    expect(formatBatchAmount(1, "oz", "fr")).toBe("< 0,1 oz");
    expect(formatBatchAmount(0.2, "l", "es")).toBe("< 0,001 l");
    expect(formatBatchAmount(44.36025, "ml", "ja")).toBe("44.4 ml");
  });

  it("groups thousands by the locale's rule, the only change in en", () => {
    expect(formatBatchAmount(30000, "ml", "en")).toBe("30,000 ml");
    expect(formatBatchAmount(30000, "ml", "fr")).toMatch(new RegExp(`^30${GROUP_SPACE}000 ml$`));
    expect(formatBatchAmount(30000, "ml", "ru")).toMatch(new RegExp(`^30${GROUP_SPACE}000 ml$`));
    expect(formatBatchAmount(15000, "ml", "es")).toBe("15.000 ml");
    expect(formatBatchAmount(999, "ml", "en")).toBe("999 ml");
  });

  it("keeps a floored low end's < sign in a comma locale range", () => {
    expect(formatBatchRange(0.5, 2 * ML_PER_OZ, "oz", "fr")).toBe("< 0,1–2 oz");
    expect(formatBatchRange(1.5 * ML_PER_OZ, 2.5 * ML_PER_OZ, "oz", "es")).toBe("1,5–2,5 oz");
  });

  it("writes a half each count as 0,5", () => {
    expect(batchCountText(batchCount(0.25, null, "each"), "fr")).toBe("0,5");
    expect(batchCountText(batchCount(1.5, 2.5, "each"), "pt")).toBe("1,5–2,5");
    expect(batchCountText(batchCount(1.5, 2.5, "each"), "en")).toBe("1.5–2.5");
  });

  it("formats every computeBatch amount, range, water line, and total in fr", () => {
    const result = computeBatch(
      [
        ingredient({ ingredientId: "gin", amountValue: 1.5 }),
        ingredient({
          ingredientId: "lime",
          amountValue: 0.5,
          amountMaxValue: 0.75,
          category: "citrus",
        }),
        ingredient({
          ingredientId: "cherry",
          amountValue: 0.25,
          amountUnit: "each",
          category: "citrus",
        }),
      ],
      { servings: 1, scope: "everything", unit: "ml", dilutionLevel: "20", locale: "fr" },
    );

    expect(result.lines.map((line) => line.displayAmount)).toEqual([
      "44,4 ml",
      "14,8–22,2 ml",
      null,
    ]);
    expect(batchCountText(result.lines[2].count!, "fr")).toBe("0,5");
    expect(result.waterLine?.displayAmount).toBe("11,8–13,3 ml");
    expect(result.totalDisplayAmount).toBe("71–79,8 ml");
  });

  it("gives the same numbers in en apart from the separator", () => {
    const result = computeBatch([ingredient({ amountValue: 1.5 })], {
      servings: 1,
      scope: "everything",
      unit: "ml",
      dilutionLevel: "20",
      locale: "en",
    });

    expect(result.lines[0].displayAmount).toBe("44.4 ml");
    expect(result.waterLine?.displayAmount).toBe("8.9 ml");
    expect(result.totalDisplayAmount).toBe("53.2 ml");
  });
});

describe("locale aware part size and dilution inputs (spec 0055 AC-6, AC-7)", () => {
  it("reads a comma or a dot as the decimal point", () => {
    expect(validatePartSize("0,75", "oz")).toBe(0.75);
    expect(validatePartSize("0.75", "oz")).toBe(0.75);
    expect(validateCustomDilutionPercent("18,5")).toBe(18.5);
  });

  it("rejects two separators, a sign, and non Latin digits", () => {
    expect(validatePartSize("1,5,0", "oz")).toBeNull();
    expect(validatePartSize("1.5.0", "oz")).toBeNull();
    expect(validatePartSize("१,५", "oz")).toBeNull();
    expect(validateCustomDilutionPercent("-1,5")).toBeNull();
  });

  it("writes the converted part size with the locale's separator and reads it back", () => {
    expect(partSizeInputForUnit("30", "ml", "oz", "fr")).toBe("1");
    expect(partSizeInputForUnit("22", "ml", "oz", "fr")).toBe("0,75");
    expect(partSizeInputForUnit("22", "ml", "oz", "en")).toBe("0.75");
    // Fed back, "0,75" converts instead of resetting to the 30 ml default.
    expect(partSizeInputForUnit("0,75", "oz", "ml", "fr")).toBe("22");
  });
});
