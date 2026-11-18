import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";
import { parseMeasure, type RecognizedUnit } from "./units";
import { canonicalGlass, canonicalIngredientName } from "./catalogNames";
import {
  DRINK_STYLES,
  isDrinkStyle,
  noteLength,
  RECIPE_NOTE_MAX_LENGTH,
  type DrinkStyle,
} from "./drinkStyle";
import { NON_DEFAULT_LOCALES, type NonDefaultLocale } from "./locale";
import { isRecipeMethod, toRecipeMethod, type RecipeMethod } from "./recipes";

export const ADMIN_RECIPE_NAME_MAX_LENGTH = 200;
export const ADMIN_RECIPE_INSTRUCTIONS_MAX_LENGTH = 10000;
export const ADMIN_RECIPES_PAGE_SIZE = 20;

export const ADMIN_ALCOHOLIC_STATUSES = [
  "alcoholic",
  "non_alcoholic",
  "optional",
  "unknown",
] as const;

export type AdminAlcoholicStatus = (typeof ADMIN_ALCOHOLIC_STATUSES)[number];

export interface AdminRecipeSummary {
  id: string;
  name: string;
  glass: string | null;
  alcoholicStatus: string;
  source: string;
  createdAt: string;
  /** When an admin took this catalog recipe over; null while the import owns it (spec 0056). */
  adminLockedAt: string | null;
  /** Locked and TheCocktailDB (or customRecipes.json) changed it since (spec 0056 AC-5). */
  changedUpstream: boolean;
  /** Soft deleted; only listed by the "deleted" status filter (spec 0056 AC-7). */
  deletedAt: string | null;
  /** 0 to 100; null means unscored, so the next import's fame tail scores it (spec 0056 AC-7, AC-9). */
  fameScore: number | null;
}

/** Which recipes the admin list shows: live ones (the default) or soft deleted ones. */
export type AdminRecipeStatus = "live" | "deleted";

/**
 * Spec 0056 AC-7: a locked recipe whose latest source version differs from
 * the acknowledged one. A null source_hash means no hashed import has set a
 * baseline yet, so nothing can be flagged.
 */
export function isChangedUpstream(row: {
  admin_locked_at: string | null;
  source_hash: string | null;
  latest_source_hash: string | null;
}): boolean {
  return (
    row.admin_locked_at !== null &&
    row.source_hash !== null &&
    row.latest_source_hash !== row.source_hash
  );
}

/**
 * Spec 0056 AC-7: the edit page loads a deleted recipe only when it is a
 * locked catalog recipe, so the admin can Reset it. Live recipes always load.
 */
export function canOpenAdminRecipe(row: {
  deleted_at: string | null;
  admin_locked_at: string | null;
  source: string;
}): boolean {
  return row.deleted_at === null || (row.admin_locked_at !== null && row.source === "catalog");
}

export interface FetchAdminRecipesParams {
  query?: string;
  /** Defaults to "live"; "deleted" lists soft deleted recipes instead. */
  status?: AdminRecipeStatus;
  pageLimit?: number;
  beforeCreatedAt?: string;
  beforeId?: string;
}

export interface FetchAdminRecipesResult {
  recipes: AdminRecipeSummary[];
  hasMore: boolean;
}

/**
 * Admin scoped recipe list: every live recipe (catalog or admin sourced), or
 * with status "deleted" every soft deleted one (spec 0056 AC-7), newest first, same keyset pagination shape as fetchAllComments
 * (spec 0028). A caller without is_admin gets an empty, not an error,
 * result: RLS's SELECT policy already allows any viewer to read recipes,
 * so this list's protection is entirely the admin page's own session gate.
 */
