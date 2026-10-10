import { describe, expect, it } from "vitest";
import { validateCommentBody } from "./comments";

describe("validateCommentBody", () => {
  it("trims and accepts text", () => {
    expect(validateCommentBody("  Great drink  ")).toEqual({ trimmed: "Great drink", error: null });
  });

  it("rejects blank text with no photos", () => {
    expect(validateCommentBody("   ")).toEqual({ trimmed: null, error: "empty" });
  });

  it("allows blank text as null when the comment has photos", () => {
    expect(validateCommentBody("   ", { photoCount: 1 })).toEqual({ trimmed: null, error: null });
  });

  it("rejects text over 1000 characters", () => {
    expect(validateCommentBody("a".repeat(1001), { photoCount: 2 })).toEqual({
      trimmed: null,
      error: "too_long",
    });
  });
});
