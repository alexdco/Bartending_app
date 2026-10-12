import { describe, expect, it } from "vitest";
import { parseCatalogOverrides, type CatalogOverrides } from "./catalogOverridesSchema";
import {
  applyOverrides,
  findUnknownStaples,
  summarizeOverrides,
  validateOverrides,
} from "./overrides";
import type { TransformedDrink } from "./transform";

function makeDrink(
  sourceId: string,
  name: string,
  ingredientNames: string[] = ["Light rum", "Lime juice"],
  glass: string | null = "Highball Glass",
): TransformedDrink {
  return {
    recipe: {
      sourceId,
      name,
      instructions: `Build ${name} over ice.`,
      imageUrl: null,
      glass,
      alcoholicStatus: "alcoholic",
      iba: null,
    },
    ingredients: ingredientNames.map((ingredientName, index) => ({
      ingredientName,
      measure: "1 oz",
      sortOrder: index + 1,
      amountValue: 1,
      amountUnit: "oz",
    })),
    tags: [],
  };
}

function makeOverrides(partial: Partial<CatalogOverrides> = {}): CatalogOverrides {
  return { hide: {}, recipes: {}, unlistedIngredientSynonyms: {}, staples: [], ...partial };
}

const source = [
  makeDrink("11288", "Cuba Libre", ["Light rum", "Lime", "Coca-Cola"]),
  makeDrink("13751", "Cuba Libra", ["Light rum", "Lime", "Coca-Cola"]),
  makeDrink("11872", "Orgasm"),
  makeDrink("15941", "Americano", ["Campari", "Sweet Vermouth"], "highball glass"),
];

const overrides = makeOverrides({
  hide: {
    "13751": { reason: "duplicate", mergeInto: "11288" },
    "11872": { reason: "crude" },
  },
  recipes: {
    "15941": {
      addIngredients: [{ ingredientName: "soda water", measure: "1 oz" }],
      instructions: "Pour the Campari and vermouth over ice, top with soda water.",
    },
  },
  staples: ["Ice", "Water"],
});

describe("applyOverrides", () => {
  // covers: AC-1
  it("drops hidden ids and emits a merge only for duplicates", () => {
    const result = applyOverrides(source, overrides);
    expect(result.drinks.map((d) => d.recipe.sourceId)).toEqual(["11288", "15941"]);
    expect(result.merges).toEqual([{ fromSourceId: "13751", toSourceId: "11288" }]);
  });

  // covers: AC-6, AC-7
  it("canonicalizes glass and ingredient names", () => {
    const [cubaLibre] = applyOverrides(source, overrides).drinks;
    expect(cubaLibre?.recipe.glass).toBe("Highball glass");
    expect(cubaLibre?.ingredients.map((i) => i.ingredientName)).toEqual([
      "Light Rum",
      "Lime",
      "Coca-Cola",
    ]);
  });

  // covers: AC-9
  it("appends added ingredients after the last line and replaces instructions", () => {
    const americano = applyOverrides(source, overrides).drinks.find(
      (d) => d.recipe.sourceId === "15941",
    );
    expect(americano?.ingredients.at(-1)).toEqual({
      ingredientName: "Soda Water",
      measure: "1 oz",
      sortOrder: 3,
      amountValue: 1,
      amountUnit: "oz",
    });
    expect(americano?.recipe.instructions).toBe(
      "Pour the Campari and vermouth over ice, top with soda water.",
    );
    expect(americano?.recipe.instructionsOverride).toBe(true);
  });

  it("leaves instructions alone without an override", () => {
    const [cubaLibre] = applyOverrides(source, overrides).drinks;
    expect(cubaLibre?.recipe.instructionsOverride).toBe(false);
    expect(cubaLibre?.recipe.instructions).toBe("Build Cuba Libre over ice.");
  });

  // covers: AC-4
  it("changes nothing when run on its own output", () => {
    const once = applyOverrides(source, overrides);
    const twice = applyOverrides(once.drinks, overrides);
    expect(twice.drinks).toEqual(once.drinks);
  });

  it("reports glasses the map doesn't know", () => {
    const result = applyOverrides([makeDrink("1", "Tiki", ["Rum"], "TIKI Mug")], makeOverrides());
    expect(result.unknownGlasses).toEqual(["TIKI Mug"]);
    expect(result.drinks[0]?.recipe.glass).toBe("Tiki mug");
  });
});

