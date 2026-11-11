import { describe, expect, it } from "vitest";
import {
  buildLearnArticleSlugPath,
  extractIdFromRecipeSlug,
  localizedPath,
  resolveSiteUrl,
  slugify,
} from "./seo";

describe("localizedPath", () => {
  it("prefixes a path with its locale", () => {
    expect(localizedPath("es", "/recipes/negroni-1")).toBe("/es/recipes/negroni-1");
  });

  it("maps the root to the bare locale, with no trailing slash", () => {
    expect(localizedPath("en", "/")).toBe("/en");
  });
});

describe("resolveSiteUrl", () => {
  it("prefers NEXT_PUBLIC_SITE_URL and drops a trailing slash", () => {
    expect(
      resolveSiteUrl({ NEXT_PUBLIC_SITE_URL: "https://example.com/", VERCEL_URL: "x.vercel.app" }),
    ).toBe("https://example.com");
  });

  it("uses the production domain on a Vercel production build", () => {
    expect(
      resolveSiteUrl({
        VERCEL_ENV: "production",
        VERCEL_PROJECT_PRODUCTION_URL: "example.com",
        VERCEL_URL: "app-abc.vercel.app",
      }),
    ).toBe("https://example.com");
  });

  it("uses the deployment URL on a Vercel preview build", () => {
    expect(
      resolveSiteUrl({
        VERCEL_ENV: "preview",
        VERCEL_PROJECT_PRODUCTION_URL: "example.com",
        VERCEL_URL: "app-abc.vercel.app",
      }),
    ).toBe("https://app-abc.vercel.app");
  });

  it("falls back to localhost outside Vercel", () => {
    expect(resolveSiteUrl({ NEXT_PUBLIC_SITE_URL: "  " })).toBe("http://localhost:3000");
  });
});

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

  it("transliterates Cyrillic with the Yandex URL style (spec 0047 AC-9)", () => {
    expect(slugify("Маргарита", "recipe")).toBe("margarita");
    expect(slugify("Белый русский", "recipe")).toBe("belyy-russkiy");
    expect(slugify("Щука ёж", "recipe")).toBe("shchuka-ezh");
    expect(slugify("Їжак", "recipe")).toBe("yizhak");
    expect(slugify("Объём", "recipe")).toBe("obem");
  });

  it("transliterates Cyrillic mixed with Latin, and drops a Cyrillic letter the table lacks", () => {
    expect(slugify("Мохито Mojito", "recipe")).toBe("mokhito-mojito");
    expect(slugify("Ѣ", "recipe")).toBe("recipe");
  });

  it("leaves input with no Cyrillic exactly as before", () => {
    expect(slugify("Crème de Cassis & Café", "recipe")).toBe("creme-de-cassis-cafe");
    expect(slugify("Ação Œuvre", "recipe")).toBe("acao-uvre");
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
