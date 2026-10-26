import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

/**
 * Self hosted recipe images (spec 0041). Every image lives in the public
 * `recipe-images` bucket as a content hashed pair: a square hero (at most
 * 1000px) and a 400px card. The web canvas pipeline and the import job's
 * sharp pipeline both produce the pair; the limits, paths, URL helpers, and
 * upload and set calls live here once.
 */

export const RECIPE_IMAGES_BUCKET = "recipe-images";
export const RECIPE_IMAGE_CONTENT_TYPE = "image/webp";
/** One year: files are never overwritten, so a cached copy is never stale. */
export const RECIPE_IMAGE_CACHE_SECONDS = 31536000;
export const RECIPE_IMAGE_HERO_MAX_SIDE = 1000;
export const RECIPE_IMAGE_CARD_SIDE = 400;
export const RECIPE_IMAGE_MIN_SOURCE_SIDE = 600;
export const RECIPE_IMAGE_MAX_ORIGINAL_BYTES = 15 * 1024 * 1024;
export const RECIPE_IMAGE_WEBP_QUALITY = 0.82;
export const RECIPE_IMAGE_ACCEPTED_TYPES: readonly string[] = [
  "image/jpeg",
  "image/png",
  "image/webp",
];
export const THECOCKTAILDB_CREDIT_URL = "https://www.thecocktaildb.com";

const RECIPE_IMAGE_BUCKET_PATH = `/storage/v1/object/public/${RECIPE_IMAGES_BUCKET}/`;

export type RecipeImageSize = "hero" | "card";
export type RecipeImageScope = "catalog" | "recipes";
export type RecipeImageOrigin = "catalog_copy" | "admin_upload" | "external_hotlink";

export interface RecipeImagePair {
  hero: Blob | ArrayBuffer | Uint8Array;
  card: Blob | ArrayBuffer | Uint8Array;
  /** First 16 hex characters of the SHA-256 of the hero bytes. */
  hash: string;
}

/** `<scope>/<key>/<hash>-<size>.webp`, matching the storage policy's name check. */
export function recipeImagePath(
  scope: RecipeImageScope,
  key: string,
  hash: string,
  size: RecipeImageSize,
): string {
  return `${scope}/${key}/${hash}-${size}.webp`;
}

/** Whether a URL points into our `recipe-images` bucket (any project host). */
export function isRecipeImageBucketUrl(url: string | null | undefined): boolean {
  return typeof url === "string" && url.includes(RECIPE_IMAGE_BUCKET_PATH);
}

/**
 * The URL to show at a size (AC-10). Our bucket's hero URL becomes its card
 * sibling for `card`; a hotlink (TheCocktailDB, Imgur) has only one size, so
 * it comes back unchanged.
 */
export function recipeImageUrl(url: string | null, size: RecipeImageSize): string | null {
  if (url === null) {
    return null;
  }

  if (size === "card" && isRecipeImageBucketUrl(url)) {
    return url.replace(/-hero\.webp$/, "-card.webp");
  }

  return url;
}

export type RecipeImageOriginalError = "unsupported_type" | "too_large";
export type RecipeImageDimensionsError = "too_small";

/** Checks a picked file before decoding it (AC-3). */
export function validateRecipeImageOriginal(original: {
  sizeBytes: number;
  mimeType: string | null;
}): RecipeImageOriginalError | null {
  if (!RECIPE_IMAGE_ACCEPTED_TYPES.includes(original.mimeType?.toLowerCase() ?? "")) {
    return "unsupported_type";
  }

  if (original.sizeBytes > RECIPE_IMAGE_MAX_ORIGINAL_BYTES) {
    return "too_large";
  }

  return null;
}

/** The decoded image's short side must be at least 600px (AC-3). */
export function validateRecipeImageDimensions(
  width: number,
  height: number,
): RecipeImageDimensionsError | null {
  return Math.min(width, height) < RECIPE_IMAGE_MIN_SOURCE_SIDE ? "too_small" : null;
}

export interface SquareCrop {
  left: number;
  top: number;
  side: number;
}

/** The centered square inside a width by height image. */
export function centerSquareCrop(width: number, height: number): SquareCrop {
  const side = Math.floor(Math.min(width, height));
  return {
    left: Math.floor((width - side) / 2),
    top: Math.floor((height - side) / 2),
    side,
  };
}

/** Hero side: the source short side, capped at 1000px, never upscaled. */
export function recipeImageHeroSide(sourceShortSide: number): number {
  return Math.min(RECIPE_IMAGE_HERO_MAX_SIDE, Math.floor(sourceShortSide));
}

/** Card side: 400px, or the hero side when that is smaller (never upscaled). */
export function recipeImageCardSide(heroSide: number): number {
  return Math.min(RECIPE_IMAGE_CARD_SIDE, heroSide);
}

