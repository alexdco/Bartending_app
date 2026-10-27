// One time move of legacy hotlinked recipe images (Imgur and other pasted
// admin links) into the recipe-images bucket (spec 0041 AC-13). Rerunnable:
// a migrated recipe is no longer `external_hotlink`, so a second run finds
// nothing. Once it reports 0 remaining, remove the Imgur entries from
// apps/web/next.config.ts.
//
//   pnpm --filter @bartendingapp/import-job migrate:images [--dry-run]
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@bartendingapp/shared";
import { uploadRecipeImagePair } from "@bartendingapp/shared/recipe-images";
import { downloadImage, mapWithConcurrency, processImageBuffer } from "./imageProcessing";
import {
  isLegacyHotlink,
  migrateLegacyImage,
  sharedImageUrl,
  type LegacyImageRow,
  type MigrateDeps,
} from "./legacyImages";

const CONCURRENCY = 4;
const PAGE_SIZE = 1000;

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

async function fetchLegacyRows(supabase: SupabaseClient<Database>): Promise<LegacyImageRow[]> {
  const rows: LegacyImageRow[] = [];

  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from("recipes")
      .select("id, image_url")
      .eq("image_origin", "external_hotlink")
      .not("image_url", "is", null)
      .order("id")
      .range(from, from + PAGE_SIZE - 1);

    if (error) {
      throw new Error(`Could not read hotlinked recipes: ${error.message}`);
    }

    rows.push(
      ...(data ?? [])
        .filter((row) => row.image_url !== null && isLegacyHotlink(row.image_url))
        .map((row) => ({ id: row.id, imageUrl: row.image_url! })),
    );

    if (!data || data.length < PAGE_SIZE) {
      return rows;
    }
  }
}

/**
 * Downloads a legacy link. A link to a page (an Imgur album, `imgur.com/a/…`)
 * is followed to the image the page shares, since admins pasted page links.
 */
async function downloadLegacyImage(
  url: string,
): Promise<{ data: Uint8Array; error: null } | { data: null; error: string }> {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(20000) });

    if (!response.ok) {
      return { data: null, error: `HTTP ${response.status}` };
    }

    if (!(response.headers.get("content-type") ?? "").startsWith("text/html")) {
      return { data: new Uint8Array(await response.arrayBuffer()), error: null };
    }

    const imageUrl = sharedImageUrl(await response.text());
    return imageUrl ? downloadImage(imageUrl) : { data: null, error: "page link with no og:image" };
  } catch (error) {
    return { data: null, error: error instanceof Error ? error.message : String(error) };
  }
}

function migrateDeps(supabase: SupabaseClient<Database>): MigrateDeps {
  return {
    download: downloadLegacyImage,
    process: async (bytes) => {
      // Same rules as an admin upload (AC-2), including the 600px minimum.
      const result = await processImageBuffer(bytes, { requireMinSide: true });
      return result.error === null ? result : { data: null, error: result.error };
    },
    upload: async (recipeId, images) => {
      const result = await uploadRecipeImagePair(supabase, "recipes", recipeId, images);
      return result.error === null
        ? result
        : {
            data: null,
            error:
              result.error.reason === "request_failed" ? result.error.message : result.error.reason,
          };
    },
    setImage: async (recipeId, oldUrl, heroUrl) => {
      // The service role can't pass admin_set_recipe_image's admin check, so
      // it writes the row directly, only if it still holds the old hotlink.
      const { data, error } = await supabase
        .from("recipes")
        .update({ image_url: heroUrl, image_origin: "admin_upload", image_source_url: null })
        .eq("id", recipeId)
        .eq("image_origin", "external_hotlink")
        .eq("image_url", oldUrl)
        .select("id");

      if (error) return { error: error.message };
      if (!data || data.length === 0) return { error: "recipe changed since it was read" };
      return { error: null };
    },
  };
}

async function main(): Promise<void> {
  const supabase = createClient<Database>(
    requireEnv("SUPABASE_URL"),
    requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { persistSession: false } },
  );
  const dryRun = process.argv.includes("--dry-run");
  const rows = await fetchLegacyRows(supabase);

  if (dryRun) {
    console.log(`Dry run, nothing written. ${rows.length} legacy hotlinked images to migrate:`);
    rows.forEach((row) => console.log(`  ${row.id}  ${row.imageUrl}`));
    return;
  }

  const deps = migrateDeps(supabase);
  const outcomes = await mapWithConcurrency(rows, CONCURRENCY, (row) =>
    migrateLegacyImage(row, deps),
  );

  outcomes.forEach((outcome) => {
    if (outcome.ok) {
      console.log(`Migrated ${outcome.recipeId}`);
    } else {
      console.warn(`Failed ${outcome.recipeId}  ${outcome.url}  (${outcome.reason})`);
    }
  });

  const failed = outcomes.filter((outcome) => !outcome.ok).length;
  console.log(
    `Images: ${outcomes.length - failed} migrated, ${failed} failed, ${failed} remaining.`,
  );

  if (failed === 0) {
    console.log(
      "Nothing left on Imgur: remove its remotePatterns entries from apps/web/next.config.ts.",
    );
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
