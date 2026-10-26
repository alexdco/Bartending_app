import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";
import {
  RECIPE_IMAGE_CACHE_SECONDS,
  RECIPE_IMAGE_MAX_ORIGINAL_BYTES,
  centerSquareCrop,
  isRecipeImageBucketUrl,
  mapRecipeImageUploadError,
  recipeImageCardSide,
  recipeImageHash,
  recipeImageHeroSide,
  recipeImagePath,
  recipeImageUrl,
  setRecipeImage,
  uploadRecipeImage,
  validateRecipeImageDimensions,
  validateRecipeImageOriginal,
} from "./recipeImages";

const RECIPE_ID = "3f2b6c1e-8a4d-4e2f-9b7a-1c2d3e4f5a6b";
const HERO =
  "https://ctuzjhhpnkkhooneporu.supabase.co/storage/v1/object/public/recipe-images/recipes/" +
  `${RECIPE_ID}/0123456789abcdef-hero.webp`;
const POLICY_NAME =
  /^recipes\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/[0-9a-f]{16}-(hero|card)\.webp$/;

describe("recipeImageUrl", () => {
  it("swaps our hero for its card sibling at card size", () => {
    expect(recipeImageUrl(HERO, "card")).toBe(HERO.replace("-hero.webp", "-card.webp"));
  });

  it("keeps our hero at hero size", () => {
    expect(recipeImageUrl(HERO, "hero")).toBe(HERO);
  });

  it("leaves TheCocktailDB and Imgur hotlinks unchanged", () => {
    const thumb = "https://www.thecocktaildb.com/images/media/drink/abc.jpg";
    const imgur = "https://i.imgur.com/abc-hero.webp";
    expect(recipeImageUrl(thumb, "card")).toBe(thumb);
    expect(recipeImageUrl(imgur, "card")).toBe(imgur);
  });

  it("returns null for null", () => {
    expect(recipeImageUrl(null, "card")).toBeNull();
    expect(recipeImageUrl(null, "hero")).toBeNull();
  });
});

describe("isRecipeImageBucketUrl", () => {
  it("is true only for the recipe-images bucket", () => {
    expect(isRecipeImageBucketUrl(HERO)).toBe(true);
    expect(isRecipeImageBucketUrl(HERO.replace("recipe-images", "comment-photos"))).toBe(false);
    expect(isRecipeImageBucketUrl(null)).toBe(false);
  });
});

describe("recipeImagePath", () => {
  it("builds names the storage policy accepts", () => {
    expect(recipeImagePath("recipes", RECIPE_ID, "0123456789abcdef", "hero")).toMatch(POLICY_NAME);
    expect(recipeImagePath("recipes", RECIPE_ID, "0123456789abcdef", "card")).toMatch(POLICY_NAME);
  });

  it("builds catalog paths from the source id", () => {
    expect(recipeImagePath("catalog", "11007", "0123456789abcdef", "card")).toBe(
      "catalog/11007/0123456789abcdef-card.webp",
    );
  });
});

describe("validateRecipeImageOriginal", () => {
  it("accepts JPEG, PNG, and WebP up to 15 MB", () => {
    for (const mimeType of ["image/jpeg", "image/png", "image/webp"]) {
      expect(
        validateRecipeImageOriginal({ sizeBytes: RECIPE_IMAGE_MAX_ORIGINAL_BYTES, mimeType }),
      ).toBeNull();
    }
  });

  it("rejects a GIF and an empty type", () => {
    expect(validateRecipeImageOriginal({ sizeBytes: 10, mimeType: "image/gif" })).toBe(
      "unsupported_type",
    );
    expect(validateRecipeImageOriginal({ sizeBytes: 10, mimeType: "" })).toBe("unsupported_type");
  });

  it("rejects a file over 15 MB", () => {
    expect(
      validateRecipeImageOriginal({
        sizeBytes: RECIPE_IMAGE_MAX_ORIGINAL_BYTES + 1,
        mimeType: "image/jpeg",
      }),
    ).toBe("too_large");
  });
});

describe("validateRecipeImageDimensions", () => {
  it("needs a short side of at least 600px", () => {
    expect(validateRecipeImageDimensions(600, 900)).toBeNull();
    expect(validateRecipeImageDimensions(1200, 599)).toBe("too_small");
  });
});

describe("size math", () => {
  it("center crops to the short side", () => {
    expect(centerSquareCrop(1200, 800)).toEqual({ left: 200, top: 0, side: 800 });
    expect(centerSquareCrop(700, 701)).toEqual({ left: 0, top: 0, side: 700 });
  });

  it("caps the hero at 1000px and never upscales", () => {
    expect(recipeImageHeroSide(1200)).toBe(1000);
    expect(recipeImageHeroSide(700)).toBe(700);
  });

  it("keeps the card at 400px unless the hero is smaller", () => {
    expect(recipeImageCardSide(1000)).toBe(400);
    expect(recipeImageCardSide(300)).toBe(300);
  });
});

