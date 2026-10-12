import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";
import {
  addShoppingListItem,
  buyShoppingListItem,
  fetchShoppingListItems,
  removeShoppingListItem,
} from "./shoppingList";

type Result = { data: unknown; error: unknown };

// Stub Supabase client covering the calls shoppingList.ts makes: rpc for
// fetch and buy, from().upsert() for add, from().delete().eq() for remove,
// and auth.getSession() for the add's user id.
function stubSupabase({
  sessionUserId = "user-1",
  sessionError = null,
  rpcResult = { data: null, error: null },
  writeResult = { data: null, error: null },
}: {
  sessionUserId?: string | null;
  sessionError?: unknown;
  rpcResult?: Result;
  writeResult?: Result;
} = {}) {
  const deleteBuilder = { eq: vi.fn(() => Promise.resolve(writeResult)) };
  const tableBuilder = {
    upsert: vi.fn(() => Promise.resolve(writeResult)),
    delete: vi.fn(() => deleteBuilder),
  };
  const client = {
    auth: {
      getSession: vi.fn(() =>
        Promise.resolve({
          data: { session: sessionUserId ? { user: { id: sessionUserId } } : null },
          error: sessionError,
        }),
      ),
    },
    rpc: vi.fn(() => Promise.resolve(rpcResult)),
    from: vi.fn(() => tableBuilder),
  };
  return {
    client: client as unknown as SupabaseClient<Database>,
    mocks: { ...client, tableBuilder, deleteBuilder },
  };
}

describe("fetchShoppingListItems", () => {
  it("maps rows to items in the order the function returns them (AC-3)", async () => {
    const { client, mocks } = stubSupabase({
      rpcResult: {
        data: [
          { ingredient_id: "i-2", name: "Gin" },
          { ingredient_id: "i-1", name: "Lime" },
        ],
        error: null,
      },
    });

    await expect(fetchShoppingListItems(client, "es")).resolves.toEqual([
      { ingredientId: "i-2", name: "Gin" },
      { ingredientId: "i-1", name: "Lime" },
    ]);
    expect(mocks.rpc).toHaveBeenCalledWith("fetch_shopping_list_items", { p_locale: "es" });
  });

  it("defaults to the English locale", async () => {
    const { client, mocks } = stubSupabase({ rpcResult: { data: [], error: null } });

    await fetchShoppingListItems(client);

    expect(mocks.rpc).toHaveBeenCalledWith("fetch_shopping_list_items", { p_locale: "en" });
  });

  it("returns an empty list when the function returns no data", async () => {
    const { client } = stubSupabase({ rpcResult: { data: null, error: null } });

    await expect(fetchShoppingListItems(client)).resolves.toEqual([]);
  });

  it("throws the Supabase error", async () => {
    const { client } = stubSupabase({ rpcResult: { data: null, error: new Error("boom") } });

    await expect(fetchShoppingListItems(client)).rejects.toThrow("boom");
  });
});

describe("addShoppingListItem", () => {
  it("upserts for the session user, ignoring duplicates (AC-1, AC-7)", async () => {
    const { client, mocks } = stubSupabase({ sessionUserId: "user-7" });

    await addShoppingListItem(client, "i-1");

    expect(mocks.from).toHaveBeenCalledWith("shopping_list_items");
    expect(mocks.tableBuilder.upsert).toHaveBeenCalledWith(
      { user_id: "user-7", ingredient_id: "i-1" },
      { onConflict: "user_id,ingredient_id", ignoreDuplicates: true },
    );
  });

  it("throws without writing when there is no session", async () => {
    const { client, mocks } = stubSupabase({ sessionUserId: null });

    await expect(addShoppingListItem(client, "i-1")).rejects.toThrow("No active session");
    expect(mocks.tableBuilder.upsert).not.toHaveBeenCalled();
  });

  it("throws the session error", async () => {
    const { client, mocks } = stubSupabase({ sessionError: new Error("session lost") });

    await expect(addShoppingListItem(client, "i-1")).rejects.toThrow("session lost");
    expect(mocks.tableBuilder.upsert).not.toHaveBeenCalled();
  });

  it("throws the write error, so the hook can roll back (AC-10)", async () => {
    const { client } = stubSupabase({ writeResult: { data: null, error: new Error("fk") } });

    await expect(addShoppingListItem(client, "missing")).rejects.toThrow("fk");
  });
});

describe("removeShoppingListItem", () => {
  it("deletes the row for that ingredient (AC-2)", async () => {
    const { client, mocks } = stubSupabase();

    await removeShoppingListItem(client, "i-1");

    expect(mocks.from).toHaveBeenCalledWith("shopping_list_items");
    expect(mocks.tableBuilder.delete).toHaveBeenCalled();
    expect(mocks.deleteBuilder.eq).toHaveBeenCalledWith("ingredient_id", "i-1");
  });

  it("throws the write error (AC-10)", async () => {
    const { client } = stubSupabase({ writeResult: { data: null, error: new Error("offline") } });

    await expect(removeShoppingListItem(client, "i-1")).rejects.toThrow("offline");
  });
});

describe("buyShoppingListItem", () => {
  it("calls the atomic buy function with the ingredient id (AC-4)", async () => {
    const { client, mocks } = stubSupabase();

    await buyShoppingListItem(client, "i-1");

    expect(mocks.rpc).toHaveBeenCalledWith("buy_shopping_list_item", { p_ingredient_id: "i-1" });
  });

  it("throws the function error (AC-10)", async () => {
    const { client } = stubSupabase({ rpcResult: { data: null, error: new Error("denied") } });

    await expect(buyShoppingListItem(client, "i-1")).rejects.toThrow("denied");
  });
});
