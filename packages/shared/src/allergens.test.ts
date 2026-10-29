import { describe, expect, it } from "vitest";
import { summarizeRecipeAllergens, toAllergenList, type AllergenIngredient } from "./allergens";

const ingredient = (
  name: string,
  allergens: AllergenIngredient["allergens"],
): AllergenIngredient => ({
  name,
  allergens,
});

describe("summarizeRecipeAllergens", () => {
  it("lists each allergen with its source ingredient, in ALLERGENS order", () => {
    const summary = summarizeRecipeAllergens([
      ingredient("Orgeat", ["tree_nuts"]),
      ingredient("Egg white", ["egg"]),
      ingredient("Lime juice", []),
    ]);

    expect(summary).toEqual({
      status: "present",
      isComplete: true,
      entries: [
        { allergen: "egg", ingredientNames: ["Egg white"] },
        { allergen: "tree_nuts", ingredientNames: ["Orgeat"] },
      ],
    });
  });

  it("reports none when every ingredient is reviewed with no allergens", () => {
    expect(summarizeRecipeAllergens([ingredient("Gin", []), ingredient("Ice", [])])).toEqual({
      status: "none",
      isComplete: true,
      entries: [],
    });
  });

  it("is incomplete when one ingredient is not reviewed, keeping the known entries", () => {
    const summary = summarizeRecipeAllergens([
      ingredient("Baileys", ["milk"]),
      ingredient("Mystery liqueur", null),
    ]);

    expect(summary.isComplete).toBe(false);
    expect(summary.status).toBe("present");
    expect(summary.entries).toEqual([{ allergen: "milk", ingredientNames: ["Baileys"] }]);
  });

  it("is incomplete with no ingredients", () => {
    expect(summarizeRecipeAllergens([])).toEqual({
      status: "none",
      isComplete: false,
      entries: [],
    });
  });

  it("lists ingredients sharing an allergen together in recipe order, without duplicates", () => {
    const summary = summarizeRecipeAllergens([
      ingredient("Dry vermouth", ["sulfites"]),
      ingredient("Champagne", ["sulfites"]),
      ingredient("Dry vermouth", ["sulfites"]),
    ]);

    expect(summary.entries).toEqual([
      { allergen: "sulfites", ingredientNames: ["Dry vermouth", "Champagne"] },
    ]);
  });
});

describe("toAllergenList", () => {
  it("keeps null as not reviewed and drops unknown values", () => {
    expect(toAllergenList(null)).toBeNull();
    expect(toAllergenList(undefined)).toBeNull();
    expect(toAllergenList(["egg", "nope", 3])).toEqual(["egg"]);
    expect(toAllergenList([])).toEqual([]);
  });
});
