import { describe, expect, it } from "vitest";
import type { TheCocktailDbDrink } from "./theCocktailDb";
import { transformDrink } from "./transform";

function makeDrink(overrides: Partial<TheCocktailDbDrink> = {}): TheCocktailDbDrink {
  return {
    idDrink: "11007",
    strDrink: "Margarita",
    strInstructions: "Rub the rim of the glass with the lime slice.",
    strDrinkThumb: "https://www.thecocktaildb.com/images/media/drink/margarita.jpg",
    strCategory: "Ordinary Drink",
    strGlass: "Cocktail glass",
    strAlcoholic: "Alcoholic",
    strTags: "IBA,ContemporaryClassic",
    strIBA: "Contemporary Classics",
    strIngredient1: "Tequila",
    strMeasure1: "1 1/2 oz ",
    strIngredient2: "Triple sec",
    strMeasure2: "1/2 oz ",
    strIngredient3: "Lime juice",
    strMeasure3: "1 oz ",
    strIngredient4: null,
    strMeasure4: null,
    ...overrides,
  };
}

describe("transformDrink", () => {
  describe("recipe fields", () => {
    // covers: AC-1, AC-6 (source_id is the stable upsert key)
    it("maps the TheCocktailDB drink onto our recipe row, keyed by idDrink", () => {
      const { recipe } = transformDrink(makeDrink());

      expect(recipe).toEqual({
        sourceId: "11007",
        name: "Margarita",
        instructions: "Rub the rim of the glass with the lime slice.",
        imageUrl: "https://www.thecocktaildb.com/images/media/drink/margarita.jpg",
        glass: "Cocktail glass",
        alcoholicStatus: "alcoholic",
        iba: "Contemporary Classics",
      });
    });

    it("stores a missing or empty image as null", () => {
      expect(transformDrink(makeDrink({ strDrinkThumb: null })).recipe.imageUrl).toBeNull();
      expect(transformDrink(makeDrink({ strDrinkThumb: "" })).recipe.imageUrl).toBeNull();
    });

    it("trims glass and IBA, and stores blank values as null", () => {
      const trimmed = transformDrink(
        makeDrink({ strGlass: "  Highball glass ", strIBA: " Unforgettables " }),
      );
      const blank = transformDrink(makeDrink({ strGlass: "   ", strIBA: null }));

      expect(trimmed.recipe.glass).toBe("Highball glass");
      expect(trimmed.recipe.iba).toBe("Unforgettables");
      expect(blank.recipe.glass).toBeNull();
      expect(blank.recipe.iba).toBeNull();
    });
  });

  describe("alcoholic status", () => {
    it.each([
      ["Alcoholic", "alcoholic"],
      ["Non alcoholic", "non_alcoholic"],
      ["Non_Alcoholic", "non_alcoholic"],
      ["Optional", "optional"],
    ] as const)("maps %j to %j", (raw, expected) => {
      expect(transformDrink(makeDrink({ strAlcoholic: raw })).recipe.alcoholicStatus).toBe(
        expected,
      );
    });

    it("falls back to unknown when the field is absent, empty, or unrecognised", () => {
      expect(transformDrink(makeDrink({ strAlcoholic: null })).recipe.alcoholicStatus).toBe(
        "unknown",
      );
      expect(transformDrink(makeDrink({ strAlcoholic: "" })).recipe.alcoholicStatus).toBe(
        "unknown",
      );
      expect(transformDrink(makeDrink({ strAlcoholic: "alcoholic" })).recipe.alcoholicStatus).toBe(
        "unknown",
      );
    });
  });

  describe("ingredients", () => {
    // covers: AC-1 (detail page orders ingredients by sort_order)
    it("uses the 1 based strIngredientN position as sortOrder", () => {
      const { ingredients } = transformDrink(makeDrink());

      expect(ingredients.map((i) => [i.ingredientName, i.sortOrder])).toEqual([
        ["Tequila", 1],
        ["Triple sec", 2],
        ["Lime juice", 3],
      ]);
    });

    it("skips empty, blank, and null slots but keeps the original position of later ones", () => {
      const { ingredients } = transformDrink(
        makeDrink({
          strIngredient2: "   ",
          strMeasure2: "1 oz",
          strIngredient3: null,
          strIngredient5: "Salt",
          strMeasure5: null,
        }),
      );

      expect(ingredients.map((i) => [i.ingredientName, i.sortOrder])).toEqual([
        ["Tequila", 1],
        ["Salt", 5],
      ]);
    });

    it("reads all 15 positions and nothing past them", () => {
      const { ingredients } = transformDrink(
        makeDrink({ strIngredient15: "Bitters", strIngredient16: "Ignored" }),
      );

      expect(ingredients.at(-1)).toMatchObject({ ingredientName: "Bitters", sortOrder: 15 });
      expect(ingredients.some((i) => i.ingredientName === "Ignored")).toBe(false);
    });

    it("trims ingredient names and measures", () => {
      const { ingredients } = transformDrink(
        makeDrink({ strIngredient1: "  Tequila  ", strMeasure1: "  2 oz  " }),
      );

      expect(ingredients[0]).toMatchObject({ ingredientName: "Tequila", measure: "2 oz" });
    });

    it("stores a missing or blank measure as null with no parsed amount", () => {
      const { ingredients } = transformDrink(makeDrink({ strMeasure1: null, strMeasure2: "   " }));

      expect(ingredients[0]).toMatchObject({ measure: null, amountValue: null, amountUnit: null });
      expect(ingredients[1]).toMatchObject({ measure: null, amountValue: null, amountUnit: null });
    });

    it("parses a recognised measure into a numeric amount and unit", () => {
      const { ingredients } = transformDrink(makeDrink());

      expect(ingredients[0]).toMatchObject({
        measure: "1 1/2 oz",
        amountValue: 1.5,
        amountUnit: "oz",
      });
    });

    it("keeps an unparseable measure as display text with no parsed amount", () => {
      const { ingredients } = transformDrink(makeDrink({ strMeasure1: "Top up" }));

      expect(ingredients[0]).toMatchObject({
        measure: "Top up",
        amountValue: null,
        amountUnit: null,
      });
    });
  });

  describe("tags", () => {
    // covers: AC-5 (tags come from strTags plus strCategory)
    it("splits strTags on commas and appends the category", () => {
      const { tags } = transformDrink(makeDrink());

      expect(tags).toEqual([
        { tagName: "IBA" },
        { tagName: "ContemporaryClassic" },
        { tagName: "Ordinary Drink" },
      ]);
    });

    it("trims tag names and drops empty entries", () => {
      const { tags } = transformDrink(
        makeDrink({ strTags: " Sour , ,Classic,", strCategory: "  Cocktail " }),
      );

      expect(tags).toEqual([{ tagName: "Sour" }, { tagName: "Classic" }, { tagName: "Cocktail" }]);
    });

    // covers: AC-6 (no duplicate recipe_tags rows from one source drink)
    it("removes duplicates, including a category that repeats a tag", () => {
      const { tags } = transformDrink(
        makeDrink({ strTags: "Classic,Classic,Cocktail", strCategory: "Cocktail" }),
      );

      expect(tags).toEqual([{ tagName: "Classic" }, { tagName: "Cocktail" }]);
    });

    it("returns no tags when both strTags and strCategory are missing or blank", () => {
      expect(transformDrink(makeDrink({ strTags: null, strCategory: null })).tags).toEqual([]);
      expect(transformDrink(makeDrink({ strTags: "", strCategory: "  " })).tags).toEqual([]);
    });

    it("uses only the category when strTags is missing", () => {
      const { tags } = transformDrink(makeDrink({ strTags: null }));

      expect(tags).toEqual([{ tagName: "Ordinary Drink" }]);
    });
  });

  it("does not mutate the input drink", () => {
    const drink = makeDrink({ strIngredient1: "  Tequila " });
    const snapshot = structuredClone(drink);

    transformDrink(drink);

    expect(drink).toEqual(snapshot);
  });
});
