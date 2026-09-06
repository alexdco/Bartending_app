import { describe, expect, it } from "vitest";
import { matchPantryToRecipes, type RecipeIngredients } from "./pantryMatching";

describe("matchPantryToRecipes", () => {
  it("returns no missing ingredients when the pantry fully covers a recipe", () => {
    const recipes: RecipeIngredients[] = [
      { recipeId: "mojito", ingredientIds: ["rum", "lime", "mint"] },
    ];

    const result = matchPantryToRecipes(["rum", "lime", "mint"], recipes);

    expect(result).toEqual([
      { recipeId: "mojito", missingIngredientIds: [] },
    ]);
  });

  it("lists only the ingredients not present in the pantry", () => {
    const recipes: RecipeIngredients[] = [
      { recipeId: "mojito", ingredientIds: ["rum", "lime", "mint"] },
    ];

    const result = matchPantryToRecipes(["rum"], recipes);

    expect(result[0].missingIngredientIds).toEqual(["lime", "mint"]);
  });

  it("sorts recipes ascending by fewest missing ingredients", () => {
    const recipes: RecipeIngredients[] = [
      { recipeId: "daiquiri", ingredientIds: ["rum", "lime", "sugar"] },
      { recipeId: "rum-and-coke", ingredientIds: ["rum", "cola"] },
      { recipeId: "old-fashioned", ingredientIds: ["whiskey", "bitters", "sugar", "orange"] },
    ];

    const result = matchPantryToRecipes(["rum", "cola"], recipes);

    expect(result.map((r) => r.recipeId)).toEqual([
      "rum-and-coke",
      "daiquiri",
      "old-fashioned",
    ]);
  });

  it("returns an empty array when there are no recipes", () => {
    const result = matchPantryToRecipes(["rum"], []);

    expect(result).toEqual([]);
  });

  it("treats an empty pantry as missing every ingredient in every recipe", () => {
    const recipes: RecipeIngredients[] = [
      { recipeId: "mojito", ingredientIds: ["rum", "lime", "mint"] },
    ];

    const result = matchPantryToRecipes([], recipes);

    expect(result[0].missingIngredientIds).toEqual(["rum", "lime", "mint"]);
  });

  it("treats a recipe with no ingredients as always fully matched", () => {
    const recipes: RecipeIngredients[] = [
      { recipeId: "water", ingredientIds: [] },
    ];

    const result = matchPantryToRecipes([], recipes);

    expect(result).toEqual([{ recipeId: "water", missingIngredientIds: [] }]);
  });

  it("does not count pantry ingredients the recipe does not need as reducing its missing count", () => {
    const recipes: RecipeIngredients[] = [
      { recipeId: "martini", ingredientIds: ["gin", "vermouth"] },
    ];

    const result = matchPantryToRecipes(
      ["gin", "cola", "orange-juice", "vodka"],
      recipes
    );

    expect(result[0].missingIngredientIds).toEqual(["vermouth"]);
  });

  it("does not mutate the input recipes array or its ingredient lists", () => {
    const recipes: RecipeIngredients[] = [
      { recipeId: "mojito", ingredientIds: ["rum", "lime", "mint"] },
    ];
    const pantry = ["rum"];

    matchPantryToRecipes(pantry, recipes);

    expect(recipes).toEqual([
      { recipeId: "mojito", ingredientIds: ["rum", "lime", "mint"] },
    ]);
    expect(pantry).toEqual(["rum"]);
  });
});
