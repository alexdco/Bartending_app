import { describe, expect, it } from "vitest";
import {
  checkGarnish,
  checkIdea,
  nameEntryOutsideRecipe,
  stapleNamesOutsidePantry,
  usesOnlyAvailableIngredients,
  type IdeaIngredient,
  type RawDrinkIdea,
} from "./idea-checks";

const pantry = ["Vodka", "Lime Juice", "Simple Syrup"] as const;
const staples = ["Ice", "Water"] as const;

const ingredient = (source_name: string): IdeaIngredient => ({
  name: source_name.toLowerCase(),
  source_name,
  amount: "30 ml",
});

const idea = (overrides: Partial<RawDrinkIdea> = {}): RawDrinkIdea => ({
  ingredients: [ingredient("Vodka"), ingredient("Lime Juice"), ingredient("Simple Syrup")],
  name_source_names: ["Vodka", "Lime Juice"],
  name: "Lime Vodka Sour",
  garnish: { name: "lime wheel", source_name: "Lime" },
  steps: ["Shake with ice.", "Strain into a chilled glass."],
  ...overrides,
});

describe("checkIdea", () => {
  it("passes an honest idea, labels the outside garnish, and strips name_source_names", () => {
    const result = checkIdea(idea(), pantry, staples);
    expect(result).toEqual({
      ok: true,
      idea: {
        name: "Lime Vodka Sour",
        ingredients: idea().ingredients,
        garnish: { name: "lime wheel", source_name: "Lime", in_pantry: false },
        steps: idea().steps,
      },
    });
    expect(result.ok && "name_source_names" in result.idea).toBe(false);
  });

  it("rejects a name that mentions a mixer the recipe does not use", () => {
    const result = checkIdea(
      idea({ name: "Lime Vodka Soda", name_source_names: ["Vodka", "Soda Water"] }),
      pantry,
      staples,
    );
    expect(result).toEqual({ ok: false, reason: "name_mismatch", offending: "Soda Water" });
  });

  it("passes a mood name with an empty name_source_names", () => {
    const result = checkIdea(
      idea({ name: "Midnight Smash", name_source_names: [] }),
      pantry,
      staples,
    );
    expect(result.ok).toBe(true);
  });

  it("ignores blank name_source_names entries", () => {
    const result = checkIdea(idea({ name_source_names: ["", "   ", "Vodka"] }), pantry, staples);
    expect(result.ok).toBe(true);
  });

  it("does not count the garnish as a recipe ingredient for the name", () => {
    const result = checkIdea(idea({ name_source_names: ["Lime"] }), pantry, staples);
    expect(result).toEqual({ ok: false, reason: "name_mismatch", offending: "Lime" });
  });

  it("reports pantry_mismatch when an attempt fails both checks", () => {
    const result = checkIdea(
      idea({
        ingredients: [ingredient("Vodka"), ingredient("Tonic Water")],
        name_source_names: ["Soda Water"],
      }),
      pantry,
      staples,
    );
    expect(result).toEqual({ ok: false, reason: "pantry_mismatch" });
  });

  it("turns a blank garnish into null instead of failing", () => {
    const result = checkIdea(idea({ garnish: { name: " ", source_name: "" } }), pantry, staples);
    expect(result.ok && result.idea.garnish).toBeNull();
  });
});

describe("nameEntryOutsideRecipe", () => {
  const recipe = [ingredient("Vodka"), ingredient("Lime Juice")];

  it("matches across case and spacing differences", () => {
    expect(nameEntryOutsideRecipe(["  vodka ", "LIME   juice"], recipe)).toBeNull();
  });

  it("allows duplicate entries", () => {
    expect(nameEntryOutsideRecipe(["Vodka", "Vodka"], recipe)).toBeNull();
  });

  it("returns the first offending entry, trimmed", () => {
    expect(nameEntryOutsideRecipe(["Vodka", " Tonic Water ", "Soda Water"], recipe)).toBe(
      "Tonic Water",
    );
  });
});

describe("checkGarnish", () => {
  it("marks a staple garnish as in the pantry", () => {
    expect(checkGarnish({ name: "ice sphere", source_name: "Ice" }, pantry, staples)).toEqual({
      name: "ice sphere",
      source_name: "Ice",
      in_pantry: true,
    });
  });

  it("marks a pantry garnish as in the pantry, across case and spacing", () => {
    expect(
      checkGarnish({ name: "a drop", source_name: " simple  SYRUP " }, pantry, staples)?.in_pantry,
    ).toBe(true);
  });

  it("marks an outside garnish as not in the pantry", () => {
    expect(
      checkGarnish({ name: "mint sprig", source_name: "Mint" }, pantry, staples)?.in_pantry,
    ).toBe(false);
  });

  it("folds a trailing plural s on the garnish side", () => {
    expect(
      checkGarnish({ name: "lime wheels", source_name: "Limes" }, ["Lime"], [])?.in_pantry,
    ).toBe(true);
  });

  it("folds a trailing plural s on the pantry side", () => {
    expect(checkGarnish({ name: "olive", source_name: "Olive" }, ["Olives"], [])?.in_pantry).toBe(
      true,
    );
  });

  it("folds a trailing plural es", () => {
    expect(
      checkGarnish({ name: "peach slice", source_name: "Peaches" }, ["Peach"], [])?.in_pantry,
    ).toBe(true);
  });

  it("returns null for null, a blank name, or a blank source name", () => {
    expect(checkGarnish(null, pantry, staples)).toBeNull();
    expect(checkGarnish({ name: "", source_name: "Lime" }, pantry, staples)).toBeNull();
    expect(checkGarnish({ name: "lime wheel", source_name: "  " }, pantry, staples)).toBeNull();
  });

  it("trims the garnish it returns", () => {
    expect(checkGarnish({ name: " lime wheel ", source_name: " Lime " }, [], [])).toEqual({
      name: "lime wheel",
      source_name: "Lime",
      in_pantry: false,
    });
  });
});

describe("usesOnlyAvailableIngredients", () => {
  it("accepts pantry and staple ingredients", () => {
    expect(
      usesOnlyAvailableIngredients([ingredient("Vodka"), ingredient("Ice")], pantry, staples),
    ).toBe(true);
  });

  it("rejects an ingredient outside the pantry and staples", () => {
    expect(
      usesOnlyAvailableIngredients(
        [ingredient("Vodka"), ingredient("Soda Water")],
        pantry,
        staples,
      ),
    ).toBe(false);
  });

  it("rejects an idea made of staples only", () => {
    expect(
      usesOnlyAvailableIngredients([ingredient("Ice"), ingredient("Water")], pantry, staples),
    ).toBe(false);
  });
});

describe("stapleNamesOutsidePantry", () => {
  it("drops staples the pantry already lists", () => {
    expect(stapleNamesOutsidePantry(["Ice", "Water"], ["vodka", " ICE "])).toEqual(["Water"]);
  });
});
