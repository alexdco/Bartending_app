// delete-account: permanently deletes the caller's own auth.users row, cascading
// to their pantry_items/favorites/user_preferences.
// Spec: docs/specs/0008-sign-in-and-cross-device-sync/index.md
// Comment photo folder cleanup: docs/specs/0032-recipe-comment-photos/index.md
//
// - supabase-js has no client method to delete a user, and a client held service
//   role key would expose it to every device, so this runs server side (AC-10).
// - The caller's identity is resolved from their own JWT via auth.getUser(), never
//   a client supplied id.
import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";
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

const COMMENT_PHOTOS_BUCKET = "comment-photos";
const FOLDER_PAGE_SIZE = 100;

async function removeCommentPhotoFolder(client: SupabaseClient, userId: string): Promise<void> {
  // Each pass lists the first page and removes it, so the folder shrinks
  // until a pass comes back empty. Capped so an error can never loop.
  for (let pass = 0; pass < 50; pass++) {
    const { data: files, error: listError } = await client.storage
      .from(COMMENT_PHOTOS_BUCKET)
      .list(userId, { limit: FOLDER_PAGE_SIZE });

    if (listError) {
      reportError(listError, { userId, stage: "list_comment_photos" });
      return;
    }

    if (!files || files.length === 0) return;

    const { error: removeError } = await client.storage
      .from(COMMENT_PHOTOS_BUCKET)
      .remove(files.map((file) => `${userId}/${file.name}`));

    if (removeError) {
      reportError(removeError, { userId, stage: "remove_comment_photos" });
      return;
    }
  }
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

  // Comment photos live in Storage, which the auth.users cascade never
  // reaches, so the user's own folder is emptied first (spec 0032). A
  // failure here does not block the account deletion: the daily orphan
  // sweep removes anything left once the photo rows are gone.
  await removeCommentPhotoFolder(serviceRoleClient, user.id);

  const { error: deleteError } = await serviceRoleClient.auth.admin.deleteUser(user.id);

  if (deleteError) {
    reportError(deleteError, { userId: user.id, stage: "delete_user" });
    return jsonResponse({ error: "failed to delete account" }, 502);
  }

  return jsonResponse({ success: true }, 200);
});
