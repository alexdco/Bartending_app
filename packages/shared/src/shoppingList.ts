import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";
import { DEFAULT_LOCALE, type Locale } from "./locale";

export interface ShoppingListItem {
  ingredientId: string;
  name: string;
}

export async function fetchShoppingListItems(
  client: SupabaseClient<Database>,
  locale: Locale = DEFAULT_LOCALE,
  { mocktailsOnly = false }: { mocktailsOnly?: boolean } = {},
): Promise<ShoppingListItem[]> {
  // Mocktails only mode hides rows outside the visible ingredients; they stay
  // stored (spec 0063 AC-7). Omitted when false (AC-17).
  const { data, error } = await client.rpc("fetch_shopping_list_items", {
    p_locale: locale,
    ...(mocktailsOnly ? { p_mocktails_only: true } : {}),
  });

  if (error) {
    throw error;
  }

  return (data ?? []).map((row) => ({
    ingredientId: row.ingredient_id,
    name: row.name,
  }));
}

export async function addShoppingListItem(
  client: SupabaseClient<Database>,
  ingredientId: string,
): Promise<void> {
  const { data: sessionData, error: sessionError } = await client.auth.getSession();

  if (sessionError) {
    throw sessionError;
  }

  const userId = sessionData.session?.user.id;

  if (!userId) {
    throw new Error("No active session; cannot add a shopping list item.");
  }

  const { error } = await client
    .from("shopping_list_items")
    .upsert(
      { user_id: userId, ingredient_id: ingredientId },
      { onConflict: "user_id,ingredient_id", ignoreDuplicates: true },
    );

  if (error) {
    throw error;
  }
}

export async function removeShoppingListItem(
  client: SupabaseClient<Database>,
  ingredientId: string,
): Promise<void> {
  const { error } = await client
    .from("shopping_list_items")
    .delete()
    .eq("ingredient_id", ingredientId);

  if (error) {
    throw error;
  }
}

export async function buyShoppingListItem(
  client: SupabaseClient<Database>,
  ingredientId: string,
): Promise<void> {
  const { error } = await client.rpc("buy_shopping_list_item", {
    p_ingredient_id: ingredientId,
  });

  if (error) {
    throw error;
  }
}
