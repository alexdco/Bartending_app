import { describe, expect, it } from "vitest";
import {
  canSaveSelection,
  escapeLikePattern,
  selectionFromAllergens,
  toggleAllergen,
  toggleNone,
} from "./adminIngredients";

describe("selectionFromAllergens", () => {
  it("shows nothing checked for a row not reviewed yet", () => {
    expect(selectionFromAllergens(null)).toEqual({ none: false, allergens: [] });
  });

  it("turns none on for a reviewed row with no allergens", () => {
    expect(selectionFromAllergens([])).toEqual({ none: true, allergens: [] });
  });

  it("checks the stored allergens", () => {
    expect(selectionFromAllergens(["milk"])).toEqual({ none: false, allergens: ["milk"] });
  });
});

describe("toggleAllergen and toggleNone (spec 0043 AC-11)", () => {
  it("turns none off when an allergen is checked, keeping ALLERGENS order", () => {
    const selection = toggleAllergen(
      toggleAllergen({ none: true, allergens: [] }, "sulfites"),
      "egg",
    );
    expect(selection).toEqual({ none: false, allergens: ["egg", "sulfites"] });
  });

  it("unchecks a checked allergen", () => {
    expect(toggleAllergen({ none: false, allergens: ["egg", "milk"] }, "egg")).toEqual({
      none: false,
      allergens: ["milk"],
    });
  });

  it("clears every allergen when none is checked", () => {
    expect(toggleNone({ none: false, allergens: ["egg", "milk"] })).toEqual({
      none: true,
      allergens: [],
    });
  });
});

describe("canSaveSelection", () => {
  it("allows saving only a reviewed state", () => {
    expect(canSaveSelection({ none: false, allergens: [] })).toBe(false);
    expect(canSaveSelection({ none: true, allergens: [] })).toBe(true);
    expect(canSaveSelection({ none: false, allergens: ["egg"] })).toBe(true);
  });
});

describe("escapeLikePattern", () => {
  it("escapes %, _, and backslash", () => {
    expect(escapeLikePattern("100%_a\\b")).toBe("100\\%\\_a\\\\b");
  });
});
