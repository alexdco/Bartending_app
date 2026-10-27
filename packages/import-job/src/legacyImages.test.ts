import { describe, expect, it, vi } from "vitest";
import {
  isLegacyHotlink,
  migrateLegacyImage,
  sharedImageUrl,
  type MigrateDeps,
} from "./legacyImages";

const ROW = { id: "3f2b6c1e-8a4d-4e2f-9b7a-1c2d3e4f5a6b", imageUrl: "https://i.imgur.com/abc.jpg" };
const HERO = `https://x.supabase.co/storage/v1/object/public/recipe-images/recipes/${ROW.id}/0123456789abcdef-hero.webp`;

function fakeDeps(overrides: Partial<MigrateDeps> = {}): MigrateDeps {
  const pair = { hero: new Uint8Array([1]), card: new Uint8Array([2]), hash: "0123456789abcdef" };
  return {
    download: vi.fn().mockResolvedValue({ data: new Uint8Array([9]), error: null }),
    process: vi.fn().mockResolvedValue({ data: pair, error: null }),
    upload: vi.fn().mockResolvedValue({ data: { heroUrl: HERO }, error: null }),
    setImage: vi.fn().mockResolvedValue({ error: null }),
    ...overrides,
  };
}

describe("isLegacyHotlink", () => {
  it("is true for Imgur and other hosts, false for TheCocktailDB", () => {
    expect(isLegacyHotlink("https://i.imgur.com/abc.jpg")).toBe(true);
    expect(isLegacyHotlink("https://imgur.com/abc")).toBe(true);
    expect(isLegacyHotlink("https://example.com/x.png")).toBe(true);
    expect(isLegacyHotlink("https://www.thecocktaildb.com/images/media/drink/x.jpg")).toBe(false);
  });
});

describe("sharedImageUrl", () => {
  it("reads og:image and drops Imgur's ?fb crop", () => {
    const html = `<head>
      <meta property="og:image:width" content="600">
      <meta property="og:image" data-react-helmet="true" content="https://i.imgur.com/VGTYvBh.png?fb">
    </head>`;
    expect(sharedImageUrl(html)).toBe("https://i.imgur.com/VGTYvBh.png");
  });

  it("returns null when the page shares no image", () => {
    expect(sharedImageUrl("<html><head><title>x</title></head></html>")).toBeNull();
    expect(sharedImageUrl('<meta property="og:image" content="not a url">')).toBeNull();
  });
});

describe("migrateLegacyImage", () => {
  it("uploads under the recipe id and saves the hero only if the old URL is still there", async () => {
    const deps = fakeDeps();
    await expect(migrateLegacyImage(ROW, deps)).resolves.toEqual({
      ok: true,
      recipeId: ROW.id,
      heroUrl: HERO,
    });
    expect(deps.upload).toHaveBeenCalledWith(ROW.id, expect.anything());
    expect(deps.setImage).toHaveBeenCalledWith(ROW.id, ROW.imageUrl, HERO);
  });

  it("reports the recipe id, URL, and reason on failure, saving nothing", async () => {
    const deps = fakeDeps({
      process: vi.fn().mockResolvedValue({ data: null, error: "too_small" }),
    });
    await expect(migrateLegacyImage(ROW, deps)).resolves.toEqual({
      ok: false,
      recipeId: ROW.id,
      url: ROW.imageUrl,
      reason: "encode: too_small",
    });
    expect(deps.upload).not.toHaveBeenCalled();
    expect(deps.setImage).not.toHaveBeenCalled();
  });

  it("fails when the recipe changed since it was read", async () => {
    const deps = fakeDeps({
      setImage: vi.fn().mockResolvedValue({ error: "recipe changed since it was read" }),
    });
    await expect(migrateLegacyImage(ROW, deps)).resolves.toMatchObject({
      ok: false,
      reason: "save: recipe changed since it was read",
    });
  });
});
