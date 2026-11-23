// cleanup-recipe-submissions: the daily retention sweep for user submitted
// recipes. Triggered by a pg_cron job at 03:30 UTC, never by a client.
// Spec: docs/specs/0064-user-submitted-recipes/index.md (AC-19)
//
// Three steps, each independent so one failing never blocks the others:
// 1. Rejected submissions reviewed over 90 days ago are deleted, then their
//    photo pairs removed. A failed remove leaves orphans for step 2 to take
//    on the next run.
// 2. recipe-submission-photos files over 24 hours old that no pending or
//    rejected submission points to are removed: replaced photos, abandoned
//    uploads, withdrawn rows the client failed to clean, and the private
//    originals of approved rows (already copied into recipe-images).
// 3. recipe_submission_usage rows older than 7 days are deleted.
//
// - Batches of 100, at most 20 batches per step per run; whatever is left
//   waits for the next run. A failed batch is reported to Sentry and ends
//   that step so a persistent error never loops.
// - POST {"dryRun": true} lists what would go without deleting anything.
// - Only the scheduled pg_cron job may call this: the caller must present the
//   legacy service role key or a new `sb_secret_...` key, as a Bearer token or
//   an `apikey` header, checked in constant time. Logs carry ids and paths
//   only, never recipe text.
import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";
import * as Sentry from "npm:@sentry/deno@10";

const BUCKET = "recipe-submission-photos";
const BATCH_SIZE = 100;
const MAX_BATCHES = 20;

const sentryDsn = Deno.env.get("SENTRY_DSN");
if (sentryDsn) {
  Sentry.init({ dsn: sentryDsn });
}

function reportError(error: unknown, context: Record<string, unknown>) {
  console.error(error, context);
  if (sentryDsn) {
    Sentry.captureException(error, { extra: context });
  }
}

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function timingSafeEqual(a: string, b: string): boolean {
  const encoder = new TextEncoder();
  const aBytes = encoder.encode(a);
  const bBytes = encoder.encode(b);
  const length = Math.max(aBytes.length, bBytes.length);
  let mismatch = aBytes.length === bBytes.length ? 0 : 1;
  for (let i = 0; i < length; i++) {
    mismatch |= (aBytes[i] ?? 0) ^ (bBytes[i] ?? 0);
  }
  return mismatch === 0;
}

/** The legacy service role key plus every named key in SUPABASE_SECRET_KEYS. */
function acceptedKeys(): string[] {
  const legacy = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  let secretKeys: string[] = [];
  try {
    const parsed = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}");
    secretKeys = Object.values(parsed).filter((key): key is string => typeof key === "string");
  } catch {
    // Not set or not JSON: only the legacy key is accepted.
  }
  return [legacy, ...secretKeys].filter((key) => key.length > 0);
}

function presentedKeys(req: Request): string[] {
  const authHeader = req.headers.get("Authorization") ?? "";
  const bearer = authHeader.startsWith("Bearer ") ? authHeader.slice("Bearer ".length) : "";
  return [bearer, req.headers.get("apikey") ?? ""].filter((key) => key.length > 0);
}

/** "jwt", "sb_secret", or "other", plus length: enough to diagnose, never the key. */
function keyShape(key: string): string {
  const kind = key.startsWith("eyJ") ? "jwt" : key.startsWith("sb_secret_") ? "sb_secret" : "other";
  return `${kind}:${key.length}`;
}

async function readDryRun(req: Request): Promise<boolean> {
  try {
    const body = await req.json();
    return body?.dryRun === true;
  } catch {
    return false;
  }
}

interface ExpiredRow {
  id: string;
  photo_path: string | null;
}

/** Both files of each photo pair. */
function photoFiles(rows: readonly ExpiredRow[]): string[] {
  return rows.flatMap((row) =>
    row.photo_path ? [`${row.photo_path}-hero.webp`, `${row.photo_path}-card.webp`] : [],
  );
}

/** Step 1. Returns how many rows went; a failed photo remove is left for step 2. */
async function deleteExpiredRejected(client: SupabaseClient): Promise<number> {
  let deleted = 0;

  for (let batch = 0; batch < MAX_BATCHES; batch++) {
    const { data, error } = await client.rpc("delete_expired_rejected_recipe_submissions", {
      p_limit: BATCH_SIZE,
    });

    if (error) {
      reportError(error, { stage: "delete_expired_rejected", batch, deleted });
      return deleted;
    }

    const rows: ExpiredRow[] = data ?? [];
    if (rows.length === 0) break;
    deleted += rows.length;
    console.log("cleanup-recipe-submissions: deleted rejected", { ids: rows.map((row) => row.id) });

    const files = photoFiles(rows);
    if (files.length > 0) {
      const { error: removeError } = await client.storage.from(BUCKET).remove(files);
      if (removeError) {
        reportError(removeError, { stage: "remove_rejected_photos", batch, count: files.length });
      }
    }

    if (rows.length < BATCH_SIZE) break;
  }

  return deleted;
}

