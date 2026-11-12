import { describe, expect, it } from "vitest";
import { requiredPluralForms } from "./pluralForms";

describe("requiredPluralForms", () => {
  it.each([
    ["en", ["one", "other"]],
    ["es", ["one", "other"]],
    ["pt", ["one", "other"]],
    ["fr", ["one", "other"]],
    ["ru", ["one", "few", "many", "other"]],
    ["ja", ["other"]],
  ] as const)("%s needs %j", (locale, forms) => {
    expect(requiredPluralForms(locale)).toEqual(forms);
  });

  it("reads ordinal rules when asked", () => {
    expect(requiredPluralForms("en", "ordinal")).toEqual(["one", "two", "few", "other"]);
  });
});
