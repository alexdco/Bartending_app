import { describe, expect, it } from "vitest";
import { findDuplicateRecipes, normalizeRecipeNameForMatch } from "./duplicates";

const recipe = (id: string, name: string, baseName = name) => ({ id, name, baseName });

describe("normalizeRecipeNameForMatch", () => {
  it("lowercases, trims, and strips accents", () => {
    expect(normalizeRecipeNameForMatch("  Piña Colada ")).toBe("pina colada");
    expect(normalizeRecipeNameForMatch("CAFÉ BRÛLOT")).toBe("cafe brulot");
  });

  it("keeps Japanese voicing marks", () => {
    expect(normalizeRecipeNameForMatch("ジントニック")).toBe("ジントニック");
    expect(normalizeRecipeNameForMatch("ジン")).not.toBe(normalizeRecipeNameForMatch("シン"));
  });
});

describe("findDuplicateRecipes", () => {
  const candidates = [
    recipe("1", "Margarita"),
    recipe("2", "Margarita picante", "Spicy Margarita"),
    recipe("3", "モヒート", "Mojito"),
  ];

  it("matches the localized name ignoring case, accents, and spaces", () => {
    expect(findDuplicateRecipes(" margaríta ", candidates).map((r) => r.id)).toEqual(["1"]);
  });

  it("matches the English base name", () => {
    expect(findDuplicateRecipes("mojito", candidates).map((r) => r.id)).toEqual(["3"]);
    expect(findDuplicateRecipes("Spicy margarita", candidates).map((r) => r.id)).toEqual(["2"]);
  });

  it("ignores partial matches", () => {
    expect(findDuplicateRecipes("Marg", candidates)).toEqual([]);
  });

  it("returns nothing for a blank name", () => {
    expect(findDuplicateRecipes("   ", [recipe("x", "")])).toEqual([]);
  });
});
