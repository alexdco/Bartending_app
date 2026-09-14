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

export class GenerateDrinkIdeaError extends Error {
  reason: GenerateDrinkIdeaErrorReason;
  resetsAt?: string;

  constructor(reason: GenerateDrinkIdeaErrorReason, message: string, resetsAt?: string) {
    super(message);
    this.reason = reason;
    this.resetsAt = resetsAt;
  }
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
        let resetsAt: string | undefined;
        try {
          const body = await error.context.json();
          resetsAt = body?.resetsAt;
        } catch {
          // response body already consumed or not JSON; resetsAt stays undefined
        }
        throw new GenerateDrinkIdeaError(
          "quota_exceeded",
          "Daily generation limit reached.",
          resetsAt,
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
