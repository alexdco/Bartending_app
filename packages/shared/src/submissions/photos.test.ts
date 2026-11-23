import { describe, expect, it } from "vitest";
import { submissionPhotoFiles } from "./photos";

describe("submissionPhotoFiles", () => {
  it("names the hero and card files of a photo path", () => {
    expect(submissionPhotoFiles("u1/s1-0123456789abcdef")).toEqual([
      "u1/s1-0123456789abcdef-hero.webp",
      "u1/s1-0123456789abcdef-card.webp",
    ]);
  });
});
