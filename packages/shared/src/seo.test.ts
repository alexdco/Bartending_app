import { describe, expect, it } from "vitest";
import {
  buildLearnArticleSlugPath,
  buildRecipeSlugPath,
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

describe("buildRecipeSlugPath (spec 0048 AC-9)", () => {
  const id = "d6aa9b01-16e2-49e9-a02b-5386edd831a8";

  it("uses the English base name for a Devanagari name", () => {
    expect(buildRecipeSlugPath(id, "मार्गरीटा", "Margarita")).toBe(`margarita-${id}`);
  });

  it("uses the base name when any letter is Devanagari, even beside Latin", () => {
    expect(buildRecipeSlugPath(id, "B-52 शॉट", "B-52 Shot")).toBe(`b-52-shot-${id}`);
  });

  it("keeps a Cyrillic name as its own slug", () => {
    expect(buildRecipeSlugPath(id, "Белый русский", "White Russian")).toBe(`belyy-russkiy-${id}`);
  });

  it("keeps a Latin name with accents as its own slug", () => {
    expect(buildRecipeSlugPath(id, "Piña Colada", "Pina Colada")).toBe(`pina-colada-${id}`);
  });

  it("keeps a Latin name with a Greek micro sign or a modifier apostrophe as its own slug", () => {
    expect(buildRecipeSlugPath(id, "µ Sour", "Other")).toBe(`sour-${id}`);
    expect(buildRecipeSlugPath(id, "Cafeʼ Royale", "Other")).toBe(`cafe-royale-${id}`);
  });

  it("matches slugify of the name whenever the name is Latin or Cyrillic", () => {
    for (const name of ["Negroni", "Crème de Cassis & Café", "Маргарита", "Мохито Mojito", "!!!"]) {
      expect(buildRecipeSlugPath(id, name, "Different")).toBe(`${slugify(name, "recipe")}-${id}`);
    }
  });
});
