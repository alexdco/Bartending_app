import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

export interface Bar {
  id: string;
  name: string;
  createdBy: string;
  createdAt: string;
}

export interface BarMember {
  barId: string;
  userId: string;
  role: "owner" | "staff";
  joinedAt: string;
}

export interface BarInvite {
  id: string;
  barId: string;
  email: string;
  invitedBy: string;
  status: "pending" | "accepted" | "revoked";
  createdAt: string;
  expiresAt: string;
  acceptedBy: string | null;
}

export interface BarRecipeIngredient {
  ingredientId: string;
  name: string;
  amountValue: number | null;
  amountUnit: string | null;
  sortOrder: number;
}

export interface BarRecipe {
  id: string;
  baseRecipeId: string | null;
  name: string;
  method: string | null;
  straining: string | null;
  instructions: string | null;
  glass: string | null;
  ice: string | null;
  garnish: string | null;
  ingredients: BarRecipeIngredient[];
}

export interface BarMenuItem {
  id: string;
  barRecipeId: string;
  name: string;
  sortOrder: number;
  active: boolean;
}

export interface BarStock86Entry {
  ingredientId: string;
  is86d: boolean;
}

export interface BarServiceData {
  menu: BarMenuItem[];
  houseRecipes: BarRecipe[];
  stock86: BarStock86Entry[];
}

async function currentUserId(client: SupabaseClient<Database>): Promise<string> {
  const { data: sessionData, error: sessionError } = await client.auth.getSession();

  if (sessionError) {
    throw sessionError;
  }

  const userId = sessionData.session?.user.id;

  if (!userId) {
    throw new Error("No active session; a bar action requires a signed in user.");
  }

  return userId;
}

// Creates a bar and makes the calling (linked) user its owner. Two writes,
// not one RPC: RLS on bars_insert only requires created_by = auth.uid(), and
// bar_members has no insert policy for a fresh bar (membership normally only
// grows via accept_bar_invite), so the client creates the bar then the
// owner's membership row itself, in that order.
export async function createBar(client: SupabaseClient<Database>, name: string): Promise<Bar> {
  const userId = await currentUserId(client);

  const { data: bar, error: barError } = await client
    .from("bars")
    .insert({ name, created_by: userId })
    .select()
    .single();

  if (barError || !bar) {
    throw barError ?? new Error("Failed to create bar.");
  }

  const { error: memberError } = await client
    .from("bar_members")
    .insert({ bar_id: bar.id, user_id: userId, role: "owner" });

  if (memberError) {
    throw memberError;
  }

  return {
    id: bar.id,
    name: bar.name,
    createdBy: bar.created_by,
    createdAt: bar.created_at,
  };
}

export interface BarMembership extends Bar {
  role: "owner" | "staff";
}

export async function fetchMyBars(client: SupabaseClient<Database>): Promise<BarMembership[]> {
  const { data, error } = await client
    .from("bar_members")
    .select("role, bars(id, name, created_by, created_at)");

  if (error) {
    throw error;
  }

  return (data ?? [])
    .filter((row): row is typeof row & { bars: NonNullable<(typeof row)["bars"]> } =>
      Boolean(row.bars),
    )
    .map((row) => ({
      id: row.bars.id,
      name: row.bars.name,
      createdBy: row.bars.created_by,
      createdAt: row.bars.created_at,
      role: row.role as "owner" | "staff",
    }));
}

export async function inviteStaff(
  client: SupabaseClient<Database>,
  barId: string,
  email: string,
): Promise<BarInvite> {
  const userId = await currentUserId(client);

  const { data, error } = await client
    .from("bar_invites")
    .insert({ bar_id: barId, email: email.toLowerCase(), invited_by: userId })
    .select()
    .single();

  if (error || !data) {
    throw error ?? new Error("Failed to create invite.");
  }

  return {
    id: data.id,
    barId: data.bar_id,
    email: data.email,
    invitedBy: data.invited_by,
    status: data.status as BarInvite["status"],
    createdAt: data.created_at,
    expiresAt: data.expires_at,
    acceptedBy: data.accepted_by,
  };
}

export async function revokeInvite(
  client: SupabaseClient<Database>,
  inviteId: string,
): Promise<void> {
  const { error } = await client
    .from("bar_invites")
    .update({ status: "revoked" })
    .eq("id", inviteId);

  if (error) {
    throw error;
  }
}

