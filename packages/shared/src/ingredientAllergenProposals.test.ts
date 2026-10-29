import { describe, expect, it } from "vitest";
import {
  sortByName,
  toIngredientAllergenPayload,
  validateIngredientAllergenProposals,
} from "./ingredientAllergenProposals";

const orgeat = {
  id: "0b6c3f5e-7d0a-4c1e-9f6a-1a2b3c4d5e6f",
  name: "Orgeat",
  allergens: ["tree_nuts"],
  reasons: { tree_nuts: "Almond syrup." },
};
const gin = {
  id: "1c7d4a6f-8e1b-4d2f-8a7b-2b3c4d5e6f70",
  name: "Gin",
  allergens: [],
  reasons: {},
};

describe("validateIngredientAllergenProposals", () => {
  it("accepts a good file, including an empty list as reviewed, none", () => {
    const result = validateIngredientAllergenProposals([orgeat, gin]);
    expect(result.ok).toBe(true);
  });

  it("rejects an unknown allergen", () => {
    const result = validateIngredientAllergenProposals([{ ...orgeat, allergens: ["almond"] }]);
    expect(result.ok).toBe(false);
  });

  it("rejects a null list and a null element", () => {
    expect(validateIngredientAllergenProposals([{ ...gin, allergens: null }]).ok).toBe(false);
    expect(
      validateIngredientAllergenProposals([{ ...orgeat, allergens: ["tree_nuts", null] }]).ok,
    ).toBe(false);
  });

  it("rejects a flag with no reason, a repeated flag, and a duplicate id", () => {
    const result = validateIngredientAllergenProposals([
      { ...orgeat, allergens: ["tree_nuts", "tree_nuts", "milk"] },
      { ...orgeat },
    ]);
    expect(result).toEqual({
      ok: false,
      errors: [
        `${orgeat.id}: appears more than once`,
        `${orgeat.id} (Orgeat): "tree_nuts" is listed twice`,
        `${orgeat.id} (Orgeat): "milk" has no reason`,
      ],
    });
  });
});

describe("toIngredientAllergenPayload", () => {
  it("sends only id and allergens", () => {
    const result = validateIngredientAllergenProposals([orgeat]);
    if (!result.ok) throw new Error("expected a valid file");
    expect(toIngredientAllergenPayload(result.proposals)).toEqual([
      { id: orgeat.id, allergens: ["tree_nuts"] },
    ]);
  });
});

describe("sortByName", () => {
  it("orders by name", () => {
    expect(sortByName([orgeat, gin]).map((row) => row.name)).toEqual(["Gin", "Orgeat"]);
  });
});
