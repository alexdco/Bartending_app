import type { RecipeDetail } from "@bartendingapp/shared";

function recipeCategory(alcoholicStatus: string): string {
  if (alcoholicStatus === "alcoholic") {
    return "Cocktail";
  }
  if (alcoholicStatus === "non_alcoholic") {
    return "Mocktail";
  }
  return "Drink";
}

export function buildRecipeJsonLd(recipe: RecipeDetail, canonicalUrl: string) {
  if (!recipe.imageUrl) {
    return null;
  }

  return {
    "@context": "https://schema.org",
    "@type": "Recipe",
    name: recipe.name,
    image: [recipe.imageUrl],
    url: canonicalUrl,
    recipeIngredient: recipe.ingredients.map((ingredient) =>
      ingredient.measure ? `${ingredient.measure} ${ingredient.name}` : ingredient.name,
    ),
    recipeInstructions: recipe.instructions,
    recipeCategory: recipeCategory(recipe.alcoholicStatus),
  };
}
