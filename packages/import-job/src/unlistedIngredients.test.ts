import { describe, expect, it } from "vitest";
import { findUnlistedIngredients, type ReportRecipe } from "./unlistedIngredients";

const catalogNames = [
  "Campari",
  "Sweet Vermouth",
  "Soda Water",
  "Lime",
  "Lime Juice",
  "Light Rum",
  "Rum",
  "Ice",
  "Water",
  "Orange Peel",
];

const americano: ReportRecipe = {
  sourceId: "15941",
  name: "Americano",
  instructions:
    "Pour the Campari and vermouth over ice into glass, add a splash of soda and garnish with half orange slice.",
  ingredientNames: ["Campari", "Sweet Vermouth", "Lemon Peel", "Orange Peel"],
};

describe("findUnlistedIngredients", () => {
  // covers: AC-8
  it("flags Americano for Soda Water through the soda synonym and skips ice", () => {
    const findings = findUnlistedIngredients([americano], catalogNames, { soda: "Soda Water" }, [
      "Ice",
      "Water",
    ]);
    expect(findings).toEqual([
      {
        sourceId: "15941",
        recipeName: "Americano",
        ingredientName: "Soda Water",
        matchedPhrase: "soda",
      },
    ]);
  });

  it("lets a longer name consume its text before a shorter one matches", () => {
    const recipe: ReportRecipe = {
      sourceId: "1",
      name: "Daiquiri",
      instructions: "Shake the rum with lime juice.",
      ingredientNames: ["Light Rum", "Lime Juice"],
    };
    expect(findUnlistedIngredients([recipe], catalogNames, {}, [])).toEqual([]);
  });

  it("counts a word inside a listed name as listed and allows a trailing s", () => {
    const recipe: ReportRecipe = {
      sourceId: "2",
      name: "Rum Punch",
      instructions: "Add the rum and two limes.",
      ingredientNames: ["Light Rum", "Lime"],
    };
    expect(findUnlistedIngredients([recipe], catalogNames, {}, [])).toEqual([]);
  });

  it("matches whole words only", () => {
    const recipe: ReportRecipe = {
      sourceId: "3",
      name: "Sublime",
      instructions: "Stir until sublime.",
      ingredientNames: ["Campari"],
    };
    expect(findUnlistedIngredients([recipe], catalogNames, {}, [])).toEqual([]);
  });

  it("never reports a staple, even through a synonym", () => {
    const recipe: ReportRecipe = {
      sourceId: "4",
      name: "Highball",
      instructions: "Fill with ice and a little water.",
      ingredientNames: ["Campari"],
    };
    expect(
      findUnlistedIngredients([recipe], catalogNames, { "still water": "Water" }, ["Ice", "Water"]),
    ).toEqual([]);
  });
});
