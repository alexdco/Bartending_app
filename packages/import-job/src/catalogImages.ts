import type { RecipeImageOrigin, RecipeImagePair } from "@bartendingapp/shared";

/** A recipe's stored image columns, read before the run. */
export interface StoredImageState {
  imageUrl: string | null;
  imageOrigin: RecipeImageOrigin | null;
  imageSourceUrl: string | null;
}

/** The three image fields import_catalog writes for one drink. */
export interface CatalogImageFields {
  imageUrl: string | null;
  imageOrigin: RecipeImageOrigin | null;
  imageSourceUrl: string | null;
}

export type CatalogImageDecision =
  | { kind: "keep"; fields: CatalogImageFields; reason: "admin_upload" | "unchanged_copy" }
  | { kind: "set"; fields: CatalogImageFields }
  | { kind: "copy"; thumbUrl: string };

function hotlink(thumbUrl: string | null): CatalogImageFields {
  return thumbUrl === null
    ? { imageUrl: null, imageOrigin: null, imageSourceUrl: null }
    : { imageUrl: thumbUrl, imageOrigin: "external_hotlink", imageSourceUrl: thumbUrl };
}

/**
 * What to do with one drink's image (spec 0041 state transitions):
 * - `admin_upload` is never touched (import_catalog also guards it, AC-6).
 * - A `catalog_copy` of the same thumb is kept, with or without the flag,
 *   so it is never downloaded again or downgraded (AC-7, AC-9).
 * - Otherwise, with `--copy-images` a thumb is copied (AC-7), and without
 *   it the thumb is hotlinked as today (AC-9).
 */
export function decideCatalogImage(
  thumbUrl: string | null,
  stored: StoredImageState | undefined,
  copyImages: boolean,
): CatalogImageDecision {
  if (stored?.imageOrigin === "admin_upload") {
    return { kind: "keep", fields: stored, reason: "admin_upload" };
  }

  if (
    thumbUrl !== null &&
    stored?.imageOrigin === "catalog_copy" &&
    stored.imageSourceUrl === thumbUrl
  ) {
    return { kind: "keep", fields: stored, reason: "unchanged_copy" };
  }

  if (copyImages && thumbUrl !== null) {
    return { kind: "copy", thumbUrl };
  }

  return { kind: "set", fields: hotlink(thumbUrl) };
}

export interface CopyDeps {
  download: (
    url: string,
  ) => Promise<{ data: Uint8Array; error: null } | { data: null; error: string }>;
  process: (
    bytes: Uint8Array,
  ) => Promise<{ data: RecipeImagePair; error: null } | { data: null; error: string }>;
  /** Uploads to `catalog/<sourceId>/…` and returns the hero's public URL. */
  upload: (
    sourceId: string,
    images: RecipeImagePair,
  ) => Promise<{ data: { heroUrl: string }; error: null } | { data: null; error: string }>;
}

export type CopyOutcome =
  | { ok: true; fields: CatalogImageFields }
  | { ok: false; fields: CatalogImageFields; reason: string };

/**
 * Copies one thumb into the bucket. Any failure falls back to the hotlink,
 * so the import still finishes and the next run tries again (AC-8).
 */
export async function copyCatalogImage(
  sourceId: string,
  thumbUrl: string,
  deps: CopyDeps,
): Promise<CopyOutcome> {
  const fail = (reason: string): CopyOutcome => ({ ok: false, fields: hotlink(thumbUrl), reason });

  const downloaded = await deps.download(thumbUrl);
  if (downloaded.error !== null) return fail(`download: ${downloaded.error}`);

  const processed = await deps.process(downloaded.data);
  if (processed.error !== null) return fail(`encode: ${processed.error}`);

  const uploaded = await deps.upload(sourceId, processed.data);
  if (uploaded.error !== null) return fail(`upload: ${uploaded.error}`);

  return {
    ok: true,
    fields: {
      imageUrl: uploaded.data.heroUrl,
      imageOrigin: "catalog_copy",
      imageSourceUrl: thumbUrl,
    },
  };
}

export interface CatalogImageSummary {
  copied: number;
  unchanged: number;
  failed: number;
}

export interface ResolvedCatalogImages {
  fieldsBySourceId: ReadonlyMap<string, CatalogImageFields>;
  summary: CatalogImageSummary;
  failures: readonly { sourceId: string; reason: string }[];
}

/** Decides every drink's image, running copies with `runCopies` (bounded concurrency). */
export async function resolveCatalogImages(
  drinks: readonly { sourceId: string; thumbUrl: string | null }[],
  stored: ReadonlyMap<string, StoredImageState>,
  copyImages: boolean,
  runCopies: (
    jobs: readonly { sourceId: string; thumbUrl: string }[],
  ) => Promise<readonly CopyOutcome[]>,
): Promise<ResolvedCatalogImages> {
  const decisions = drinks.map((drink) => ({
    sourceId: drink.sourceId,
    decision: decideCatalogImage(drink.thumbUrl, stored.get(drink.sourceId), copyImages),
  }));

  const jobs = decisions.flatMap(({ sourceId, decision }) =>
    decision.kind === "copy" ? [{ sourceId, thumbUrl: decision.thumbUrl }] : [],
  );
  const outcomes = await runCopies(jobs);
  const outcomeBySourceId = new Map(jobs.map((job, index) => [job.sourceId, outcomes[index]!]));

  const fieldsBySourceId = new Map(
    decisions.map(({ sourceId, decision }) => [
      sourceId,
      decision.kind === "copy" ? outcomeBySourceId.get(sourceId)!.fields : decision.fields,
    ]),
  );

  const failures = jobs.flatMap((job) => {
    const outcome = outcomeBySourceId.get(job.sourceId)!;
    return outcome.ok ? [] : [{ sourceId: job.sourceId, reason: outcome.reason }];
  });

  return {
    fieldsBySourceId,
    summary: {
      copied: outcomes.filter((outcome) => outcome.ok).length,
      unchanged: decisions.filter(
        ({ decision }) => decision.kind === "keep" && decision.reason === "unchanged_copy",
      ).length,
      failed: failures.length,
    },
    failures,
  };
}
