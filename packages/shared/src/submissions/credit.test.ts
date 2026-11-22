import { describe, expect, it } from "vitest";
import { toRecipeCredit } from "./credit";

describe("toRecipeCredit (spec 0064 AC-16)", () => {
  it("credits nobody on catalog and admin recipes", () => {
    expect(toRecipeCredit(false, "Sam")).toBeNull();
    expect(toRecipeCredit(undefined, null)).toBeNull();
  });

  it("credits the author's current display name", () => {
    expect(toRecipeCredit(true, " Sam ")).toEqual({ kind: "named", name: "Sam" });
  });

  it("falls back to a community member when the name is gone", () => {
    expect(toRecipeCredit(true, null)).toEqual({ kind: "community" });
    expect(toRecipeCredit(true, "  ")).toEqual({ kind: "community" });
  });
});
