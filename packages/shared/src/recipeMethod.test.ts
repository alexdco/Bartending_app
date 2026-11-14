import { describe, expect, it } from "vitest";
import { RECIPE_METHODS, toRecipeMethod } from "./recipes";
import { methodColumnsUpdate } from "./methodAndAliasClassification";

describe("toRecipeMethod (spec 0054 AC-8)", () => {
  it("keeps each of the five methods", () => {
    expect(RECIPE_METHODS.map(toRecipeMethod)).toEqual([
      "shake",
      "stir",
      "build",
      "blend",
      "layer",
    ]);
  });

  it("narrows anything else to null", () => {
    expect([null, undefined, "", "Shake", "swizzle", 3].map(toRecipeMethod)).toEqual([
      null,
      null,
      null,
      null,
      null,
      null,
    ]);
  });
});

describe("methodColumnsUpdate (spec 0054 AC-8)", () => {
  it("writes a classified method with source classifier", () => {
    expect(methodColumnsUpdate(null, "stir")).toEqual({
      method: "stir",
      method_source: "classifier",
    });
    expect(methodColumnsUpdate("classifier", "shake")).toEqual({
      method: "shake",
      method_source: "classifier",
    });
  });

  it("clears both columns on a null result for a classifier or empty row", () => {
    expect(methodColumnsUpdate("classifier", null)).toEqual({ method: null, method_source: null });
    expect(methodColumnsUpdate(null, null)).toEqual({ method: null, method_source: null });
  });

  it("never touches an admin pick", () => {
    expect(methodColumnsUpdate("admin", "shake")).toEqual({});
    expect(methodColumnsUpdate("admin", null)).toEqual({});
  });
});
