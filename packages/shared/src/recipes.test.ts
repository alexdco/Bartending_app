import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";
import { DEFAULT_SEARCH_SORT, SEARCH_SORTS, parseSearchSort, searchRecipes } from "./recipes";

describe("parseSearchSort (spec 0061 AC-8, AC-14)", () => {
  it("reads exactly 'az' as A to Z", () => {
    expect(parseSearchSort("az")).toBe("az");
  });

  it.each([["zzz"], ["AZ"], [" az"], [""], [undefined], [null], [["az"]], [1], ["popular"]])(
    "reads %j as Popular",
    (raw) => {
      expect(parseSearchSort(raw)).toBe("popular");
    },
  );

  it("defaults to Popular and lists exactly two sorts", () => {
    expect(DEFAULT_SEARCH_SORT).toBe("popular");
    expect(SEARCH_SORTS).toEqual(["popular", "az"]);
  });
});

describe("searchRecipes sort (spec 0061 AC-3, AC-14)", () => {
  function fakeClient() {
    const rpc = vi.fn(() => Promise.resolve({ data: [], error: null }));
    return { rpc, client: { rpc } as unknown as SupabaseClient<Database> };
  }

  it("always sends sort_order, Popular when no sort is given", async () => {
    const { rpc, client } = fakeClient();
    await searchRecipes(client, { query: "lime", locale: "es" });
    expect(rpc).toHaveBeenCalledWith("search_recipes", {
      query: "lime",
      status_filter: undefined,
      page_limit: 20,
      page_offset: 0,
      locale: "es",
      sort_order: "popular",
    });
  });

  it("passes A to Z through as 'az'", async () => {
    const { rpc, client } = fakeClient();
    await searchRecipes(client, { sort: "az", statusFilter: "alcoholic" });
    expect(rpc).toHaveBeenCalledWith(
      "search_recipes",
      expect.objectContaining({ sort_order: "az", status_filter: "alcoholic" }),
    );
  });

  it("throws the Supabase error as before", async () => {
    const error = { message: "boom" };
    const rpc = vi.fn(() => Promise.resolve({ data: null, error }));
    const client = { rpc } as unknown as SupabaseClient<Database>;
    await expect(searchRecipes(client, { sort: "az" })).rejects.toBe(error);
  });
});
