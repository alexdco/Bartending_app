// generate-drink-idea: turns a caller's pantry into a novel, AI generated drink idea.
// Spec: docs/specs/0007-ai-generated-pantry-drink-ideas.md
// Limits: docs/specs/0034-ai-quota-abuse-hardening/index.md
//
// - Never accepts a pantry ingredient list from the caller; always resolves the
//   caller's own pantry server side via auth.uid() (0007 AC-8).
// - The per user (tiered), per IP (guests only), and global daily limits are
//   checked and claimed in one database transaction before the Claude call, so
//   concurrent requests cannot push any counter past its limit (0034 AC-1 to AC-4).
// - A generation that still fails after its retry gives its slots back (0034 AC-4b).
// - One automatic retry on timeout, schema/pantry mismatch, or a 5xx from
//   Anthropic; never on a 4xx (0007 AC-7).
import { createClient } from "jsr:@supabase/supabase-js@2";
import Anthropic from "npm:@anthropic-ai/sdk@0.124.0";
import { zodOutputFormat } from "npm:@anthropic-ai/sdk@0.124.0/helpers/zod";
// The SDK zod helper needs the zod v4 API; plain `npm:zod@3` crashes it at runtime.
import { z } from "npm:zod@3.25.76/v4";
import * as Sentry from "npm:@sentry/deno@10";
import { clientIpFromHeaders, hashIpBucket, ipBucket } from "../_shared/ip-bucket.ts";

const MIN_PANTRY_INGREDIENTS = 2;
const ANON_DAILY_QUOTA = 5;
const LINKED_DAILY_QUOTA = 10;
const ANON_IP_DAILY_QUOTA = 20;
const GLOBAL_DAILY_CAP = 2000;
const ANON_GLOBAL_DAILY_CAP = 1600;
const ANTHROPIC_TIMEOUT_MS = 15_000;

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

function reportWarning(message: string, context: Record<string, unknown>) {
  console.warn(message, context);
  if (sentryDsn) {
    Sentry.captureMessage(message, { level: "warning", extra: context });
  }
}

type LimitReason = "user_limit" | "ip_limit" | "global_limit";

type Reservation = {
  readonly reason: LimitReason | null;
  readonly day: string;
  readonly total_count: number;
};

// Only the first 8 hex characters of an IP hash ever reach logs or Sentry.
function hashPrefix(ipHash: string | null): string | null {
  return ipHash === null ? null : ipHash.slice(0, 8);
}

// Guests only: the HMAC of the caller's IP bucket, from the edge set header.
async function guestIpHash(headers: Headers, secret: string, userId: string): Promise<string> {
  const clientIp = clientIpFromHeaders(headers);
  if (clientIp === null) {
    reportWarning("AI quota: client IP unknown, counting in the shared unknown bucket", {
      userId,
      stage: "ip_bucket",
    });
  }
  return hashIpBucket(ipBucket(clientIp), secret);
}

const SUPPORTED_LOCALES = ["en", "es"] as const;
type Locale = (typeof SUPPORTED_LOCALES)[number];
const DEFAULT_LOCALE: Locale = "en";

const LOCALE_NAMES: Record<Locale, string> = {
  en: "English",
  es: "Spanish",
};

function parseLocale(value: unknown): Locale {
  return typeof value === "string" && (SUPPORTED_LOCALES as readonly string[]).includes(value)
    ? (value as Locale)
    : DEFAULT_LOCALE;
}

const DrinkIdeaSchema = z.object({
  name: z.string().max(60),
  ingredients: z
    .array(z.object({ name: z.string(), source_name: z.string(), amount: z.string() }))
    .min(1)
    .max(8),
  steps: z.array(z.string()).min(1).max(10),
});

type DrinkIdea = z.infer<typeof DrinkIdeaSchema>;

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function startOfNextUtcDay(): string {
  const now = new Date();
  const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
  return next.toISOString();
}

function normalizeIngredientName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

async function generateWithClaude(
  anthropic: Anthropic,
  pantryNames: string[],
  locale: Locale,
): Promise<DrinkIdea | null> {
  const languageInstruction =
    locale === DEFAULT_LOCALE
      ? ""
      : `Write the name, ingredient names, and steps natively in ${LOCALE_NAMES[locale]}, ` +
        `as a native speaker would phrase them, not a literal translation. `;

  const message = await anthropic.messages.parse(
    {
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1024,
      messages: [
        {
          role: "user",
          content:
            `Invent one original cocktail or mocktail recipe using only these ingredients ` +
            `(you do not have to use all of them): ${pantryNames.join(", ")}.\n` +
            `${languageInstruction}` +
            `Give it a short, appealing name, a rough amount for each ingredient used, ` +
            `and numbered preparation steps. Do not use any ingredient not in this list. ` +
            `For each ingredient, also return "source_name": the exact English ingredient ` +
            `name from the list above (unchanged, for matching), alongside "name": the ` +
            `ingredient name written in the language requested above (or the same as ` +
            `source_name if no other language was requested).`,
        },
      ],
      output_config: {
        format: zodOutputFormat(DrinkIdeaSchema),
      },
    },
    { timeout: ANTHROPIC_TIMEOUT_MS },
  );

  const idea = message.parsed_output;
  if (!idea) {
    return null;
  }

  const pantrySet = new Set(pantryNames.map(normalizeIngredientName));
  const usesOnlyPantry = idea.ingredients.every((ingredient) =>
    pantrySet.has(normalizeIngredientName(ingredient.source_name)),
  );

  return usesOnlyPantry ? idea : null;
}