export async function fetchAdminRecipes(
  client: SupabaseClient<Database>,
  {
    query = "",
    status = "live",
    pageLimit = ADMIN_RECIPES_PAGE_SIZE,
    beforeCreatedAt,
    beforeId,
  }: FetchAdminRecipesParams = {},
): Promise<FetchAdminRecipesResult> {
  let dbQuery = client
    .from("recipes")
    .select(
      "id, name, glass, alcoholic_status, source, created_at, admin_locked_at, source_hash, latest_source_hash, deleted_at, fame_score",
    )
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(pageLimit + 1);

  dbQuery =
    status === "deleted" ? dbQuery.not("deleted_at", "is", null) : dbQuery.is("deleted_at", null);

  const trimmedQuery = query.trim();

  if (trimmedQuery) {
    dbQuery = dbQuery.ilike("name", `%${trimmedQuery}%`);
  }

  if (beforeCreatedAt && beforeId) {
    dbQuery = dbQuery.or(
      `created_at.lt.${beforeCreatedAt},and(created_at.eq.${beforeCreatedAt},id.lt.${beforeId})`,
    );
  }

  const { data, error } = await dbQuery;

  if (error) {
    throw error;
  }

  const rows = data ?? [];
  const hasMore = rows.length > pageLimit;
  const page = hasMore ? rows.slice(0, pageLimit) : rows;

  return {
    recipes: page.map((row) => ({
      id: row.id,
      name: row.name,
      glass: row.glass,
      alcoholicStatus: row.alcoholic_status,
      source: row.source,
      createdAt: row.created_at,
      adminLockedAt: row.admin_locked_at,
      changedUpstream: isChangedUpstream(row),
      deletedAt: row.deleted_at,
      fameScore: row.fame_score,
    })),
    hasMore,
  };
}

export interface AdminRecipeIngredient {
  name: string;
  measure: string | null;
}

export interface AdminRecipeTag {
  name: string;
}

export interface AdminRecipeDetail {
  id: string;
  name: string;
  instructions: string;
  imageUrl: string | null;
  glass: string | null;
  alcoholicStatus: string;
  region: string | null;
  source: string;
  /** When an admin took this catalog recipe over; null while the import owns it (spec 0056). */
  adminLockedAt: string | null;
  /** Locked and changed at the source since it was locked or last saved (spec 0056 AC-5). */
  changedUpstream: boolean;
  /** Set only for a locked, deleted catalog recipe, which opens with Reset and no Save (AC-7). */
  deletedAt: string | null;
  /** Build method, whoever set it (classifier or admin); null when none (spec 0054 AC-11). */
  method: RecipeMethod | null;
  /** 0 to 100; null means the next import scores it (spec 0056 AC-10). */
  fameScore: number | null;
  ingredients: AdminRecipeIngredient[];
  /** Catalog tags only; taste tags are in flavorProfile. */
  tags: AdminRecipeTag[];
  /** Taste tags (tags.kind = 'taste'), sorted by name. */
  flavorProfile: AdminRecipeTag[];
  /** English notes (spec 0043). */
  drinkStyle: DrinkStyle | null;
  drinkStyleNote: string | null;
  bartenderTip: string | null;
  presentationTip: string | null;
  /** Per locale notes; null when the recipe has no translation row (spec 0045). */
  translationNotes: AdminTranslationNotesByLocale;
  /** Ingredients with no allergen review yet, for the form's hint (spec 0043). */
  unreviewedAllergenCount: number;
}

export interface AdminTranslationNotes {
  drink_style_note: string | null;
  bartender_tip: string | null;
  presentation_tip: string | null;
}

export type AdminTranslationNotesByLocale = Record<NonDefaultLocale, AdminTranslationNotes | null>;

/** One entry per supported non English locale, null where no row exists. */
export function toTranslationNotesByLocale(
  rows: readonly (AdminTranslationNotes & { locale: string })[],
): AdminTranslationNotesByLocale {
  return Object.fromEntries(
    NON_DEFAULT_LOCALES.map((locale) => {
      const row = rows.find((candidate) => candidate.locale === locale);
      return [
        locale,
        row
          ? {
              drink_style_note: row.drink_style_note,
              bartender_tip: row.bartender_tip,
              presentation_tip: row.presentation_tip,
            }
          : null,
      ];
    }),
  ) as AdminTranslationNotesByLocale;
}

/**
 * A direct, non locale aware read of a recipe's own canonical fields plus
 * its ingredients and tags, for pre filling the admin edit form. Deliberately
 * not fetch_recipe_detail (spec 0020's RPC): that function resolves locale
 * translations and omits tags, neither of which the admin form edits.
 */