describe("validateOverrides", () => {
  // covers: AC-12
  it("accepts a consistent file", () => {
    expect(validateOverrides(source, overrides)).toEqual({ errors: [], warnings: [] });
  });

  it("rejects a recipes key that isn't in the source", () => {
    const result = validateOverrides(
      source,
      makeOverrides({ recipes: { "99999": { reviewed: true } } }),
    );
    expect(result.errors).toEqual(["recipes.99999: not in the TheCocktailDB source"]);
  });

  it("rejects a merge target that isn't in the source", () => {
    const result = validateOverrides(
      source,
      makeOverrides({ hide: { "13751": { reason: "duplicate", mergeInto: "99999" } } }),
    );
    expect(result.errors).toEqual(["hide.13751: mergeInto 99999 is not in the source"]);
  });

  it("rejects a merge target that is itself hidden", () => {
    const result = validateOverrides(
      source,
      makeOverrides({
        hide: {
          "13751": { reason: "duplicate", mergeInto: "11872" },
          "11872": { reason: "crude" },
        },
      }),
    );
    expect(result.errors).toEqual(["hide.13751: mergeInto 11872 is itself hidden"]);
  });

  it("rejects a merge cycle", () => {
    const result = validateOverrides(
      source,
      makeOverrides({
        hide: {
          "13751": { reason: "duplicate", mergeInto: "11288" },
          "11288": { reason: "duplicate", mergeInto: "13751" },
        },
      }),
    );
    expect([...result.errors].sort()).toEqual([
      "hide.11288: merge cycle through 13751",
      "hide.13751: merge cycle through 11288",
    ]);
  });

  it("rejects an added ingredient the recipe already lists", () => {
    const result = validateOverrides(
      source,
      makeOverrides({
        recipes: { "15941": { addIngredients: [{ ingredientName: "campari", measure: null }] } },
      }),
    );
    expect(result.errors).toEqual([
      'recipes.15941: addIngredients names "campari", which Americano already lists',
    ]);
  });

  it("only warns about a hide key missing from the source", () => {
    const result = validateOverrides(
      source,
      makeOverrides({ hide: { "12345": { reason: "crude" } } }),
    );
    expect(result).toEqual({
      errors: [],
      warnings: ["hide.12345: not in the TheCocktailDB source, skipped"],
    });
  });
});

describe("parseCatalogOverrides", () => {
  it("rejects a duplicate without a merge target", () => {
    expect(() =>
      parseCatalogOverrides({
        hide: { "13751": { reason: "duplicate" } },
        recipes: {},
        unlistedIngredientSynonyms: {},
        staples: [],
      }),
    ).toThrow(/catalogOverrides.json is invalid/);
  });

  it("rejects a synonym key that isn't lowercased", () => {
    expect(() =>
      parseCatalogOverrides({
        hide: {},
        recipes: {},
        unlistedIngredientSynonyms: { Soda: "Soda Water" },
        staples: [],
      }),
    ).toThrow(/lowercased/);
  });
});

describe("findUnknownStaples", () => {
  it("returns staples that match no ingredient by normalized name", () => {
    expect(findUnknownStaples(["Ice", "Water", "Snow"], ["ice", " WATER "])).toEqual(["Snow"]);
  });
});

describe("summarizeOverrides", () => {
  it("counts what the overrides change", () => {
    const summary = summarizeOverrides(source, applyOverrides(source, overrides));
    expect(summary).toMatchObject({ hidden: 2, merges: 1, glassRenames: 2, fixes: 1 });
  });
});
