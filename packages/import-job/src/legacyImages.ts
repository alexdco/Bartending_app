import type { RecipeImagePair } from "@bartendingapp/shared";

const THECOCKTAILDB_HOST = "www.thecocktaildb.com";

export interface LegacyImageRow {
  id: string;
  imageUrl: string;
}

/**
 * Spec 0041 AC-13: hotlinks that are not TheCocktailDB's (Imgur and other
 * pasted admin links). TheCocktailDB thumbs wait for the catalog copy.
 */
export function isLegacyHotlink(url: string): boolean {
  try {
    return new URL(url).hostname !== THECOCKTAILDB_HOST;
  } catch {
    return true;
  }
}

/**
 * The image an HTML page shares (its `og:image`), for pasted links to a page
 * such as an Imgur album (`imgur.com/a/…`) rather than to the image file.
 * The query string is dropped: Imgur's `?fb` asks for a 600 x 315 social
 * crop, and the bare URL is the full original.
 */
export function sharedImageUrl(html: string): string | null {
  const tags = html.match(/<meta\b[^>]*>/gi) ?? [];
  const tag = tags.find((candidate) => /property=["']og:image["']/i.test(candidate));
  const content = tag?.match(/content=["']([^"']+)["']/i)?.[1];

  if (!content) {
    return null;
  }

  try {
    const url = new URL(content);
    url.search = "";
    return url.toString();
  } catch {
    return null;
  }
}

export interface MigrateDeps {
  download: (
    url: string,
  ) => Promise<{ data: Uint8Array; error: null } | { data: null; error: string }>;
  process: (
    bytes: Uint8Array,
  ) => Promise<{ data: RecipeImagePair; error: null } | { data: null; error: string }>;
  /** Uploads to `recipes/<recipeId>/…` and returns the hero's public URL. */
  upload: (
    recipeId: string,
    images: RecipeImagePair,
  ) => Promise<{ data: { heroUrl: string }; error: null } | { data: null; error: string }>;
  /** Points the recipe at the hero as admin_upload, only if it still holds oldUrl. */
  setImage: (
    recipeId: string,
    oldUrl: string,
    heroUrl: string,
  ) => Promise<{ error: null } | { error: string }>;
}

export type MigrateOutcome =
  | { ok: true; recipeId: string; heroUrl: string }
  | { ok: false; recipeId: string; url: string; reason: string };

/** Moves one legacy hotlink into the bucket as `admin_upload`. */
export async function migrateLegacyImage(
  row: LegacyImageRow,
  deps: MigrateDeps,
): Promise<MigrateOutcome> {
  const fail = (reason: string): MigrateOutcome => ({
    ok: false,
    recipeId: row.id,
    url: row.imageUrl,
    reason,
  });

  const downloaded = await deps.download(row.imageUrl);
  if (downloaded.error !== null) return fail(`download: ${downloaded.error}`);

  const processed = await deps.process(downloaded.data);
  if (processed.error !== null) return fail(`encode: ${processed.error}`);

  const uploaded = await deps.upload(row.id, processed.data);
  if (uploaded.error !== null) return fail(`upload: ${uploaded.error}`);

  const set = await deps.setImage(row.id, row.imageUrl, uploaded.data.heroUrl);
  if (set.error !== null) return fail(`save: ${set.error}`);

  return { ok: true, recipeId: row.id, heroUrl: uploaded.data.heroUrl };
}
