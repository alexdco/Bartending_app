import { describe, expect, it } from "vitest";
import { createSupabaseClient } from "./supabaseClient";

describe("createSupabaseClient", () => {
  it("returns a Supabase client when given a valid URL and key", () => {
    const client = createSupabaseClient("https://example.supabase.co", "anon-key");

    expect(client).toBeDefined();
    expect(client.auth).toBeDefined();
  });

  it("throws when the URL is empty", () => {
    expect(() => createSupabaseClient("", "anon-key")).toThrow();
  });
});
