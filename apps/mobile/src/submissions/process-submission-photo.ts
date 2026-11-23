import { CryptoDigestAlgorithm, digest } from "expo-crypto";
import { ImageManipulator, SaveFormat, type ImageRef } from "expo-image-manipulator";
import type { ImagePickerAsset } from "expo-image-picker";

import {
  RECIPE_IMAGE_WEBP_QUALITY,
  centerSquareCrop,
  recipeImageCardSide,
  recipeImageHashFromDigest,
  recipeImageHeroSide,
  validateRecipeImageDimensions,
  validateRecipeImageOriginal,
  type RecipeImageDimensionsError,
  type RecipeImageOriginalError,
  type RecipeImagePair,
} from "@bartendingapp/shared";

export interface ProcessedSubmissionPhoto {
  image: RecipeImagePair;
  /** A local file URI of the hero, for the form's preview. */
  previewUri: string;
}

export type ProcessSubmissionPhotoError =
  RecipeImageOriginalError | RecipeImageDimensionsError | "decode_failed";

export type ProcessSubmissionPhotoResult =
  | { data: ProcessedSubmissionPhoto; error: null }
  | { data: null; error: ProcessSubmissionPhotoError };

const EXTENSION_TYPES: Readonly<Record<string, string>> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

/** Some pickers omit the type; the file extension stands in for it. */
function assetMimeType(asset: ImagePickerAsset): string | null {
  if (asset.mimeType) return asset.mimeType;
  const extension = asset.fileName?.split(".").pop()?.toLowerCase() ?? "";
  return EXTENSION_TYPES[extension] ?? null;
}

async function encodeSquare(
  source: ImageRef,
  crop: { left: number; top: number; side: number },
  side: number,
): Promise<{ uri: string; bytes: ArrayBuffer }> {
  const rendered = await ImageManipulator.manipulate(source)
    .crop({ originX: crop.left, originY: crop.top, width: crop.side, height: crop.side })
    .resize({ width: side, height: side })
    .renderAsync();
  const saved = await rendered.saveAsync({
    format: SaveFormat.WEBP,
    compress: RECIPE_IMAGE_WEBP_QUALITY,
  });
  const bytes = await fetch(saved.uri).then((response) => response.arrayBuffer());
  return { uri: saved.uri, bytes };
}

/**
 * Spec 0064 AC-8 on the spec 0041 rules: a JPEG, PNG, or WebP of at most
 * 15 MB with a short side of at least 600px, center cropped square and
 * encoded as a hero WebP (the smaller of 1000px and the short side) plus a
 * 400px card. The manipulator renders oriented pixels into fresh files, so no
 * metadata (EXIF, GPS) is uploaded.
 */
export async function processSubmissionPhoto(
  asset: ImagePickerAsset,
): Promise<ProcessSubmissionPhotoResult> {
  const originalError = validateRecipeImageOriginal({
    // Some pickers omit the size; the 15 MB guard then cannot apply.
    sizeBytes: asset.fileSize ?? 0,
    mimeType: assetMimeType(asset),
  });
  if (originalError) return { data: null, error: originalError };

  try {
    const oriented = await ImageManipulator.manipulate(asset.uri).renderAsync();
    const dimensionsError = validateRecipeImageDimensions(oriented.width, oriented.height);
    if (dimensionsError) return { data: null, error: dimensionsError };

    const crop = centerSquareCrop(oriented.width, oriented.height);
    const heroSide = recipeImageHeroSide(crop.side);
    const hero = await encodeSquare(oriented, crop, heroSide);
    const card = await encodeSquare(oriented, crop, recipeImageCardSide(heroSide));
    const hash = recipeImageHashFromDigest(
      await digest(CryptoDigestAlgorithm.SHA256, new Uint8Array(hero.bytes)),
    );

    return {
      data: { image: { hero: hero.bytes, card: card.bytes, hash }, previewUri: hero.uri },
      error: null,
    };
  } catch {
    return { data: null, error: "decode_failed" };
  }
}
