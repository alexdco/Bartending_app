// delete-account: permanently deletes the caller's own auth.users row, cascading
// to their pantry_items/favorites/user_preferences.
// Spec: docs/specs/0008-sign-in-and-cross-device-sync/index.md
//
// - supabase-js has no client method to delete a user, and a client held service
//   role key would expose it to every device, so this runs server side (AC-10).
// - The caller's identity is resolved from their own JWT via auth.getUser(), never
//   a client supplied id.
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

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return jsonResponse({ error: "method not allowed" }, 405);
  }

  const authHeader = req.headers.get("Authorization") ?? "";

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authHeader } },
  });

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return jsonResponse({ error: "no active session" }, 401);
  }

  const serviceRoleClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { error: deleteError } = await serviceRoleClient.auth.admin.deleteUser(user.id);

  if (deleteError) {
    reportError(deleteError, { userId: user.id, stage: "delete_user" });
    return jsonResponse({ error: "failed to delete account" }, 502);
  }

  return jsonResponse({ success: true }, 200);
});