export async function acceptInvite(
  client: SupabaseClient<Database>,
  inviteId: string,
): Promise<BarMember> {
  const { data, error } = await client.rpc("accept_bar_invite", { p_invite_id: inviteId });

  if (error) {
    throw error;
  }

  if (!data) {
    throw new Error("accept_bar_invite returned no membership row.");
  }

  return {
    barId: data.bar_id,
    userId: data.user_id,
    role: data.role as "owner" | "staff",
    joinedAt: data.joined_at,
  };
}

export async function leaveBar(client: SupabaseClient<Database>, barId: string): Promise<void> {
  const userId = await currentUserId(client);

  const { error } = await client
    .from("bar_members")
    .delete()
    .eq("bar_id", barId)
    .eq("user_id", userId);

  if (error) {
    throw error;
  }
}

export async function toggleStock(
  client: SupabaseClient<Database>,
  barId: string,
  ingredientId: string,
  is86d: boolean,
): Promise<void> {
  const { error } = await client.rpc("toggle_86_status", {
    p_bar_id: barId,
    p_ingredient_id: ingredientId,
    p_is_86d: is86d,
  });

  if (error) {
    throw error;
  }
}

interface RawBarServiceRow {
  menu: unknown;
  house_recipes: unknown;
  stock_86: unknown;
}

function mapMenu(raw: unknown): BarMenuItem[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw.map((row) => ({
    id: row.id,
    barRecipeId: row.bar_recipe_id,
    name: row.name,
    sortOrder: row.sort_order,
    active: row.active,
  }));
}

function mapHouseRecipes(raw: unknown): BarRecipe[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw.map((row) => ({
    id: row.id,
    baseRecipeId: row.base_recipe_id,
    name: row.name,
    method: row.method,
    straining: row.straining,
    instructions: row.instructions,
    glass: row.glass,
    ice: row.ice,
    garnish: row.garnish,
    ingredients: Array.isArray(row.ingredients)
      ? row.ingredients.map((ingredient: Record<string, unknown>) => ({
          ingredientId: ingredient.ingredient_id,
          name: ingredient.name,
          amountValue: ingredient.amount_value,
          amountUnit: ingredient.amount_unit,
          sortOrder: ingredient.sort_order,
        }))
      : [],
  }));
}

function mapStock86(raw: unknown): BarStock86Entry[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw.map((row) => ({
    ingredientId: row.ingredient_id,
    is86d: row.is_86d,
  }));
}

export async function fetchBarServiceData(
  client: SupabaseClient<Database>,
  barId: string,
): Promise<BarServiceData> {
  const { data, error } = await client.rpc("fetch_bar_service_data", { p_bar_id: barId });

  if (error) {
    throw error;
  }

  const row = (data?.[0] ?? null) as RawBarServiceRow | null;

  return {
    menu: mapMenu(row?.menu),
    houseRecipes: mapHouseRecipes(row?.house_recipes),
    stock86: mapStock86(row?.stock_86),
  };
}

export interface CreateBarRecipeInput {
  barId: string;
  baseRecipeId?: string;
  name: string;
  method?: string | null;
  straining?: string | null;
  instructions?: string | null;
  glass?: string | null;
  ice?: string | null;
  garnish?: string | null;
  ingredients: {
    ingredientId: string;
    amountValue: number | null;
    amountUnit: string | null;
    sortOrder: number;
  }[];
}

export async function createBarRecipe(
  client: SupabaseClient<Database>,
  input: CreateBarRecipeInput,
): Promise<string> {
  const userId = await currentUserId(client);

  const { data: recipe, error: recipeError } = await client
    .from("bar_recipes")
    .insert({
      bar_id: input.barId,
      base_recipe_id: input.baseRecipeId ?? null,
      name: input.name,
      method: input.method ?? null,
      straining: input.straining ?? null,
      instructions: input.instructions ?? null,
      glass: input.glass ?? null,
      ice: input.ice ?? null,
      garnish: input.garnish ?? null,
      created_by: userId,
    })
    .select("id")
    .single();

  if (recipeError || !recipe) {
    throw recipeError ?? new Error("Failed to create house recipe.");
  }

  if (input.ingredients.length > 0) {
    const { error: ingredientsError } = await client.from("bar_recipe_ingredients").insert(
      input.ingredients.map((ingredient) => ({
        bar_recipe_id: recipe.id,
        ingredient_id: ingredient.ingredientId,
        amount_value: ingredient.amountValue,
        amount_unit: ingredient.amountUnit,
        sort_order: ingredient.sortOrder,
      })),
    );

    if (ingredientsError) {
      throw ingredientsError;
    }
  }

  return recipe.id;
}

