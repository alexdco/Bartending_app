import { FunctionsHttpError, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";
import { DEFAULT_LOCALE, type Locale } from "./locale";

export interface GeneratedDrinkIdeaIngredient {
  name: string;
  /** English ingredient name, for pantry verification only; never shown to the user. */
  source_name: string;
  amount: string;
}

export interface GeneratedDrinkIdea {
  name: string;
  ingredients: GeneratedDrinkIdeaIngredient[];
  steps: string[];
  pantry_size: number;
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
  const { data, error } = await client.functions.invoke<
    GeneratedDrinkIdea | { error: string; resetsAt?: string }
  >("generate-drink-idea", { method: "POST", body: { locale } });

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

  if (!data || !("name" in data)) {
    throw new GenerateDrinkIdeaError("generation_failed", "Generation failed.");
  }

  return data;
}
