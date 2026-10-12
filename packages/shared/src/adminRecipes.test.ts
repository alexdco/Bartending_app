import { describe, expect, it } from "vitest";
import { toAdminIngredientPayload } from "./adminRecipes";

describe("toAdminIngredientPayload (spec 0035 AC-8)", () => {
  it("parses each measure into amount_value and amount_unit", () => {
    expect(
      toAdminIngredientPayload([
        { name: " Rum ", measure: " 1 1/2 oz " },
        { name: "Bitters", measure: "2 dashes" },
        { name: "Mint", measure: null },
      ]),
    ).toEqual([
      { name: "Rum", measure: "1 1/2 oz", sortOrder: 0, amount_value: 1.5, amount_unit: "oz" },
      { name: "Bitters", measure: "2 dashes", sortOrder: 1, amount_value: null, amount_unit: null },
      { name: "Mint", measure: null, sortOrder: 2, amount_value: null, amount_unit: null },
    ]);
  });

  it("gives identical amounts when an unchanged recipe is saved again", () => {
    const form = [{ name: "Gin", measure: "3 parts" }];
    expect(toAdminIngredientPayload(form)).toEqual(toAdminIngredientPayload(form));
  });
});
