import {
  RECIPE_IMAGE_CONTENT_TYPE,
  RECIPE_IMAGE_WEBP_QUALITY,
  centerSquareCrop,
  recipeImageCardSide,
  recipeImageHash,
  recipeImageHeroSide,
  validateRecipeImageDimensions,
  validateRecipeImageOriginal,
  type RecipeImageDimensionsError,
  type RecipeImageOriginalError,
} from "@bartendingapp/shared";

export interface ProcessedRecipeImage {
  hero: Blob;
  card: Blob;
  hash: string;
}

export type ProcessRecipeImageError =
  RecipeImageOriginalError | RecipeImageDimensionsError | "webp_unsupported" | "decode_failed";

export type ProcessRecipeImageResult =
  { data: ProcessedRecipeImage; error: null } | { data: null; error: ProcessRecipeImageError };

/**
 * Draws the centered square of the bitmap at side by side px and encodes it
 * as WebP. A browser that can't encode WebP falls back to PNG, so the blob's
 * type is checked and anything else comes back null.
 */
function encodeSquare(bitmap: ImageBitmap, side: number): Promise<Blob | null> {
  const crop = centerSquareCrop(bitmap.width, bitmap.height);
  const canvas = document.createElement("canvas");
  canvas.width = side;
  canvas.height = side;
  const context = canvas.getContext("2d");

  if (!context) {
    return Promise.resolve(null);
  }

  context.imageSmoothingQuality = "high";
  context.drawImage(bitmap, crop.left, crop.top, crop.side, crop.side, 0, 0, side, side);

  return new Promise((resolve) =>
    canvas.toBlob(
      (blob) => resolve(blob && blob.type === RECIPE_IMAGE_CONTENT_TYPE ? blob : null),
      RECIPE_IMAGE_CONTENT_TYPE,
      RECIPE_IMAGE_WEBP_QUALITY,
    ),
  );
}

/**
 * Spec 0041 AC-2, AC-3: a JPEG, PNG, or WebP of at most 15 MB with a short
 * side of at least 600px, center cropped square and encoded again as a hero
 * WebP (the smaller of 1000px and the short side) plus a 400px card. Only
 * pixels survive the canvas, so no metadata is ever uploaded.
 */
export async function processRecipeImage(file: File): Promise<ProcessRecipeImageResult> {
  const originalError = validateRecipeImageOriginal({ sizeBytes: file.size, mimeType: file.type });

  if (originalError) {
    return { data: null, error: originalError };
  }

  let bitmap: ImageBitmap;

  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    return { data: null, error: "decode_failed" };
  }

  try {
    const dimensionsError = validateRecipeImageDimensions(bitmap.width, bitmap.height);

    if (dimensionsError) {
      return { data: null, error: dimensionsError };
    }

    const heroSide = recipeImageHeroSide(Math.min(bitmap.width, bitmap.height));
    const hero = await encodeSquare(bitmap, heroSide);
    const card = hero ? await encodeSquare(bitmap, recipeImageCardSide(heroSide)) : null;

    if (!hero || !card) {
      return { data: null, error: "webp_unsupported" };
    }

    const hash = await recipeImageHash(await hero.arrayBuffer());
    return { data: { hero, card, hash }, error: null };
  } catch {
    return { data: null, error: "decode_failed" };
  } finally {
    bitmap.close();
  }
}
