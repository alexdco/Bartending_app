// cleanup-orphan-comment-photos: deletes comment photo files nothing points
// to anymore. Triggered daily by a pg_cron job, never by a client.
// Spec: docs/specs/0032-recipe-comment-photos/index.md (AC-12)
//
// - Candidates come from list_orphan_comment_photos(), a SECURITY DEFINER SQL
//   function: objects in the comment-photos bucket older than 24 hours with no
//   comment_photos row. Attaching requires a file under 23 hours old, so a
//   file the sweep sees can never be attached mid run.
// - Covers abandoned uploads, failed client deletes, admin deletes, and
//   account deletions in one path.
// - Batches of 100, oldest first, at most 20 batches per run; whatever is
//   left waits for the next run. A failed batch is reported to Sentry and
//   ends the run so a persistent error never loops.
// - Only the scheduled pg_cron job may call this: the caller must present the
//   service role key as a Bearer token, checked in constant time.
import { createClient } from "jsr:@supabase/supabase-js@2";
import * as Sentry from "npm:@sentry/deno@10";

const BUCKET = "comment-photos";
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

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return jsonResponse({ error: "method not allowed" }, 405);
  }

  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const authHeader = req.headers.get("Authorization") ?? "";
  const presentedToken = authHeader.startsWith("Bearer ") ? authHeader.slice("Bearer ".length) : "";

  if (!timingSafeEqual(presentedToken, serviceRoleKey)) {
    return jsonResponse({ error: "unauthorized" }, 401);
  }

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, serviceRoleKey);

  let deleted = 0;
  let batches = 0;

  while (batches < MAX_BATCHES) {
    const { data: names, error: listError } = await supabase.rpc("list_orphan_comment_photos", {
      p_limit: BATCH_SIZE,
    });

    if (listError) {
      reportError(listError, { stage: "list_orphans", batches, deleted });
      return jsonResponse({ error: "failed to list orphans", deleted }, 500);
    }

    const paths: string[] = names ?? [];
    if (paths.length === 0) break;

    const { data: removed, error: removeError } = await supabase.storage.from(BUCKET).remove(paths);

    if (removeError) {
      reportError(removeError, { stage: "remove", batches, deleted, count: paths.length });
      return jsonResponse({ error: "failed to remove orphans", deleted }, 500);
    }

    batches += 1;
    deleted += removed?.length ?? 0;

    // Nothing removed means the same names would come back; stop rather than loop.
    if ((removed?.length ?? 0) === 0) break;
  }

  console.log("cleanup-orphan-comment-photos: run complete", { deleted, batches });

  return jsonResponse({ deleted }, 200);
});