/** First 16 hex characters of SHA-256 (Web Crypto, in browsers and Node 20). */
export async function recipeImageHash(bytes: ArrayBuffer | Uint8Array): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest("SHA-256", new Uint8Array(bytes));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 16);
}

export function getRecipeImagePublicUrl(client: SupabaseClient<Database>, path: string): string {
  return client.storage.from(RECIPE_IMAGES_BUCKET).getPublicUrl(path).data.publicUrl;
}

export type UploadRecipeImageError =
  | { reason: "forbidden" }
  | { reason: "too_large" }
  | { reason: "wrong_type" }
  | { reason: "request_failed"; message: string };

export type UploadRecipeImageResult =
  { data: { heroUrl: string }; error: null } | { data: null; error: UploadRecipeImageError };

type StorageError = { message: string; status?: number | string; statusCode?: number | string };

function storageErrorStatus(error: StorageError): number | null {
  const status = Number(error.status ?? error.statusCode);
  return Number.isFinite(status) ? status : null;
}

/** A file that already exists under the same hash holds the same bytes. */
function isAlreadyExists(error: StorageError): boolean {
  return storageErrorStatus(error) === 409 || /already exists|duplicate/i.test(error.message);
}

export function mapRecipeImageUploadError(error: StorageError): UploadRecipeImageError {
  const status = storageErrorStatus(error);
  const message = error.message.toLowerCase();

  if (status === 413 || message.includes("maximum allowed size")) {
    return { reason: "too_large" };
  }

  if (status === 415 || message.includes("mime type")) {
    return { reason: "wrong_type" };
  }

  if (status === 403 || message.includes("row-level security")) {
    return { reason: "forbidden" };
  }

  return { reason: "request_failed", message: error.message };
}

/**
 * Uploads a hero and card pair to `<scope>/<key>/<hash>-(hero|card).webp`
 * with a one year cache header. Files are never overwritten (`upsert:
 * false`); a pair already stored under the same hash counts as uploaded, so
 * a retry after a failed save is safe.
 */
export async function uploadRecipeImagePair(
  client: SupabaseClient<Database>,
  scope: RecipeImageScope,
  key: string,
  images: RecipeImagePair,
): Promise<UploadRecipeImageResult> {
  const bucket = client.storage.from(RECIPE_IMAGES_BUCKET);
  const files = [
    { path: recipeImagePath(scope, key, images.hash, "hero"), bytes: images.hero },
    { path: recipeImagePath(scope, key, images.hash, "card"), bytes: images.card },
  ];

  for (const file of files) {
    const { error } = await bucket.upload(file.path, file.bytes, {
      contentType: RECIPE_IMAGE_CONTENT_TYPE,
      cacheControl: String(RECIPE_IMAGE_CACHE_SECONDS),
      upsert: false,
    });

    if (error && !isAlreadyExists(error)) {
      return { data: null, error: mapRecipeImageUploadError(error) };
    }
  }

  return { data: { heroUrl: getRecipeImagePublicUrl(client, files[0]!.path) }, error: null };
}

/** The admin path (AC-2): `recipes/<recipeId>/<hash>-(hero|card).webp`. */
export function uploadRecipeImage(
  client: SupabaseClient<Database>,
  recipeId: string,
  images: RecipeImagePair,
): Promise<UploadRecipeImageResult> {
  return uploadRecipeImagePair(client, "recipes", recipeId, images);
}

export const SET_RECIPE_IMAGE_ERROR_REASONS = [
  "not admin",
  "invalid image url",
  "image files missing",
  "recipe not found",
] as const;

export type SetRecipeImageError =
  | { reason: (typeof SET_RECIPE_IMAGE_ERROR_REASONS)[number] }
  | { reason: "request_failed"; message: string };

export type SetRecipeImageResult =
  { data: true; error: null } | { data: null; error: SetRecipeImageError };

/**
 * Points a recipe at an uploaded hero (its card must exist too), or removes
 * its image with null. Either way the recipe becomes `admin_upload`, so no
 * import changes it again (AC-5, AC-6).
 */
export async function setRecipeImage(
  client: SupabaseClient<Database>,
  recipeId: string,
  heroUrl: string | null,
): Promise<SetRecipeImageResult> {
  // The generated Args type marks p_hero_url non nullable (a type generator
  // limitation for plpgsql functions); the function accepts null.
  const { error } = await client.rpc("admin_set_recipe_image", {
    p_recipe_id: recipeId,
    p_hero_url: heroUrl,
  } as Database["public"]["Functions"]["admin_set_recipe_image"]["Args"]);

  if (error) {
    const code = error.message.trim();
    const known = SET_RECIPE_IMAGE_ERROR_REASONS.find((reason) => reason === code);
    return {
      data: null,
      error: known ? { reason: known } : { reason: "request_failed", message: error.message },
    };
  }

  return { data: true, error: null };
}
