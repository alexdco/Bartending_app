// cleanup-anonymous-accounts: deletes anonymous Supabase accounts idle past
// the 30 day retention window. Triggered weekly by a pg_cron job, never by a
// client; never touches a linked (non anonymous) or pending-confirmation account.
// Spec: docs/specs/0017-idle-anonymous-account-cleanup-job.md
//
// - Candidates come from select_idle_anonymous_accounts(), a SECURITY DEFINER
//   SQL function scoped to is_anonymous = true and email is null (AC-1, AC-2, AC-2b).
// - Every candidate is re-checked with is_candidate_still_idle() immediately
//   before deletion, closing the gap between selection and deletion (AC-7b).
// - A single failed deletion never aborts the run; it's logged and reported to
//   Sentry, and stays eligible for the next scheduled run (AC-7, AC-8).
// - Only the scheduled pg_cron job may call this: the caller must present the
//   service role key as a Bearer token, checked in constant time (AC-9).
import { createClient } from "jsr:@supabase/supabase-js@2";
import * as Sentry from "npm:@sentry/deno@10";

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

  const { data: candidates, error: selectError } = await supabase.rpc(
    "select_idle_anonymous_accounts",
  );

  if (selectError) {
    reportError(selectError, { stage: "select_candidates" });
    return jsonResponse({ error: "failed to select candidates" }, 500);
  }

  const candidateIds = (candidates ?? []).map((row: { id: string }) => row.id);
  console.log("cleanup-anonymous-accounts: candidates selected", {
    count: candidateIds.length,
    ids: candidateIds,
  });

  let deleted = 0;
  let failed = 0;

  for (const userId of candidateIds) {
    const { data: stillIdle, error: recheckError } = await supabase.rpc("is_candidate_still_idle", {
      p_user_id: userId,
    });

    if (recheckError) {
      failed += 1;
      reportError(recheckError, { userId, stage: "recheck" });
      continue;
    }

    if (!stillIdle) {
      console.log("cleanup-anonymous-accounts: skipped, no longer idle", { userId });
      continue;
    }

    const { error: deleteError } = await supabase.auth.admin.deleteUser(userId);

    if (deleteError) {
      failed += 1;
      reportError(deleteError, { userId, stage: "delete_user" });
      continue;
    }

    deleted += 1;
  }

  console.log("cleanup-anonymous-accounts: run complete", {
    candidates: candidateIds.length,
    deleted,
    failed,
  });

  return jsonResponse({ candidates: candidateIds.length, deleted, failed }, 200);
});
