import { describe, expect, it } from "vitest";
import {
  computeBatch,
  convertPartSize,
  formatBatchAmount,
  hasConvertibleIngredient,
  hasPartIngredient,
  hasVolumeIngredient,
  partSizeInputForUnit,
  partSizeUnitFor,
  validatePartSize,
  validateCustomDilutionPercent,
  validateServings,
  type BatchIngredientInput,
} from "./batch";

function ingredient(overrides: Partial<BatchIngredientInput> = {}): BatchIngredientInput {
  return {
    ingredientId: "rum",
    name: "Rum",
    measure: "1 oz",
    amountValue: 1,
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

describe("hasConvertibleIngredient", () => {
  it("is true when at least one ingredient has a parsed amount", () => {
    expect(hasConvertibleIngredient([ingredient()])).toBe(true);
  });

  it("is false when every ingredient is unparseable", () => {
    expect(hasConvertibleIngredient([ingredient({ amountValue: null, amountUnit: null })])).toBe(
      false,
    );
  });
});

describe("computeBatch", () => {
  it("scales every ingredient by servings and totals in the selected unit (AC-2, AC-7)", () => {
    const result = computeBatch(
      [ingredient({ ingredientId: "rum", amountValue: 2, amountUnit: "oz" })],
      { servings: 50, scope: "everything", unit: "oz", dilutionLevel: "none" },
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
      { servings: 10, scope: "everything", unit: "oz", dilutionLevel: "none" },
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
      { servings: 1, scope: "alcohol_only", unit: "oz", dilutionLevel: "none" },
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
      { servings: 1, scope: "except_citrus", unit: "oz", dilutionLevel: "none" },
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
    });
    expect(everything.waterLine?.displayAmount).toBe("18 oz");
    expect(everything.totalDisplayAmount).toBe("108 oz");
    expect(everything.nothingToDiluteNote).toBe(false);

    const alcoholOnly = computeBatch(lines, {
      servings: 1,
      scope: "alcohol_only",
      unit: "oz",
      dilutionLevel: "20",
    });
    expect(alcoholOnly.waterLine?.displayAmount).toBe("12 oz");
  });

  it("shows the nothing to dilute note when every line is unchecked (spec 0035 AC-5)", () => {
    const result = computeBatch([ingredient({ ingredientId: "rum", category: "spirit" })], {
      servings: 1,
      scope: "custom",
      unit: "oz",
      dilutionLevel: "20",
      customSelectedIds: new Set(),
    });

    expect(result.waterLine).toBeNull();
    expect(result.nothingToDiluteNote).toBe(true);
    expect(result.totalDisplayAmount).toBeNull();
  });

  it("dilutes a batch with no alcohol at all (spec 0035 AC-5)", () => {
    const result = computeBatch(
      [ingredient({ ingredientId: "juice", amountValue: 10, amountUnit: "oz", category: "other" })],
      { servings: 1, scope: "everything", unit: "oz", dilutionLevel: "15" },
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
      { servings: 1, scope: "everything", unit: "oz", dilutionLevel: "none" },
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
    expect(partSizeInputForUnit("1", "oz", "ml")).toBe("30");
    expect(partSizeInputForUnit("30", "ml", "oz")).toBe("1");
    expect(partSizeInputForUnit("abc", "oz", "ml")).toBe("30");
    expect(partSizeInputForUnit("9", "oz", "ml")).toBe("30");
    expect(partSizeInputForUnit("", "ml", "oz")).toBe("1");
    expect(partSizeInputForUnit("2.5", "oz", "oz")).toBe("2.5");
  });

  it("picks the part size family from the batch unit", () => {
    expect(partSizeUnitFor("oz")).toBe("oz");
    expect(partSizeUnitFor("ml")).toBe("ml");
    expect(partSizeUnitFor("cl")).toBe("ml");
    expect(partSizeUnitFor("l")).toBe("ml");
  });

  it("shows the batch control for a parts only recipe but no toggle", () => {
    expect(hasConvertibleIngredient(afterglow)).toBe(true);
    expect(hasVolumeIngredient(afterglow)).toBe(false);
    expect(hasPartIngredient(afterglow)).toBe(true);
    expect(hasVolumeIngredient([...afterglow, ingredient()])).toBe(true);
    expect(hasPartIngredient([ingredient()])).toBe(false);
  });
});

describe("formatBatchAmount (spec 0035 AC-6, AC-7)", () => {
  it("rounds oz, ml, and cl to the tenth and l to the thousandth, trimming zeros", () => {
    expect(formatBatchAmount(29.5735 * 2.5, "oz")).toBe("2.5 oz");
    expect(formatBatchAmount(44.36025, "ml")).toBe("44.4 ml");
    expect(formatBatchAmount(44.36025, "cl")).toBe("4.4 cl");
    expect(formatBatchAmount(2500, "l")).toBe("2.5 l");
    expect(formatBatchAmount(1000, "l")).toBe("1 l");
    expect(formatBatchAmount(1234.56, "l")).toBe("1.235 l");
  });

  it("never shows a nonzero amount as 0", () => {
    expect(formatBatchAmount(0.616115, "l")).toBe("0.001 l");
    expect(formatBatchAmount(0.2, "l")).toBe("< 0.001 l");
    expect(formatBatchAmount(0.04, "ml")).toBe("< 0.1 ml");
    expect(formatBatchAmount(0.4, "cl")).toBe("< 0.1 cl");
    expect(formatBatchAmount(1, "oz")).toBe("< 0.1 oz");
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
      { servings: 1, scope: "everything", unit: "l", dilutionLevel: "none" },
    );

    expect(result.lines.map((l) => l.displayAmount)).toEqual(["0.001 l", "1 l"]);
    expect(result.totalDisplayAmount).toBe("1.001 l");
  });
});
