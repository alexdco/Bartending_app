import { describe, expect, it } from "vitest";
import { isValidRatingScore } from "./ratings";

describe("isValidRatingScore", () => {
  it("accepts integers 1 through 5", () => {
    expect(isValidRatingScore(1)).toBe(true);
    expect(isValidRatingScore(3)).toBe(true);
    expect(isValidRatingScore(5)).toBe(true);
  });

  it("rejects out of range scores", () => {
    expect(isValidRatingScore(0)).toBe(false);
    expect(isValidRatingScore(6)).toBe(false);
  });

  it("rejects non integer scores", () => {
    expect(isValidRatingScore(3.5)).toBe(false);
  });
});
