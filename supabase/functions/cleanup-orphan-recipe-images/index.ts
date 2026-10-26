// cleanup-orphan-recipe-images: deletes recipe image files no recipe points
// to anymore. Triggered daily by a pg_cron job, never by a client.
// Spec: docs/specs/0041-self-hosted-recipe-images/index.md (AC-12)
//
// - Candidates come from list_orphan_recipe_images(), a SECURITY DEFINER SQL
//   function: objects in the recipe-images bucket older than 24 hours that
//   is_recipe_image_referenced() says no recipe's image_url points at. The
//   grace keeps a save still in progress (uploaded, not yet set) safe.
// - Covers replaced images, removed images, abandoned uploads, and failed
//   import copies in one path.
// - Batches of 100, oldest first, at most 20 batches per run; whatever is
//   left waits for the next run. A failed batch is reported to Sentry and
//   ends the run so a persistent error never loops.
// - POST {"dryRun": true} lists what would be deleted without deleting, for
//   the first runs (spec 0041 migration plan risks).
// - Only the scheduled pg_cron job may call this: the caller must present the
//   service role key as a Bearer token, checked in constant time.
import { createClient } from "jsr:@supabase/supabase-js@2";
import * as Sentry from "npm:@sentry/deno@10";

const BUCKET = "recipe-images";
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

async function readDryRun(req: Request): Promise<boolean> {
  try {
    const body = await req.json();
    return body?.dryRun === true;
  } catch {
    return false;
  }
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
  const dryRun = await readDryRun(req);

  if (dryRun) {
    const { data: names, error } = await supabase.rpc("list_orphan_recipe_images", {
      p_limit: BATCH_SIZE * MAX_BATCHES,
    });

    if (error) {
      reportError(error, { stage: "list_orphans", dryRun });
      return jsonResponse({ error: "failed to list orphans" }, 500);
    }

    console.log("cleanup-orphan-recipe-images: dry run", { wouldDelete: names });
    return jsonResponse({ dryRun: true, wouldDelete: names ?? [] }, 200);
  }

  let deleted = 0;
  let batches = 0;

  while (batches < MAX_BATCHES) {
    const { data: names, error: listError } = await supabase.rpc("list_orphan_recipe_images", {
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

    console.log("cleanup-orphan-recipe-images: removed", { paths });
    batches += 1;
    deleted += removed?.length ?? 0;

    // Nothing removed means the same names would come back; stop rather than loop.
    if ((removed?.length ?? 0) === 0) break;
  }

  console.log("cleanup-orphan-recipe-images: run complete", { deleted, batches });

  return jsonResponse({ deleted }, 200);
});
