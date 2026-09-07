import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

export interface PantryItem {
  ingredientId: string;
  name: string;
}

export async function fetchPantryItems(client: SupabaseClient<Database>): Promise<PantryItem[]> {
  const { data, error } = await client
    .from("pantry_items")
    .select("ingredient_id, ingredients ( name )");

  if (error) {
    throw error;
  }

  return (data ?? []).map((row) => ({
    ingredientId: row.ingredient_id,
    name: row.ingredients?.name ?? "",
  }));
}

export async function addPantryItem(
  client: SupabaseClient<Database>,
  ingredientId: string,
): Promise<void> {
  const { data: sessionData, error: sessionError } = await client.auth.getSession();

  if (sessionError) {
    throw sessionError;
  }

  const userId = sessionData.session?.user.id;

  if (!userId) {
    throw new Error("No active session; cannot add a pantry item.");
  }

  const { error } = await client
    .from("pantry_items")
    .upsert(
      { user_id: userId, ingredient_id: ingredientId },
      { onConflict: "user_id,ingredient_id", ignoreDuplicates: true },
    );

  if (error) {
    throw error;
  }
}

export async function removePantryItem(
  client: SupabaseClient<Database>,
  ingredientId: string,
): Promise<void> {
  const { error } = await client.from("pantry_items").delete().eq("ingredient_id", ingredientId);

  if (error) {
    throw error;
  }
}

export interface IngredientSearchResult {
  id: string;
  name: string;
}

export async function searchIngredients(
  client: SupabaseClient<Database>,
  query: string,
  resultLimit = 20,
): Promise<IngredientSearchResult[]> {
  const { data, error } = await client.rpc("search_ingredients", {
    query,
    result_limit: resultLimit,
  });

  if (error) {
    throw error;
  }

  return data ?? [];
}
