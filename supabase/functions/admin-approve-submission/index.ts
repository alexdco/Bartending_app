// admin-approve-submission: turns a pending recipe submission into a live
// community recipe (spec 0064 AC-11, AC-14).
// Spec: docs/specs/0064-user-submitted-recipes/index.md
//
// - Runs entirely as the caller: their own JWT resolves who they are, and
//   admin_approve_recipe_submission checks is_admin again inside the database,
//   which stays the authority for the stale check too.
// - Steps: confirm admin, read the submission and return 409 early when it is
//   no longer pending or its updated_at moved, generate the recipe id, then
//   call the atomic approve function.
// - Photos (copy into recipe-images, then delete the private originals) come
//   in build task 7; until then `keep_photo` is accepted and ignored.
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

// The web app calls this straight from the browser, so it answers the CORS
// preflight and labels every response.
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

type ApproveRecipe = {
  name: string;
  instructions: string;
  glass: string | null;
  alcoholic_status: string;
  region: string | null;
  ingredients: unknown[];
  tags: unknown[];
  flavor_profile: string[] | null;
  method: string | null;
  fame_score: number | null;
  bartender_tip: string | null;
};

type ApproveBody = {
  submission_id: string;
  expected_updated_at: string;
  keep_photo: boolean;
  recipe: ApproveRecipe;
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const optionalString = (value: unknown): value is string | null =>
  value === null || typeof value === "string";

/** Shape check only; the database validates the values themselves. */
function parseBody(raw: unknown): ApproveBody | null {
  if (!isRecord(raw) || !isRecord(raw.recipe)) return null;
  const recipe = raw.recipe;
  const ok =
    typeof raw.submission_id === "string" &&
    UUID_PATTERN.test(raw.submission_id) &&
    typeof raw.expected_updated_at === "string" &&
    typeof raw.keep_photo === "boolean" &&
    typeof recipe.name === "string" &&
    typeof recipe.instructions === "string" &&
    optionalString(recipe.glass) &&
    typeof recipe.alcoholic_status === "string" &&
    optionalString(recipe.region) &&
    Array.isArray(recipe.ingredients) &&
    Array.isArray(recipe.tags) &&
    (recipe.flavor_profile === null ||
      (Array.isArray(recipe.flavor_profile) &&
        recipe.flavor_profile.every((f) => typeof f === "string"))) &&
    optionalString(recipe.method) &&
    (recipe.fame_score === null || typeof recipe.fame_score === "number") &&
    optionalString(recipe.bartender_tip);
  return ok ? (raw as unknown as ApproveBody) : null;
}

/** The approve function's explicit codes, and 0030's plain validation messages. */
function statusForDatabaseError(message: string): { status: number; error: string } {
  switch (message) {
    case "not_admin":
      return { status: 403, error: "not_admin" };
    case "not_found":
      return { status: 404, error: "not_found" };
    case "stale":
      return { status: 409, error: "stale" };
    default:
      return { status: 422, error: "validation" };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "method not allowed" }, 405);
  }

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
  });

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user || user.is_anonymous) {
    return jsonResponse({ error: "no active session" }, 401);
  }

  const { data: isAdmin, error: adminError } = await supabase.rpc("is_current_user_admin");

  if (adminError) {
    reportError(adminError, { stage: "admin_check" });
    return jsonResponse({ error: "admin check failed" }, 502);
  }

  if (isAdmin !== true) {
    return jsonResponse({ error: "not_admin" }, 403);
  }

  const body = parseBody(await req.json().catch(() => null));

  if (!body) {
    return jsonResponse({ error: "invalid body" }, 400);
  }

  // Early stale check before any side effect (photos, task 7). The approve
  // function repeats it under a row lock, so this is never the only guard.
  const { data: submission, error: readError } = await supabase
    .from("recipe_submissions")
    .select("status, updated_at")
    .eq("id", body.submission_id)
    .maybeSingle();

  if (readError) {
    reportError(readError, { submissionId: body.submission_id, stage: "read_submission" });
    return jsonResponse({ error: "read failed" }, 502);
  }

  if (!submission) {
    return jsonResponse({ error: "not_found" }, 404);
  }

  if (
    submission.status !== "pending" ||
    Date.parse(submission.updated_at) !== Date.parse(body.expected_updated_at)
  ) {
    return jsonResponse({ error: "stale" }, 409);
  }

  const recipeId = crypto.randomUUID();
  const { recipe } = body;

  const { data: approvedId, error: approveError } = await supabase.rpc(
    "admin_approve_recipe_submission",
    {
      p_submission_id: body.submission_id,
      p_expected_updated_at: body.expected_updated_at,
      p_recipe_id: recipeId,
      p_name: recipe.name,
      p_instructions: recipe.instructions,
      p_glass: recipe.glass,
      p_alcoholic_status: recipe.alcoholic_status,
      p_region: recipe.region,
      p_ingredients: recipe.ingredients,
      p_tags: recipe.tags,
      p_flavor_profile: recipe.flavor_profile,
      p_set_method: true,
      p_method: recipe.method,
      p_set_fame_score: true,
      p_fame_score: recipe.fame_score,
      p_bartender_tip: recipe.bartender_tip,
      p_image_url: null,
    },
  );

  if (approveError) {
    // P0001 is a raised code or 0030 message; anything else (a constraint,
    // a timeout) is a server failure, not the admin's input.
    if (approveError.code !== "P0001") {
      reportError(approveError, { submissionId: body.submission_id, stage: "approve" });
      return jsonResponse({ error: "approve failed" }, 502);
    }
    const mapped = statusForDatabaseError(approveError.message);
    if (mapped.status === 422) {
      // A plain 0030 validation message; ids only in the report (invariant 8).
      return jsonResponse({ error: mapped.error, message: approveError.message }, 422);
    }
    return jsonResponse({ error: mapped.error }, mapped.status);
  }

  return jsonResponse({ recipe_id: approvedId }, 200);
});
