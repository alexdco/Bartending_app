import { FunctionsHttpError, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";
import { DEFAULT_LOCALE, type Locale } from "./locale";

export interface GeneratedDrinkIdeaIngredient {
  name: string;
  /** English ingredient name, for pantry verification only; never shown to the user. */
  source_name: string;
  amount: string;
}

/** The idea's garnish (spec 0059 AC-1); the server alone decides `in_pantry`. */
export interface GeneratedDrinkIdeaGarnish {
  /** Localized garnish name, shown on the card. */
  readonly name: string;
  /** English ingredient name, for the pantry check only; never shown to the user. */
  readonly source_name: string;
  /** False means the card labels it optional and not in your pantry. */
  readonly in_pantry: boolean;
}

export interface GeneratedDrinkIdea {
  name: string;
  ingredients: GeneratedDrinkIdeaIngredient[];
  garnish: GeneratedDrinkIdeaGarnish | null;
  steps: string[];
  pantry_size: number;
}

const isString = (value: unknown): value is string => typeof value === "string";

function isIngredient(value: unknown): value is GeneratedDrinkIdeaIngredient {
  if (typeof value !== "object" || value === null) return false;
  const fields = value as Record<string, unknown>;
  return isString(fields.name) && isString(fields.source_name) && isString(fields.amount);
}

function parseGarnish(value: unknown): GeneratedDrinkIdeaGarnish | null {
  if (typeof value !== "object" || value === null) return null;
  const fields = value as Record<string, unknown>;
  return isString(fields.name) &&
    fields.name.trim() !== "" &&
    isString(fields.source_name) &&
    typeof fields.in_pantry === "boolean"
    ? { name: fields.name, source_name: fields.source_name, in_pantry: fields.in_pantry }
    : null;
}

/**
 * The function's success body as a GeneratedDrinkIdea, or null when its core
 * fields are missing. A missing or malformed garnish becomes null (spec 0059 AC-1).
 */
export function parseGeneratedDrinkIdea(body: unknown): GeneratedDrinkIdea | null {
  if (typeof body !== "object" || body === null) return null;
  const fields = body as Record<string, unknown>;
  const { name, ingredients, steps, pantry_size: pantrySize } = fields;
  if (
    !isString(name) ||
    !Array.isArray(ingredients) ||
    !ingredients.every(isIngredient) ||
    !Array.isArray(steps) ||
    !steps.every(isString) ||
    typeof pantrySize !== "number"
  ) {
    return null;
  }
  return {
    name,
    ingredients,
    garnish: parseGarnish(fields.garnish),
    steps,
    pantry_size: pantrySize,
  };
}

export type GenerateDrinkIdeaErrorReason =
  "no_session" | "pantry_too_small" | "quota_exceeded" | "generation_failed";

/** Which daily limit refused a 429 (spec 0034 AC-5). */
export type DrinkIdeaLimitReason = "user_limit" | "ip_limit" | "global_limit";

const LIMIT_REASONS: readonly DrinkIdeaLimitReason[] = ["user_limit", "ip_limit", "global_limit"];

export interface DrinkIdeaLimitDetails {
  readonly resetsAt?: string;
  readonly limitReason?: DrinkIdeaLimitReason;
  readonly signInHelps?: boolean;
}

export class GenerateDrinkIdeaError extends Error {
  readonly reason: GenerateDrinkIdeaErrorReason;
  readonly resetsAt?: string;
  /** Undefined when the function predates spec 0034, so callers keep the generic message. */
  readonly limitReason?: DrinkIdeaLimitReason;
  readonly signInHelps?: boolean;

  constructor(
    reason: GenerateDrinkIdeaErrorReason,
    message: string,
    details: DrinkIdeaLimitDetails = {},
  ) {
    super(message);
    this.reason = reason;
    this.resetsAt = details.resetsAt;
    this.limitReason = details.limitReason;
    this.signInHelps = details.signInHelps;
  }
}

function isLimitReason(value: unknown): value is DrinkIdeaLimitReason {
  return typeof value === "string" && (LIMIT_REASONS as readonly string[]).includes(value);
}

/** Reads the 429 body's fields, dropping any that are missing or malformed. */
export function parseLimitDetails(body: unknown): DrinkIdeaLimitDetails {
  if (typeof body !== "object" || body === null) return {};
  const fields = body as Record<string, unknown>;
  return {
    resetsAt: typeof fields.resetsAt === "string" ? fields.resetsAt : undefined,
    limitReason: isLimitReason(fields.reason) ? fields.reason : undefined,
    signInHelps: typeof fields.signInHelps === "boolean" ? fields.signInHelps : undefined,
  };
}

export async function generateDrinkIdea(
  client: SupabaseClient<Database>,
  locale: Locale = DEFAULT_LOCALE,
): Promise<GeneratedDrinkIdea> {
  const { data, error } = await client.functions.invoke<unknown>("generate-drink-idea", {
    method: "POST",
    body: { locale },
  });

  if (error) {
    if (error instanceof FunctionsHttpError) {
      const status = error.context.status as number;

      if (status === 401) {
        throw new GenerateDrinkIdeaError("no_session", "No active session.");
      }
      if (status === 422) {
        throw new GenerateDrinkIdeaError("pantry_too_small", "Pantry too small to generate from.");
      }
      if (status === 429) {
        let details: DrinkIdeaLimitDetails = {};
        try {
          details = parseLimitDetails(await error.context.json());
        } catch {
          // response body already consumed or not JSON; the details stay empty
        }
        throw new GenerateDrinkIdeaError(
          "quota_exceeded",
          "Daily generation limit reached.",
          details,
        );
      }
    }

    throw new GenerateDrinkIdeaError("generation_failed", "Generation failed.");
  }

  const idea = parseGeneratedDrinkIdea(data);
  if (idea === null) {
    throw new GenerateDrinkIdeaError("generation_failed", "Generation failed.");
  }

  return idea;
}