function isRetryableError(error: unknown): boolean {
  if (error instanceof Anthropic.APIError) {
    return error.status === undefined || error.status >= 500;
  }
  return true; // timeout, network error, or a schema/pantry mismatch (represented as thrown by caller)
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return jsonResponse({ error: "method not allowed" }, 405);
  }

  const authHeader = req.headers.get("Authorization") ?? "";

  let locale: Locale = DEFAULT_LOCALE;
  try {
    const body = await req.json();
    locale = parseLocale(body?.locale);
  } catch {
    // No body, or not JSON; default to English (matches the request's
    // pre step 8 shape, which never sent a body).
  }

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

  const { data: pantryRows, error: pantryError } = await supabase
    .from("pantry_items")
    .select("ingredients ( name )");

  if (pantryError) {
    reportError(pantryError, { userId: user.id, stage: "pantry_read" });
    return jsonResponse({ error: "failed to read pantry" }, 502);
  }

  const pantryNames = (pantryRows ?? [])
    .map((row) => (row.ingredients as { name: string } | null)?.name)
    .filter((name): name is string => Boolean(name));

  if (pantryNames.length < MIN_PANTRY_INGREDIENTS) {
    return jsonResponse({ error: "pantry too small to generate from" }, 422);
  }

  const serviceRoleClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const isAnonymous = user.is_anonymous === true;
  const ipHashSecret = Deno.env.get("IP_HASH_SECRET");

  // Fail closed for guests: without the secret there is no IP layer, and the
  // IP layer must never be skipped (0034 AC-7). Signed in callers carry on.
  if (isAnonymous && !ipHashSecret) {
    reportError(new Error("IP_HASH_SECRET is not set"), {
      userId: user.id,
      stage: "ip_hash_secret",
    });
    return jsonResponse({ error: "temporarily unavailable" }, 503);
  }

  const ipHash =
    isAnonymous && ipHashSecret ? await guestIpHash(req.headers, ipHashSecret, user.id) : null;

  // One transaction locks and checks the global, IP, and user rows, then
  // claims all three or none (0034 AC-4). The day comes back from SQL so a
  // later release hits the same rows.
  const { data: reservation, error: reserveError } = await serviceRoleClient
    .rpc("reserve_ai_generation_slot", {
      p_user_id: user.id,
      p_is_anonymous: isAnonymous,
      p_ip_hash: ipHash,
      p_user_limit: isAnonymous ? ANON_DAILY_QUOTA : LINKED_DAILY_QUOTA,
      p_ip_limit: ANON_IP_DAILY_QUOTA,
      p_global_limit: GLOBAL_DAILY_CAP,
      p_anon_global_limit: ANON_GLOBAL_DAILY_CAP,
    })
    .single<Reservation>();

  if (reserveError || !reservation) {
    reportError(reserveError, { userId: user.id, stage: "quota_reserve" });
    return jsonResponse({ error: "failed to check quota" }, 502);
  }

  if (reservation.reason !== null) {
    if (reservation.reason === "ip_limit") {
      const ipHashPrefix = hashPrefix(ipHash);
      console.warn("AI quota: ip_limit refusal", { ipHashPrefix });
      if (sentryDsn) {
        Sentry.addBreadcrumb({
          category: "ai-quota",
          message: "ip_limit refusal",
          level: "warning",
          data: { ipHashPrefix },
        });
      }
    }

    return jsonResponse(
      {
        error: "daily generation limit reached",
        reason: reservation.reason,
        resetsAt: startOfNextUtcDay(),
        signInHelps: isAnonymous && reservation.total_count < GLOBAL_DAILY_CAP,
      },
      429,
    );
  }

  // Exactly one successful reservation lands on each threshold per day (0034 AC-9).
  if (reservation.total_count === ANON_GLOBAL_DAILY_CAP) {
    reportWarning("AI quota: guests cut off for today", {
      day: reservation.day,
      totalCount: reservation.total_count,
    });
  }
  if (reservation.total_count === GLOBAL_DAILY_CAP) {
    reportWarning("AI quota: global cap reached", {
      day: reservation.day,
      totalCount: reservation.total_count,
    });
  }

  const anthropic = new Anthropic({ apiKey: Deno.env.get("ANTHROPIC_API_KEY") });

  let idea: DrinkIdea | null = null;
  let lastError: unknown = null;

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      idea = await generateWithClaude(anthropic, pantryNames, locale);
      if (idea) break;
      lastError = new Error("generation did not match the expected shape");
    } catch (error) {
      lastError = error;
      if (!isRetryableError(error)) break;
    }
  }

  if (!idea) {
    reportError(lastError, { userId: user.id, stage: "claude_generate" });

    // Give back every slot this request claimed, on the reserved day, so an
    // Anthropic outage cannot use up the day's caps. A failed release is only
    // reported; the caller still gets the 502 (0034 AC-4b).
    const { error: releaseError } = await serviceRoleClient.rpc("release_ai_generation_slot", {
      p_user_id: user.id,
      p_ip_hash: ipHash,
      p_day: reservation.day,
    });
    if (releaseError) {
      reportError(releaseError, {
        userId: user.id,
        ipHashPrefix: hashPrefix(ipHash),
        stage: "quota_release",
      });
    }

    return jsonResponse({ error: "generation failed" }, 502);
  }

  return jsonResponse({ ...idea, pantry_size: pantryNames.length }, 200);
});