export async function deleteBarRecipe(
  client: SupabaseClient<Database>,
  barRecipeId: string,
): Promise<void> {
  const { error } = await client
    .from("bar_recipes")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", barRecipeId);

  if (error) {
    throw error;
  }
}

export async function setMenuItem(
  client: SupabaseClient<Database>,
  barId: string,
  barRecipeId: string,
  sortOrder: number,
  active: boolean,
): Promise<void> {
  const { error } = await client
    .from("bar_menu_items")
    .upsert(
      { bar_id: barId, bar_recipe_id: barRecipeId, sort_order: sortOrder, active },
      { onConflict: "bar_id,bar_recipe_id" },
    );

  if (error) {
    throw error;
  }
}

export interface PinnedItem {
  id: string;
  recipeId: string | null;
  barRecipeId: string | null;
  sortOrder: number;
  pinnedAt: string;
}

export async function fetchPinnedRecipes(client: SupabaseClient<Database>): Promise<PinnedItem[]> {
  const { data, error } = await client
    .from("pinned_recipes_visible")
    .select("id, recipe_id, bar_recipe_id, sort_order, pinned_at")
    .order("sort_order", { ascending: true });

  if (error) {
    throw error;
  }

  return (data ?? [])
    .filter(
      (row): row is typeof row & { id: string; sort_order: number; pinned_at: string } =>
        row.id !== null && row.sort_order !== null && row.pinned_at !== null,
    )
    .map((row) => ({
      id: row.id,
      recipeId: row.recipe_id,
      barRecipeId: row.bar_recipe_id,
      sortOrder: row.sort_order,
      pinnedAt: row.pinned_at,
    }));
}

export async function pinRecipe(
  client: SupabaseClient<Database>,
  target: { recipeId: string } | { barRecipeId: string },
): Promise<void> {
  const userId = await currentUserId(client);

  const { error } = await client.from("pinned_recipes").insert({
    user_id: userId,
    recipe_id: "recipeId" in target ? target.recipeId : null,
    bar_recipe_id: "barRecipeId" in target ? target.barRecipeId : null,
  });

  if (error) {
    throw error;
  }
}

export async function unpinRecipe(client: SupabaseClient<Database>, pinId: string): Promise<void> {
  const { error } = await client.from("pinned_recipes").delete().eq("id", pinId);

  if (error) {
    throw error;
  }
}

export async function reorderPins(
  client: SupabaseClient<Database>,
  orderedPinIds: string[],
): Promise<void> {
  for (const [index, pinId] of orderedPinIds.entries()) {
    const { error } = await client
      .from("pinned_recipes")
      .update({ sort_order: index })
      .eq("id", pinId);

    if (error) {
      throw error;
    }
  }
}

export type SearchResultKind = "recipe" | "bar_recipe";

// Tier 1 = current bar's menu, 2 = other house recipes, 3 = pinned,
// 4 = recently viewed, 5 = exact catalog name match, 6 = fuzzy/trigram
// catalog match, 7 = alias/ingredient-overlap match. See spec
// 0023-bartender-mode/0023-search-and-shorthand.md AC-1.
export type SearchResultTier = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export interface BartenderSearchResult {
  kind: SearchResultKind;
  id: string;
  name: string;
  tier: SearchResultTier;
  score: number;
}

export async function searchBartender(
  client: SupabaseClient<Database>,
  query: string,
  barId: string | null,
  recentRecipeIds: string[],
): Promise<BartenderSearchResult[]> {
  const { data, error } = await client.rpc("search_bartender", {
    query,
    bar_id: barId ?? undefined,
    recent_recipe_ids: recentRecipeIds,
  });

  if (error) {
    throw error;
  }

  return (data ?? []).map((row) => ({
    kind: row.kind as SearchResultKind,
    id: row.id,
    name: row.name,
    tier: row.tier as SearchResultTier,
    score: row.score,
  }));
}