describe("recipeImageHash", () => {
  it("is the first 16 hex characters of SHA-256", async () => {
    // SHA-256("abc") = ba7816bf8f01cfea414140de5dae2223...
    await expect(recipeImageHash(new TextEncoder().encode("abc"))).resolves.toBe(
      "ba7816bf8f01cfea",
    );
  });
});

describe("mapRecipeImageUploadError", () => {
  it("maps policy, size, and type rejections", () => {
    expect(mapRecipeImageUploadError({ message: "denied", statusCode: "403" })).toEqual({
      reason: "forbidden",
    });
    expect(mapRecipeImageUploadError({ message: "x", status: 413 })).toEqual({
      reason: "too_large",
    });
    expect(mapRecipeImageUploadError({ message: "mime type not supported" })).toEqual({
      reason: "wrong_type",
    });
    expect(mapRecipeImageUploadError({ message: "boom" })).toEqual({
      reason: "request_failed",
      message: "boom",
    });
  });
});

function fakeStorageClient(uploadError: unknown = null) {
  const upload = vi.fn().mockResolvedValue({ data: {}, error: uploadError });
  const getPublicUrl = vi.fn((path: string) => ({
    data: {
      publicUrl: `https://ctuzjhhpnkkhooneporu.supabase.co/storage/v1/object/public/recipe-images/${path}`,
    },
  }));
  const client = {
    storage: { from: vi.fn(() => ({ upload, getPublicUrl })) },
  } as unknown as SupabaseClient<Database>;
  return { client, upload };
}

describe("uploadRecipeImage", () => {
  const images = { hero: new Uint8Array([1]), card: new Uint8Array([2]), hash: "0123456789abcdef" };

  it("uploads both files without overwriting and returns the hero URL", async () => {
    const { client, upload } = fakeStorageClient();
    const result = await uploadRecipeImage(client, RECIPE_ID, images);

    expect(result).toEqual({ data: { heroUrl: HERO }, error: null });
    expect(upload).toHaveBeenCalledTimes(2);
    expect(upload).toHaveBeenCalledWith(
      `recipes/${RECIPE_ID}/0123456789abcdef-card.webp`,
      images.card,
      {
        contentType: "image/webp",
        cacheControl: String(RECIPE_IMAGE_CACHE_SECONDS),
        upsert: false,
      },
    );
  });

  it("treats a pair already stored under the same hash as uploaded", async () => {
    const { client } = fakeStorageClient({
      message: "The resource already exists",
      statusCode: "409",
    });
    await expect(uploadRecipeImage(client, RECIPE_ID, images)).resolves.toEqual({
      data: { heroUrl: HERO },
      error: null,
    });
  });

  it("stops on a policy rejection", async () => {
    const { client, upload } = fakeStorageClient({
      message: "new row violates row-level security",
    });
    await expect(uploadRecipeImage(client, RECIPE_ID, images)).resolves.toEqual({
      data: null,
      error: { reason: "forbidden" },
    });
    expect(upload).toHaveBeenCalledTimes(1);
  });
});

describe("setRecipeImage", () => {
  function fakeRpcClient(error: { message: string } | null) {
    const rpc = vi.fn().mockResolvedValue({ data: null, error });
    return { client: { rpc } as unknown as SupabaseClient<Database>, rpc };
  }

  it("calls admin_set_recipe_image, null removing the image", async () => {
    const { client, rpc } = fakeRpcClient(null);
    await expect(setRecipeImage(client, RECIPE_ID, null)).resolves.toEqual({
      data: true,
      error: null,
    });
    expect(rpc).toHaveBeenCalledWith("admin_set_recipe_image", {
      p_recipe_id: RECIPE_ID,
      p_hero_url: null,
    });
  });

  it("maps the function's known errors", async () => {
    const { client } = fakeRpcClient({ message: "image files missing" });
    await expect(setRecipeImage(client, RECIPE_ID, HERO)).resolves.toEqual({
      data: null,
      error: { reason: "image files missing" },
    });
  });

  it("keeps an unexpected message as request_failed", async () => {
    const { client } = fakeRpcClient({ message: "network down" });
    await expect(setRecipeImage(client, RECIPE_ID, HERO)).resolves.toEqual({
      data: null,
      error: { reason: "request_failed", message: "network down" },
    });
  });
});
