import { describe, expect, it } from "vitest";
import { canonicalJson, catalogSourceHash, sourceHash, type SourceHashInput } from "./sourceHash";

const base: SourceHashInput = {
  name: "Margarita",
  glass: "Cocktail glass",
  alcoholicStatus: "alcoholic",
  iba: "Contemporary Classics",
  ingredients: [
    { ingredientName: "Tequila", measure: "1 1/2 oz", sortOrder: 1 },
    { ingredientName: "Lime juice", measure: "1 oz", sortOrder: 2 },
  ],
  tags: [{ tagName: "IBA" }, { tagName: "Classic" }],
};

describe("canonicalJson", () => {
  it("ignores object key order at every level", () => {
    expect(canonicalJson({ b: 1, a: { d: [1, 2], c: null } })).toBe(
      canonicalJson({ a: { c: null, d: [1, 2] }, b: 1 }),
    );
  });

  it("keeps array order", () => {
    expect(canonicalJson([1, 2])).not.toBe(canonicalJson([2, 1]));
  });
});

describe("sourceHash (spec 0056 AC-5)", () => {
  it("is prefixed with the format version and a sha256 hex digest", () => {
    expect(sourceHash(base)).toMatch(/^v1:[0-9a-f]{64}$/);
  });

  it("is stable across key order, ingredient input order, and tag order", () => {
    const reordered: SourceHashInput = {
      tags: [{ tagName: "Classic" }, { tagName: "IBA" }],
      ingredients: [...base.ingredients].reverse(),
      iba: base.iba,
      alcoholicStatus: base.alcoholicStatus,
      glass: base.glass,
      name: base.name,
    };
    expect(sourceHash(reordered)).toBe(sourceHash(base));
  });

  it.each<[string, Partial<SourceHashInput>]>([
    ["name", { name: "Margarita!" }],
    ["glass", { glass: "Margarita glass" }],
    ["glass to null", { glass: null }],
    ["alcoholic status", { alcoholicStatus: "optional" }],
    ["iba", { iba: null }],
    ["instructions", { instructions: "Shake." }],
    ["a tag", { tags: [{ tagName: "IBA" }] }],
    [
      "a measure",
      {
        ingredients: [
          { ingredientName: "Tequila", measure: "2 oz", sortOrder: 1 },
          { ingredientName: "Lime juice", measure: "1 oz", sortOrder: 2 },
        ],
      },
    ],
    [
      "an ingredient",
      {
        ingredients: [
          { ingredientName: "Mezcal", measure: "1 1/2 oz", sortOrder: 1 },
          { ingredientName: "Lime juice", measure: "1 oz", sortOrder: 2 },
        ],
      },
    ],
    [
      "the ingredient order",
      {
        ingredients: [
          { ingredientName: "Tequila", measure: "1 1/2 oz", sortOrder: 2 },
          { ingredientName: "Lime juice", measure: "1 oz", sortOrder: 1 },
        ],
      },
    ],
  ])("changes when %s changes", (_label, change) => {
    expect(sourceHash({ ...base, ...change })).not.toBe(sourceHash(base));
  });
});

describe("catalogSourceHash", () => {
  const drink = {
    recipe: {
      name: "Margarita",
      instructions: "Rub the rim with salt.",
      instructionsOverride: false,
      glass: "Cocktail glass",
      alcoholicStatus: "alcoholic",
      iba: null,
    },
    ingredients: [{ ingredientName: "Tequila", measure: "2 oz", sortOrder: 1 }],
    tags: [],
  };

  it("ignores instructions the import would not write", () => {
    expect(
      catalogSourceHash({ ...drink, recipe: { ...drink.recipe, instructions: "Something else." } }),
    ).toBe(catalogSourceHash(drink));
  });

  it("hashes instructions an override replaces", () => {
    const overridden = { ...drink, recipe: { ...drink.recipe, instructionsOverride: true } };
    expect(catalogSourceHash(overridden)).not.toBe(catalogSourceHash(drink));
    expect(
      catalogSourceHash({
        ...overridden,
        recipe: { ...overridden.recipe, instructions: "Something else." },
      }),
    ).not.toBe(catalogSourceHash(overridden));
  });
});
