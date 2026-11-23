import { describe, expect, it } from "vitest";
import { submissionPhotoFile, submissionPhotoFiles, submissionPhotoPath } from "./photos";

describe("submissionPhotoFiles", () => {
  it("names the hero and card files of a photo path", () => {
    expect(submissionPhotoFiles("u1/s1-0123456789abcdef")).toEqual([
      "u1/s1-0123456789abcdef-hero.webp",
      "u1/s1-0123456789abcdef-card.webp",
    ]);
  });
});

describe("submissionPhotoPath", () => {
  it("builds the author folder, submission id, and hash path the save function accepts", () => {
    const author = "11111111-1111-4111-8111-111111111111";
    const submission = "22222222-2222-4222-8222-222222222222";
    const path = submissionPhotoPath(author, submission, "0123456789abcdef");
    expect(path).toBe(`${author}/${submission}-0123456789abcdef`);
    // The pattern save_recipe_submission checks.
    expect(path).toMatch(new RegExp(`^${author}/${submission}-[0-9a-f]{16}$`));
    // And the storage policy's file name pattern.
    expect(submissionPhotoFile(path, "card")).toMatch(
      /^[0-9a-f-]{36}\/[0-9a-f-]{36}-[0-9a-f]{16}-(hero|card)\.webp$/,
    );
  });
});
