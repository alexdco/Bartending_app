import { describe, expect, it } from "vitest";
import { isValidRatingScore, ratingDisplay, RATING_AVERAGE_FORMAT } from "./ratings";

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

describe("ratingDisplay (spec 0038 AC-7)", () => {
  const formatIn = (locale: string) => (average: number) =>
    new Intl.NumberFormat(locale, RATING_AVERAGE_FORMAT).format(average);

  it("shows no stars for zero ratings", () => {
    expect(ratingDisplay({ average: null, count: 0 }, formatIn("en"))).toEqual({ kind: "none" });
  });

  it("shows no stars before the summary loads", () => {
    expect(ratingDisplay(undefined, formatIn("en"))).toEqual({ kind: "none" });
  });

  it("formats a single rating to one decimal", () => {
    expect(ratingDisplay({ average: 5, count: 1 }, formatIn("en"))).toEqual({
      kind: "rated",
      average: "5.0",
      count: 1,
    });
  });

  it("formats many ratings with the locale's decimal separator", () => {
    expect(ratingDisplay({ average: 4.1666, count: 3 }, formatIn("en"))).toEqual({
      kind: "rated",
      average: "4.2",
      count: 3,
    });
    expect(ratingDisplay({ average: 4.1666, count: 3 }, formatIn("es"))).toEqual({
      kind: "rated",
      average: "4,2",
      count: 3,
    });
  });
});
