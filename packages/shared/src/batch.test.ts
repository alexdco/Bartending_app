import { describe, expect, it } from "vitest";
import {
  computeBatch,
  hasConvertibleIngredient,
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

  it("adds a dilution water line computed from the included alcohol base (AC-6, AC-7)", () => {
    const result = computeBatch(
      [ingredient({ ingredientId: "rum", amountValue: 100, amountUnit: "oz", category: "spirit" })],
      { servings: 1, scope: "everything", unit: "oz", dilutionLevel: "20" },
    );

    expect(result.waterLine?.displayAmount).toBe("20 oz");
    expect(result.totalDisplayAmount).toBe("120 oz");
    expect(result.noAlcoholNote).toBe(false);
  });

  it("adds no water line and a note when no alcohol is in the current scope/selection (AC-6)", () => {
    const result = computeBatch([ingredient({ ingredientId: "rum", category: "spirit" })], {
      servings: 1,
      scope: "custom",
      unit: "oz",
      dilutionLevel: "20",
      customSelectedIds: new Set(), // rum unchecked
    });

    expect(result.waterLine).toBeNull();
    expect(result.noAlcoholNote).toBe(true);
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
