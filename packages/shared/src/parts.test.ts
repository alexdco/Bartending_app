import { describe, expect, it } from "vitest";
import { computeParts, type PartsIngredientInput } from "./parts";

function line(
  ingredientId: string,
  measure: string | null,
  amountValue: number | null,
  amountUnit: PartsIngredientInput["amountUnit"],
  amountMaxValue: number | null = null,
): PartsIngredientInput {
  return { ingredientId, name: ingredientId, measure, amountValue, amountMaxValue, amountUnit };
}

describe("computeParts ranges (spec 0054 AC-6)", () => {
  it("shows a range line as its measure text and leaves it out of the ratio", () => {
    const result = computeParts([
      line("gin", "2-3 oz", 2, "oz", 3),
      line("lime", "1 oz", 1, "oz"),
      line("syrup", "1/2 oz", 0.5, "oz"),
    ]);

    expect(result.map((l) => [l.state, l.parts])).toEqual([
      ["unscaled", null],
      ["normal", 2],
      ["normal", 1],
    ]);
    expect(result[0].measure).toBe("2-3 oz");
  });

  it("keeps a parts recipe in parts when one line is a part range", () => {
    const result = computeParts([
      line("gin", "2-3 parts", 2, "part", 3),
      line("vermouth", "1 part", 1, "part"),
    ]);

    expect(result.map((l) => [l.state, l.parts])).toEqual([
      ["unscaled", null],
      ["normal", 1],
    ]);
  });
});

describe("computeParts (spec 0035 AC-10)", () => {
  it("shows stored part counts directly for a parts only recipe", () => {
    const result = computeParts([
      line("orange", "4 parts", 4, "part"),
      line("grenadine", "1 part", 1, "part"),
      line("pineapple", "1 part", 1, "part"),
    ]);

    expect(result.map((l) => l.parts)).toEqual([4, 1, 1]);
  });

  it("rounds a part count to two decimals with no quarter rounding", () => {
    const result = computeParts([
      line("gin", "1/3 part", 1 / 3, "part"),
      line("tonic", "2 parts", 2, "part"),
    ]);

    expect(result.map((l) => l.parts)).toEqual([0.33, 2]);
  });

  it("keeps unparsed lines unscaled in a parts only recipe", () => {
    const result = computeParts([
      line("orange", "2 parts", 2, "part"),
      line("bitters", "2 dashes", null, null),
    ]);

    expect(result[1].state).toBe("unscaled");
    expect(result[1].measure).toBe("2 dashes");
  });

  it("shows part lines as text in a mixed recipe and ratios volume lines alone", () => {
    const result = computeParts([
      line("gin", "2 oz", 2, "oz"),
      line("lime", "1 oz", 1, "oz"),
      line("syrup", "1 part", 1, "part"),
    ]);

    expect(result.map((l) => l.state)).toEqual(["normal", "normal", "unscaled"]);
    expect(result.map((l) => l.parts)).toEqual([2, 1, null]);
    expect(result[2].measure).toBe("1 part");
  });
});