/** Step 2. Returns how many files went. */
async function deleteOrphanFiles(client: SupabaseClient): Promise<number> {
  let deleted = 0;

  for (let batch = 0; batch < MAX_BATCHES; batch++) {
    const { data: names, error: listError } = await client.rpc(
      "list_orphan_recipe_submission_photos",
      { p_limit: BATCH_SIZE },
    );

    if (listError) {
      reportError(listError, { stage: "list_orphans", batch, deleted });
      return deleted;
    }

    const paths: string[] = names ?? [];
    if (paths.length === 0) break;

    const { data: removed, error: removeError } = await client.storage.from(BUCKET).remove(paths);

    if (removeError) {
      reportError(removeError, { stage: "remove_orphans", batch, deleted, count: paths.length });
      return deleted;
    }

    console.log("cleanup-recipe-submissions: removed orphans", { paths });
    deleted += removed?.length ?? 0;

    // Nothing removed means the same names would come back; stop rather than loop.
    if ((removed?.length ?? 0) === 0) break;
  }

  return deleted;
}

/** Step 3. Returns how many usage rows went. */
async function deleteOldUsage(client: SupabaseClient, dryRun: boolean): Promise<number> {
  const { data, error } = await client.rpc("delete_old_recipe_submission_usage", {
    p_dry_run: dryRun,
  });

  if (error) {
    reportError(error, { stage: "delete_old_usage", dryRun });
    return 0;
  }

  return typeof data === "number" ? data : 0;
}

async function dryRunReport(client: SupabaseClient): Promise<Response> {
  const limit = BATCH_SIZE * MAX_BATCHES;
  const [expired, orphans, usageRows] = await Promise.all([
    client.rpc("delete_expired_rejected_recipe_submissions", { p_limit: limit, p_dry_run: true }),
    client.rpc("list_orphan_recipe_submission_photos", { p_limit: limit }),
    deleteOldUsage(client, true),
  ]);

  const failed = [expired.error, orphans.error].find((error) => error !== null);
  if (failed) {
    reportError(failed, { stage: "dry_run" });
    return jsonResponse({ error: "dry run failed" }, 500);
  }

  const expiredRows: ExpiredRow[] = expired.data ?? [];
  const report = {
    dryRun: true,
    wouldDeleteRejected: expiredRows.map((row) => row.id),
    wouldDeleteOrphanFiles: [...photoFiles(expiredRows), ...(orphans.data ?? [])],
    wouldDeleteUsageRows: usageRows,
  };
  console.log("cleanup-recipe-submissions: dry run", report);
  return jsonResponse(report, 200);
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return jsonResponse({ error: "method not allowed" }, 405);
  }

  const accepted = acceptedKeys();
  const presented = presentedKeys(req);
  const matchedKey = accepted.find((key) =>
    presented.some((candidate) => timingSafeEqual(candidate, key)),
  );

  if (!matchedKey) {
    console.warn("cleanup-recipe-submissions: unauthorized", {
      hasLegacyServiceRoleKey: (Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "").length > 0,
      hasSecretKeys: (Deno.env.get("SUPABASE_SECRET_KEYS") ?? "").length > 0,
      acceptedShapes: accepted.map(keyShape),
      presentedShapes: presented.map(keyShape),
    });
    return jsonResponse({ error: "unauthorized" }, 401);
  }

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, matchedKey);

  if (await readDryRun(req)) {
    return dryRunReport(supabase);
  }

  // Rejected rows first: if removing their photos failed, those files are
  // now unreferenced and long past the 24 hour grace, so step 2 retries them
  // in this same run.
  const deletedRejected = await deleteExpiredRejected(supabase);
  const deletedOrphanFiles = await deleteOrphanFiles(supabase);
  const deletedUsageRows = await deleteOldUsage(supabase, false);

  const result = { deletedRejected, deletedOrphanFiles, deletedUsageRows };
  console.log("cleanup-recipe-submissions: run complete", result);
  return jsonResponse(result, 200);
});
