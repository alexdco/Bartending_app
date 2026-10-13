import { describe, expect, it } from "vitest";

import { REQUIRED, findMissing } from "./check-public-env.mjs";

const complete = {
  EXPO_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
  EXPO_PUBLIC_SUPABASE_ANON_KEY: "anon",
  EXPO_PUBLIC_POSTHOG_KEY: "phc_key",
  EXPO_PUBLIC_POSTHOG_HOST: "https://us.i.posthog.com",
};

describe("findMissing", () => {
  it("returns nothing when all four values are set", () => {
    expect(findMissing(complete)).toEqual([]);
  });

  it("returns every name when the env is empty", () => {
    expect(findMissing({})).toEqual([...REQUIRED]);
  });

  it("returns exactly the missing and blank names", () => {
    const env = {
      ...complete,
      EXPO_PUBLIC_SUPABASE_URL: undefined,
      EXPO_PUBLIC_POSTHOG_HOST: "   ",
    };
    expect(findMissing(env)).toEqual(["EXPO_PUBLIC_SUPABASE_URL", "EXPO_PUBLIC_POSTHOG_HOST"]);
  });

  it("treats an empty string as missing", () => {
    expect(findMissing({ ...complete, EXPO_PUBLIC_POSTHOG_KEY: "" })).toEqual([
      "EXPO_PUBLIC_POSTHOG_KEY",
    ]);
  });
});