export async function fetchAdminRecipeDetail(
  client: SupabaseClient<Database>,
  id: string,
): Promise<AdminRecipeDetail | null> {
  const { data, error } = await client
    .from("recipes")
    .select(
      `id, name, instructions, image_url, glass, alcoholic_status, region, source, method, fame_score, admin_locked_at,
       source_hash, latest_source_hash, deleted_at,
       drink_style, drink_style_note, bartender_tip, presentation_tip,
       recipe_ingredients ( measure, sort_order, ingredients ( name, allergens ) ),
       recipe_tags ( tags ( name, kind ) ),
       recipe_translations ( locale, drink_style_note, bartender_tip, presentation_tip )`,
    )
    .eq("id", id)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data || !canOpenAdminRecipe(data)) {
    return null;
  }

  const ingredients = [...data.recipe_ingredients]
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((ri) => ({ name: ri.ingredients.name, measure: ri.measure }));

  const tags = data.recipe_tags
    .filter((rt) => rt.tags.kind === "catalog")
    .map((rt) => ({ name: rt.tags.name }));

  const flavorProfile = data.recipe_tags
    .filter((rt) => rt.tags.kind === "taste")
    .map((rt) => ({ name: rt.tags.name }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return {
    id: data.id,
    name: data.name,
    instructions: data.instructions,
    imageUrl: data.image_url,
    glass: data.glass,
    alcoholicStatus: data.alcoholic_status,
    region: data.region,
    source: data.source,
    adminLockedAt: data.admin_locked_at,
    changedUpstream: isChangedUpstream(data),
    deletedAt: data.deleted_at,
    method: toRecipeMethod(data.method),
    fameScore: data.fame_score,
    ingredients,
    tags,
    flavorProfile,
    drinkStyle: isDrinkStyle(data.drink_style) ? data.drink_style : null,
    drinkStyleNote: data.drink_style_note,
    bartenderTip: data.bartender_tip,
    presentationTip: data.presentation_tip,
    translationNotes: toTranslationNotesByLocale(data.recipe_translations),
    unreviewedAllergenCount: data.recipe_ingredients.filter(
      (ri) => ri.ingredients.allergens === null,
    ).length,
  };
}

export type AdminRecipeFormIngredient = { name: string; measure: string | null };
export type AdminRecipeFormTag = { name: string };

export interface AdminRecipeFormValues {
  recipeId: string | null;
  name: string;
  instructions: string;
  glass: string | null;
  alcoholicStatus: AdminAlcoholicStatus;
  region: string | null;
  ingredients: AdminRecipeFormIngredient[];
  tags: AdminRecipeFormTag[];
  /**
   * Null leaves the recipe's flavor profile as it is (a new recipe then gets
   * classify-recipes' tags). An array replaces it and locks it against
   * reclassification, so send one only when the admin touched the picker.
   */
  flavorProfile: AdminRecipeFormTag[] | null;
  /**
   * Always sent with p_set_method = true (spec 0054 AC-11): a method stores it
   * as an admin pick the classifier never overwrites; null clears it, leaving
   * the recipe free for the classifier's next run.
   */
  method: RecipeMethod | null;
  /**
   * The fame score field's raw text (spec 0056 AC-10). Always sent with
   * p_set_fame_score = true: a whole number 0 to 100 is saved, blank saves
   * null (the next import scores it), anything else is a form error.
   */
  fameScore: string;
  /** Spec 0043: null means none. */
  drinkStyle: DrinkStyle | null;
  /** Empty means none. */
  drinkStyleNote: string;
  bartenderTip: string;
  presentationTip: string;
}

export type AdminRecipeValidationError =
  | { field: "name"; reason: "required" | "too_long" }
  | { field: "instructions"; reason: "required" | "too_long" }
  | { field: "alcoholicStatus"; reason: "invalid" }
  | { field: "method"; reason: "invalid" }
  | { field: "fameScore"; reason: "invalid" }
  | { field: "ingredients"; reason: "required" }
  | { field: "drinkStyle"; reason: "invalid" }
  | { field: "drinkStyleNote"; reason: "too_long" | "needs_style" }
  | { field: "bartenderTip"; reason: "too_long" }
  | { field: "presentationTip"; reason: "too_long" };

const isNoteTooLong = (text: string) => noteLength(text.trim()) > RECIPE_NOTE_MAX_LENGTH;

export const FAME_SCORE_MIN = 0;
export const FAME_SCORE_MAX = 100;

export type ParseFameScoreResult =
  { data: number | null; error: null } | { data: null; error: "invalid" };

/**
 * The admin fame score field (spec 0056 AC-10): blank is null (the next
 * import scores it), a whole number from 0 to 100 is that number, anything
 * else (a fraction, a sign, a letter, out of range) is invalid. Pure.
 */
export function parseFameScore(text: string): ParseFameScoreResult {
  const trimmed = text.trim();
  if (trimmed === "") {
    return { data: null, error: null };
  }
  if (!/^\d{1,3}$/.test(trimmed)) {
    return { data: null, error: "invalid" };
  }
  const value = Number(trimmed);
  return value >= FAME_SCORE_MIN && value <= FAME_SCORE_MAX
    ? { data: value, error: null }
    : { data: null, error: "invalid" };
}

/**
 * Mirrors admin_upsert_recipe's and admin_set_recipe_notes' own checks
 * (spec 0030 AC-8, spec 0043 AC-10) so an invalid submission is caught
 * before the round trip, not only inside the functions.
 */
export function validateAdminRecipeForm(
  values: AdminRecipeFormValues,
): AdminRecipeValidationError[] {
  const errors: AdminRecipeValidationError[] = [];
  const trimmedName = values.name.trim();
  const trimmedInstructions = values.instructions.trim();

  if (trimmedName.length === 0) {
    errors.push({ field: "name", reason: "required" });
  } else if (trimmedName.length > ADMIN_RECIPE_NAME_MAX_LENGTH) {
    errors.push({ field: "name", reason: "too_long" });
  }

  if (trimmedInstructions.length === 0) {
    errors.push({ field: "instructions", reason: "required" });
  } else if (trimmedInstructions.length > ADMIN_RECIPE_INSTRUCTIONS_MAX_LENGTH) {
    errors.push({ field: "instructions", reason: "too_long" });
  }

  if (!ADMIN_ALCOHOLIC_STATUSES.includes(values.alcoholicStatus)) {
    errors.push({ field: "alcoholicStatus", reason: "invalid" });
  }

  if (values.method !== null && !isRecipeMethod(values.method)) {
    errors.push({ field: "method", reason: "invalid" });
  }

  if (parseFameScore(values.fameScore).error !== null) {
    errors.push({ field: "fameScore", reason: "invalid" });
  }

  const nonEmptyIngredients = values.ingredients.filter((i) => i.name.trim().length > 0);

  if (nonEmptyIngredients.length === 0) {
    errors.push({ field: "ingredients", reason: "required" });
  }

  if (values.drinkStyle !== null && !DRINK_STYLES.includes(values.drinkStyle)) {
    errors.push({ field: "drinkStyle", reason: "invalid" });
  }

  if (isNoteTooLong(values.drinkStyleNote)) {
    errors.push({ field: "drinkStyleNote", reason: "too_long" });
  } else if (values.drinkStyleNote.trim() && values.drinkStyle === null) {
    errors.push({ field: "drinkStyleNote", reason: "needs_style" });
  }

  if (isNoteTooLong(values.bartenderTip)) {
    errors.push({ field: "bartenderTip", reason: "too_long" });
  }

  if (isNoteTooLong(values.presentationTip)) {
    errors.push({ field: "presentationTip", reason: "too_long" });
  }

  return errors;
}

export type SaveAdminRecipeError =
  | { reason: "validation"; errors: AdminRecipeValidationError[] }
  | { reason: "request_failed"; message: string }
  /** The recipe saved under `id` but its notes did not; retry with that id (spec 0043). */
  | { reason: "notes_failed"; id: string; message: string };

export type SaveAdminRecipeResult =
  { data: { id: string }; error: null } | { data: null; error: SaveAdminRecipeError };

// A type alias, not an interface, so it stays assignable to the RPC's Json arg.
export type AdminIngredientPayload = {
  name: string;
  measure: string | null;
  sortOrder: number;
  amount_value: number | null;
  /** The high end of a range (spec 0054 AC-3); null for a single amount. */
  amount_max_value: number | null;
  amount_unit: RecognizedUnit | null;
};

/**
 * Builds the admin_upsert_recipe ingredient payload, parsing each trimmed
 * measure with the shared parser so an admin save keeps the recipe's unit
 * toggle and batch panel working (spec 0035 AC-8). An unparsed line sends
 * both amount fields as null. Names get the catalog casing rule, so an admin
 * save never flips a shared ingredient's name back (spec 0036 AC-7).
 */
export function toAdminIngredientPayload(
  ingredients: readonly AdminRecipeFormIngredient[],
): AdminIngredientPayload[] {
  return ingredients.map((ingredient, index) => {
    const measure = ingredient.measure?.trim() || null;
    const parsed = parseMeasure(measure);
    return {
      name: canonicalIngredientName(ingredient.name),
      measure,
      sortOrder: index,
      amount_value: parsed?.value ?? null,
      amount_max_value: parsed?.maxValue ?? null,
      amount_unit: parsed?.unit ?? null,
    };
  });
}

/**
 * Splits pasted text into tag or flavor names for the admin form's paste to
 * fill: one name per line or comma separated item, trimmed, with a leading
 * list bullet dropped, blanks skipped, and case insensitive repeats removed.
 */
export function splitNameList(text: string): string[] {
  const names = text
    .split(/[\r\n,]+/)
    .map((item) => item.trim().replace(/^[-*•·–]\s*/, ""))
    .filter((item) => item.length > 0);

  return names.filter(
    (name, index) =>
      names.findIndex((other) => other.toLowerCase() === name.toLowerCase()) === index,
  );
}

/**
 * Thin wrapper over the admin_upsert_recipe RPC (spec 0030): resolves or
 * creates each ingredient/tag/flavor by normalized name and replaces the recipe's
 * join rows in one transaction, so a save either fully succeeds or fully
 * fails (AC-8). Then admin_set_recipe_notes saves the English style and tips
 * (spec 0043 AC-10); if only that call fails, the result is `notes_failed`
 * with the saved id, so a retry updates that recipe instead of creating one.
 */
export async function saveAdminRecipe(
  client: SupabaseClient<Database>,
  values: AdminRecipeFormValues,
): Promise<SaveAdminRecipeResult> {
  const errors = validateAdminRecipeForm(values);

  if (errors.length > 0) {
    return { data: null, error: { reason: "validation", errors } };
  }

  const nonEmptyIngredients = values.ingredients.filter((i) => i.name.trim().length > 0);
  const nonEmptyTags = values.tags.filter((t) => t.name.trim().length > 0);
  const flavorNames = values.flavorProfile
    ? [...new Set(values.flavorProfile.map((f) => f.name.trim()).filter((n) => n.length > 0))]
    : null;

  // The generated RPC Args type marks these text params non-nullable (a
  // Supabase type generator limitation for plpgsql functions), but the
  // underlying Postgres function accepts null for all of them.
  const { data, error } = await client.rpc("admin_upsert_recipe", {
    p_recipe_id: values.recipeId,
    p_name: values.name.trim(),
    p_instructions: values.instructions.trim(),
    p_glass: canonicalGlass(values.glass),
    p_alcoholic_status: values.alcoholicStatus,
    p_region: values.region?.trim() || null,
    p_ingredients: toAdminIngredientPayload(nonEmptyIngredients),
    p_tags: nonEmptyTags.map((tag) => ({ name: tag.name.trim() })),
    p_flavor_profile: flavorNames,
    p_set_method: true,
    p_method: values.method,
    // Validated above, so data is the score or null.
    p_set_fame_score: true,
    p_fame_score: parseFameScore(values.fameScore).data,
  } as Database["public"]["Functions"]["admin_upsert_recipe"]["Args"]);

  if (error) {
    return { data: null, error: { reason: "request_failed", message: error.message } };
  }

  const id = data as unknown as string;

  // Same generator limitation: these text params accept null (none).
  const notes = await client.rpc("admin_set_recipe_notes", {
    p_recipe_id: id,
    p_drink_style: values.drinkStyle,
    p_drink_style_note: values.drinkStyleNote.trim() || null,
    p_bartender_tip: values.bartenderTip.trim() || null,
    p_presentation_tip: values.presentationTip.trim() || null,
  } as Database["public"]["Functions"]["admin_set_recipe_notes"]["Args"]);

  if (notes.error) {
    return { data: null, error: { reason: "notes_failed", id, message: notes.error.message } };
  }

  return { data: { id }, error: null };
}

export type SetRecipeTranslationNotesResult =
  | { data: true; error: null }
  | {
      data: null;
      error:
        | { reason: "too_long" }
        | { reason: "no_translation_row" }
        | { reason: "request_failed"; message: string };
    };

/**
 * Saves one locale's notes (spec 0045 AC-11). Blank stores null, so the page
 * falls back to English. A recipe with no row for that locale is an explicit
 * error, not a silent no op.
 */
export async function setRecipeTranslationNotes(
  client: SupabaseClient<Database>,
  recipeId: string,
  locale: NonDefaultLocale,
  notes: AdminTranslationNotes,
): Promise<SetRecipeTranslationNotesResult> {
  const texts = [notes.drink_style_note, notes.bartender_tip, notes.presentation_tip];

  if (texts.some((text) => isNoteTooLong(text ?? ""))) {
    return { data: null, error: { reason: "too_long" } };
  }

  // Same generator limitation as admin_set_recipe_notes: these accept null.
  const { error } = await client.rpc("admin_set_recipe_translation_notes", {
    p_recipe_id: recipeId,
    p_locale: locale,
    p_drink_style_note: notes.drink_style_note?.trim() || null,
    p_bartender_tip: notes.bartender_tip?.trim() || null,
    p_presentation_tip: notes.presentation_tip?.trim() || null,
  } as Database["public"]["Functions"]["admin_set_recipe_translation_notes"]["Args"]);

  if (error) {
    return error.code === "P0002"
      ? { data: null, error: { reason: "no_translation_row" } }
      : { data: null, error: { reason: "request_failed", message: error.message } };
  }

  return { data: true, error: null };
}

export type DeleteAdminRecipeResult =
  | { data: true; error: null }
  | {
      data: null;
      error: { reason: "merge_target" } | { reason: "request_failed"; message: string };
    };

/** admin_delete_recipe's refusal for a recipe a merged duplicate points to (spec 0056 AC-3). */
const MERGE_TARGET_MESSAGE = "this recipe is a merge target in catalogOverrides.json";

/**
 * Soft deletes a recipe; a catalog recipe is also locked so no import brings
 * it back (spec 0056 AC-3). A merge target is refused as `merge_target`.
 */
export async function deleteAdminRecipe(
  client: SupabaseClient<Database>,
  recipeId: string,
): Promise<DeleteAdminRecipeResult> {
  const { error } = await client.rpc("admin_delete_recipe", { p_recipe_id: recipeId });

  if (error) {
    return error.message.includes(MERGE_TARGET_MESSAGE)
      ? { data: null, error: { reason: "merge_target" } }
      : { data: null, error: { reason: "request_failed", message: error.message } };
  }

  return { data: true, error: null };
}

export type ResetAdminRecipeResult =
  | { data: true; error: null }
  | { data: null; error: { reason: "request_failed"; message: string } };

/**
 * Hands a locked catalog recipe back to the import (spec 0056 AC-6): clears
 * its lock, so the next import rewrites its import owned content from source
 * and brings it back if it was deleted and is still in source.
 */
export async function resetAdminRecipeToSource(
  client: SupabaseClient<Database>,
  recipeId: string,
): Promise<ResetAdminRecipeResult> {
  const { error } = await client.rpc("admin_reset_recipe_to_source", { p_recipe_id: recipeId });

  return error
    ? { data: null, error: { reason: "request_failed", message: error.message } }
    : { data: true, error: null };
}

/**
 * Distinct, sorted glass names already used by non deleted recipes, for the
 * admin form's glass autocomplete. recipes.glass is free text (no lookup
 * table), so reusing an existing spelling is the only guard against near
 * duplicates like "Highball" vs "Highball glass".
 */
export async function fetchAdminGlassNames(client: SupabaseClient<Database>): Promise<string[]> {
  const { data, error } = await client
    .from("recipes")
    .select("glass")
    .is("deleted_at", null)
    .not("glass", "is", null);

  if (error) {
    throw error;
  }

  const names = (data ?? [])
    .map((row) => row.glass?.trim() ?? "")
    .filter((glass) => glass.length > 0);

  return [...new Set(names)].sort((a, b) => a.localeCompare(b));
}

/**
 * Every existing catalog tag name, sorted, for the admin form's tag
 * autocomplete. admin_upsert_recipe resolves tags by normalized name, so
 * reusing an existing spelling links the existing tag instead of creating a
 * near duplicate. Taste tags are left out: the Flavor profile picker owns them.
 */
export async function fetchAdminTagNames(client: SupabaseClient<Database>): Promise<string[]> {
  const { data, error } = await client
    .from("tags")
    .select("name")
    .eq("kind", "catalog")
    .order("name");

  if (error) {
    throw error;
  }

  return (data ?? []).map((row) => row.name);
}

/**
 * Every existing flavor profile name (taste tags), sorted, for the admin
 * form's flavor autocomplete. A name that isn't listed is created as a new
 * taste tag on save.
 */
export async function fetchAdminFlavorNames(client: SupabaseClient<Database>): Promise<string[]> {
  const { data, error } = await client
    .from("tags")
    .select("name")
    .eq("kind", "taste")
    .order("name");

  if (error) {
    throw error;
  }

  return (data ?? []).map((row) => row.name);
}
