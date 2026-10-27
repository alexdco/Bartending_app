import sharp, { type OutputInfo } from "sharp";
import {
  RECIPE_IMAGE_WEBP_QUALITY,
  centerSquareCrop,
  recipeImageCardSide,
  recipeImageHash,
  recipeImageHeroSide,
  validateRecipeImageDimensions,
  type RecipeImagePair,
} from "@bartendingapp/shared/recipe-images";

export type ProcessImageError = "decode_failed" | "too_small";

export type ProcessImageResult =
  { data: RecipeImagePair; error: null } | { data: null; error: ProcessImageError };

const WEBP_OPTIONS = { quality: Math.round(RECIPE_IMAGE_WEBP_QUALITY * 100) };

/**
 * Spec 0041: the same pipeline as the admin canvas, in Node. The photo's
 * rotation is applied, the centered square is cut, and a hero (the smaller
 * of 1000px and the short side, never upscaled) plus a card WebP are
 * encoded. sharp drops all metadata unless asked to keep it.
 *
 * `requireMinSide` applies the admin upload's 600px rule (the legacy
 * migration); TheCocktailDB thumbs are copied at whatever size they are.
 */
export async function processImageBuffer(
  input: Uint8Array,
  { requireMinSide = false }: { requireMinSide?: boolean } = {},
): Promise<ProcessImageResult> {
  let upright: { data: Buffer; info: OutputInfo };

  try {
    upright = await sharp(input).rotate().toBuffer({ resolveWithObject: true });
  } catch {
    return { data: null, error: "decode_failed" };
  }

  const { width, height } = upright.info;

  if (requireMinSide && validateRecipeImageDimensions(width, height)) {
    return { data: null, error: "too_small" };
  }

  const crop = centerSquareCrop(width, height);
  const heroSide = recipeImageHeroSide(crop.side);
  const square = sharp(upright.data).extract({
    left: crop.left,
    top: crop.top,
    width: crop.side,
    height: crop.side,
  });

  try {
    const [hero, card] = await Promise.all([
      square.clone().resize(heroSide, heroSide).webp(WEBP_OPTIONS).toBuffer(),
      square
        .clone()
        .resize(recipeImageCardSide(heroSide), recipeImageCardSide(heroSide))
        .webp(WEBP_OPTIONS)
        .toBuffer(),
    ]);
    const heroBytes = new Uint8Array(hero);
    return {
      data: { hero: heroBytes, card: new Uint8Array(card), hash: await recipeImageHash(heroBytes) },
      error: null,
    };
  } catch {
    return { data: null, error: "decode_failed" };
  }
}

/** Downloads an image; any network error or non 2xx status is an error string. */
export async function downloadImage(
  url: string,
  timeoutMs = 20000,
): Promise<{ data: Uint8Array; error: null } | { data: null; error: string }> {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });

    if (!response.ok) {
      return { data: null, error: `HTTP ${response.status}` };
    }

    return { data: new Uint8Array(await response.arrayBuffer()), error: null };
  } catch (error) {
    return { data: null, error: error instanceof Error ? error.message : String(error) };
  }
}

/** Runs fn over items with at most `limit` in flight, keeping input order. */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array<R>(items.length);
  let next = 0;

  async function worker(): Promise<void> {
    while (next < items.length) {
      const index = next++;
      results[index] = await fn(items[index]!);
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}
