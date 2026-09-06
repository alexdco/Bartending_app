export interface RecipeIngredients {
  recipeId: string;
  ingredientIds: string[];
}

export interface PantryMatch {
  recipeId: string;
  missingIngredientIds: string[];
}

export function matchPantryToRecipes(
  pantryIngredientIds: string[],
  recipes: RecipeIngredients[]
): PantryMatch[] {
  const pantrySet = new Set(pantryIngredientIds);

  return recipes
    .map((recipe) => ({
      recipeId: recipe.recipeId,
      missingIngredientIds: recipe.ingredientIds.filter((id) => !pantrySet.has(id)),
    }))
    .sort((a, b) => a.missingIngredientIds.length - b.missingIngredientIds.length);
}
