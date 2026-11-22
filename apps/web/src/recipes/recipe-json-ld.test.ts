import { describe, expect, it } from "vitest";
import type { RecipeDetail } from "@bartendingapp/shared";
import { buildRecipeJsonLd } from "./recipe-json-ld";

const recipeImage = "https://www.thecocktaildb.com/images/media/drink/margarita.jpg";
const commentPhotoUrl =
  "https://ctuzjhhpnkkhooneporu.supabase.co/storage/v1/object/public/comment-photos/u/p.jpg";

const recipe: RecipeDetail = {
  id: "d6aa9b01-16e2-49e9-a02b-5386edd831a8",
  name: "Margarita",
  baseName: "Margarita",
  instructions: "Shake with ice and strain.",
  imageUrl: recipeImage,
  alcoholicStatus: "alcoholic",
  glass: "Coupe",
  method: null,
  ingredients: [],
  flavorProfile: [],
  isFavorited: false,
  isCocktailDbRecipe: true,
  drinkStyle: null,
  drinkStyleNote: null,
  bartenderTip: null,
  presentationTip: null,
  mocktailSafe: false,
  credit: null,
};

describe("buildRecipeJsonLd", () => {
  // Spec 0032 AC-14: user comment photos never become a recipe's share card.
  it("uses only the recipe's own image, never a comment photo", () => {
    const recipeWithComments = {
      ...recipe,
      comments: [{ photos: [{ url: commentPhotoUrl, storagePath: "u/p.jpg" }] }],
    };

    const jsonLd = buildRecipeJsonLd(recipeWithComments, "https://example.com/recipes/margarita");

    expect(jsonLd?.image).toEqual([recipeImage]);
    expect(JSON.stringify(jsonLd)).not.toContain("comment-photos");
  });

  // Spec 0064 AC-16.
  it("credits a named community author as a Person", () => {
    const jsonLd = buildRecipeJsonLd(
      { ...recipe, credit: { kind: "named", name: "Sam" } },
      "https://example.com",
    );
    expect(jsonLd?.author).toEqual({ "@type": "Person", name: "Sam" });
  });

  it("has no author for catalog recipes or a deleted community author", () => {
    expect(buildRecipeJsonLd(recipe, "https://example.com")).not.toHaveProperty("author");
    expect(
      buildRecipeJsonLd({ ...recipe, credit: { kind: "community" } }, "https://example.com"),
    ).not.toHaveProperty("author");
  });

  it("emits nothing without a recipe image rather than falling back to another image", () => {
    expect(buildRecipeJsonLd({ ...recipe, imageUrl: null }, "https://example.com")).toBeNull();
  });
});
