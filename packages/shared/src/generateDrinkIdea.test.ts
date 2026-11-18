import { FunctionsHttpError, type SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import type { Database } from "./database.types";
import {
  GenerateDrinkIdeaError,
  generateDrinkIdea,
  parseGeneratedDrinkIdea,
  parseLimitDetails,
} from "./generateDrinkIdea";

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

// Spec 0059 AC-1, AC-2: the garnish is optional on the wire, so a response from
// an older deploy or with a malformed garnish still renders, with no garnish line.
describe("parseGeneratedDrinkIdea", () => {
  const body = {
    name: "Lime Vodka Sour",
    ingredients: [{ name: "Vodka", source_name: "Vodka", amount: "45 ml" }],
    garnish: { name: "lime wheel", source_name: "Lime", in_pantry: false },
    steps: ["Shake with ice."],
    pantry_size: 3,
  };

  it("keeps a well formed garnish", () => {
    expect(parseGeneratedDrinkIdea(body)?.garnish).toEqual({
      name: "lime wheel",
      source_name: "Lime",
      in_pantry: false,
    });
  });

  it("turns a missing garnish into null", () => {
    const withoutGarnish = Object.fromEntries(
      Object.entries(body).filter(([key]) => key !== "garnish"),
    );
    expect(parseGeneratedDrinkIdea(withoutGarnish)).toEqual({ ...withoutGarnish, garnish: null });
  });

  it.each([
    ["no name", { source_name: "Lime", in_pantry: true }],
    ["a blank name", { name: "  ", source_name: "Lime", in_pantry: true }],
    ["no in_pantry", { name: "lime wheel", source_name: "Lime" }],
    ["a string", "lime wheel"],
  ])("turns a garnish with %s into null", (_label, garnish) => {
    expect(parseGeneratedDrinkIdea({ ...body, garnish })?.garnish).toBeNull();
  });

  it("drops fields the client never sees, such as name_source_names", () => {
    expect(parseGeneratedDrinkIdea({ ...body, name_source_names: ["Vodka"] })).toEqual(body);
  });

  it.each([
    ["null", null],
    ["an error body", { error: "generation failed" }],
    ["no steps", { ...body, steps: undefined }],
    ["a malformed ingredient", { ...body, ingredients: [{ name: "Vodka" }] }],
  ])("returns null for %s", (_label, value) => {
    expect(parseGeneratedDrinkIdea(value)).toBeNull();
  });
});
