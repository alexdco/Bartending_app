import { describe, expect, it } from "vitest";
import { buildLearnArticleSlugPath, extractIdFromRecipeSlug, slugify } from "./seo";

describe("slugify", () => {
  it("lowercases and hyphenates a title", () => {
    expect(slugify("What Is a Jigger?", "article")).toBe("what-is-a-jigger");
  });

  it("strips accents", () => {
    expect(slugify("Piña Colada", "article")).toBe("pina-colada");
  });

  it("falls back to the given word when the input has no alphanumeric characters", () => {
    expect(slugify("!!!", "article")).toBe("article");
  });

  it("truncates long input to 60 characters without a trailing hyphen", () => {
    const long = "a".repeat(100);
    const result = slugify(long, "article");
    expect(result.length).toBeLessThanOrEqual(60);
    expect(result.endsWith("-")).toBe(false);
  });
});

describe("buildLearnArticleSlugPath and extractIdFromRecipeSlug", () => {
  it("round trips: the id extracted from a built slug matches the original id", () => {
    const id = "d7389446-1234-4abc-8def-0123456789ab";
    const path = buildLearnArticleSlugPath(id, "What Is a Jigger?");

    expect(path).toBe(`what-is-a-jigger-${id}`);
    expect(extractIdFromRecipeSlug(path)).toBe(id);
  });

  it("extracts null from a slug with no trailing uuid (covers AC-5, not found routing)", () => {
    expect(extractIdFromRecipeSlug("what-is-a-jigger")).toBeNull();
  });
});
