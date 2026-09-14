// generate-drink-idea: turns a caller's pantry into a novel, AI generated drink idea.
// Spec: docs/specs/0007-ai-generated-pantry-drink-ideas.md
//
// - Never accepts a pantry ingredient list from the caller; always resolves the
//   caller's own pantry server side via auth.uid() (AC-8).
// - Quota is reserved atomically before the Claude call, not incremented after
//   success, so two concurrent requests from the same user cannot both pass (AC-4).
// - One automatic retry on timeout, schema/pantry mismatch, or a 5xx from
//   Anthropic; never on a 4xx (AC-7).
import { createClient } from "jsr:@supabase/supabase-js@2";
import Anthropic from "npm:@anthropic-ai/sdk@0.124.0";
import { zodOutputFormat } from "npm:@anthropic-ai/sdk@0.124.0/helpers/zod";
import { z } from "npm:zod@3";
import * as Sentry from "npm:@sentry/deno@10";

const MIN_PANTRY_INGREDIENTS = 2;
const DAILY_QUOTA = 10;
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

  const today = new Date().toISOString().slice(0, 10);

  // A plain upsert cannot express "increment only under the limit" atomically
  // via the JS client, so the reservation runs as a single SQL statement
  // (insert ... on conflict ... where count < limit returning), closing the
  // race a separate check-then-increment would leave open (AC-4).
  const { data: reserved, error: reserveError } = await serviceRoleClient.rpc(
    "reserve_ai_generation_quota",
    { p_user_id: user.id, p_day: today, p_limit: DAILY_QUOTA },
  );

  if (reserveError) {
    reportError(reserveError, { userId: user.id, stage: "quota_reserve" });
    return jsonResponse({ error: "failed to check quota" }, 502);
  }

  if (!reserved) {
    return jsonResponse(
      { error: "daily generation limit reached", resetsAt: startOfNextUtcDay() },
      429,
    );
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
    return jsonResponse({ error: "generation failed" }, 502);
  }

  return jsonResponse({ ...idea, pantry_size: pantryNames.length }, 200);
});
