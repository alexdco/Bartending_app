import { FunctionsHttpError, type SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import type { Database } from "./database.types";
import { GenerateDrinkIdeaError, generateDrinkIdea, parseLimitDetails } from "./generateDrinkIdea";

const RESETS_AT = "2026-10-12T00:00:00.000Z";

function clientReturning(status: number, body: unknown): SupabaseClient<Database> {
  const response = new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
  return {
    functions: {
      invoke: async () => ({ data: null, error: new FunctionsHttpError(response) }),
    },
  } as unknown as SupabaseClient<Database>;
}

async function errorFrom(client: SupabaseClient<Database>): Promise<GenerateDrinkIdeaError> {
  const error = await generateDrinkIdea(client).catch((caught: unknown) => caught);
  expect(error).toBeInstanceOf(GenerateDrinkIdeaError);
  return error as GenerateDrinkIdeaError;
}

describe("generateDrinkIdea 429 parsing", () => {
  it.each(["user_limit", "ip_limit", "global_limit"] as const)(
    "carries the %s reason, reset time, and sign in hint",
    async (limitReason) => {
      const error = await errorFrom(
        clientReturning(429, {
          error: "daily generation limit reached",
          reason: limitReason,
          resetsAt: RESETS_AT,
          signInHelps: true,
        }),
      );
      expect(error.reason).toBe("quota_exceeded");
      expect(error.limitReason).toBe(limitReason);
      expect(error.resetsAt).toBe(RESETS_AT);
      expect(error.signInHelps).toBe(true);
    },
  );

  it("keeps signInHelps false when the server says signing in will not help", async () => {
    const error = await errorFrom(
      clientReturning(429, { reason: "global_limit", resetsAt: RESETS_AT, signInHelps: false }),
    );
    expect(error.signInHelps).toBe(false);
  });

  it("leaves the new fields undefined for a body from an older deploy", async () => {
    const error = await errorFrom(
      clientReturning(429, { error: "daily generation limit reached", resetsAt: RESETS_AT }),
    );
    expect(error.reason).toBe("quota_exceeded");
    expect(error.resetsAt).toBe(RESETS_AT);
    expect(error.limitReason).toBeUndefined();
    expect(error.signInHelps).toBeUndefined();
  });

  it("maps a 503 (guest IP layer unavailable) to generation_failed", async () => {
    const error = await errorFrom(clientReturning(503, { error: "temporarily unavailable" }));
    expect(error.reason).toBe("generation_failed");
  });
});

describe("parseLimitDetails", () => {
  it("drops an unknown reason and wrongly typed fields", () => {
    expect(parseLimitDetails({ reason: "made_up", resetsAt: 5, signInHelps: "yes" })).toEqual({
      resetsAt: undefined,
      limitReason: undefined,
      signInHelps: undefined,
    });
  });

  it("returns no details for a body that is not an object", () => {
    expect(parseLimitDetails(null)).toEqual({});
    expect(parseLimitDetails("oops")).toEqual({});
  });
});
