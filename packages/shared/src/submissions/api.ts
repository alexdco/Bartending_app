import { FunctionsHttpError, type SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "../database.types";
import {
  parseFameScore,
  toAdminIngredientPayload,
  validateAdminRecipeForm,
  type AdminRecipeFormValues,
  type AdminRecipeValidationError,
} from "../adminRecipes";
import { canonicalGlass } from "../catalogNames";
import type { Locale } from "../locale";
import { searchRecipes, type RecipeSearchResult } from "../recipes";
import { DUPLICATE_SEARCH_LIMIT, findDuplicateRecipes } from "./duplicates";
import { raisedCode, toSaveSubmissionError, type SaveSubmissionError } from "./errors";
import {
  mapRecipeImageUploadError,
  RECIPE_IMAGE_CONTENT_TYPE,
  type RecipeImagePair,
  type UploadRecipeImageError,
} from "../recipeImages";
import {
  RECIPE_SUBMISSION_PHOTOS_BUCKET,
  SUBMISSION_PHOTO_SIGNED_URL_SECONDS,
  submissionPhotoFile,
  submissionPhotoFiles,
  submissionPhotoPath,
  type SubmissionPhotoSize,
} from "./photos";
import {
  toSubmissionIngredients,
  trimSubmissionText,
  validateRejectionReason,
  validateSubmissionForm,
  type RejectionReasonError,
  type SubmissionFormValues,
  type SubmissionIngredientPayload,
  type SubmissionValidationError,
} from "./validation";

type Rpc = Database["public"]["Functions"];

export type SubmissionStatus = "pending" | "approved" | "rejected";
export type ScreeningResult = "pending" | "clear" | "flagged" | "error" | "skipped";

const STATUSES: readonly SubmissionStatus[] = ["pending", "approved", "rejected"];
const SCREENINGS: readonly ScreeningResult[] = ["pending", "clear", "flagged", "error", "skipped"];

const toStatus = (value: string): SubmissionStatus =>
  STATUSES.includes(value as SubmissionStatus) ? (value as SubmissionStatus) : "pending";

const toScreening = (value: string | null): ScreeningResult | null =>
  value !== null && SCREENINGS.includes(value as ScreeningResult)
    ? (value as ScreeningResult)
    : null;

function toIngredients(value: Json): SubmissionIngredientPayload[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (typeof item !== "object" || item === null || Array.isArray(item)) return [];
    const name = item.name;
    const measure = item.measure;
    return typeof name === "string"
      ? [{ name, measure: typeof measure === "string" ? measure : null }]
      : [];
  });
}

/** Keyset cursor for both lists: the sort timestamp plus the id tie breaker. */
export interface SubmissionCursor {
  at: string;
  id: string;
}

export interface SubmissionPage<T> {
  items: T[];
  /** Null on the last page. */
  nextCursor: SubmissionCursor | null;
}

// ---------------------------------------------------------------------------
// Author: save (AC-1 to AC-5)

export interface SaveRecipeSubmissionInput {
  /** Client generated for a new submission (so a photo path can use it), or the existing id. */
  id: string;
  values: SubmissionFormValues;
  /** The current UI locale; used only when the row is created (AC-1, AC-6). */
  locale: string;
  photoPath?: string | null;
  /**
   * The photo path the row held before this save. When it differs from
   * `photoPath` (replaced or removed), its files are removed after the save
   * succeeds; a failed removal is left for the daily cleanup (AC-19).
   */
  replacedPhotoPath?: string | null;
  /** True when the form showed the display name field (AC-3). */
  requireDisplayName: boolean;
}

export interface SavedRecipeSubmission {
  id: string;
  status: SubmissionStatus;
  updatedAt: string;
}

export type SaveRecipeSubmissionResult =
  | { data: SavedRecipeSubmission; error: null }
  | {
      data: null;
      error: { reason: "validation"; errors: SubmissionValidationError[] } | SaveSubmissionError;
    };

export async function saveRecipeSubmission(
  client: SupabaseClient<Database>,
  {
    id,
    values,
    locale,
    photoPath = null,
    replacedPhotoPath = null,
    requireDisplayName,
  }: SaveRecipeSubmissionInput,
): Promise<SaveRecipeSubmissionResult> {
  const errors = validateSubmissionForm(values, { requireDisplayName });
  if (errors.length > 0) {
    return { data: null, error: { reason: "validation", errors } };
  }

  // The generated Args mark optional text params non null; the function
  // takes null for each of them.
  const { data, error } = await client
    .rpc("save_recipe_submission", {
      p_id: id,
      p_name: trimSubmissionText(values.name),
      p_ingredients: toSubmissionIngredients(values.ingredients),
      p_instructions: trimSubmissionText(values.instructions),
      p_glass: trimSubmissionText(values.glass) || null,
      p_alcoholic_status: values.alcoholicStatus,
      p_note: trimSubmissionText(values.note) || null,
      p_photo_path: photoPath,
      p_locale: locale,
      p_display_name: requireDisplayName ? values.displayName.trim() : null,
    } as Rpc["save_recipe_submission"]["Args"])
    .single();

  if (error) {
    return { data: null, error: toSaveSubmissionError(error) };
  }

  if (replacedPhotoPath && replacedPhotoPath !== photoPath) {
    await removeSubmissionPhoto(client, replacedPhotoPath);
  }

  return {
    data: { id: data.id, status: toStatus(data.status), updatedAt: data.updated_at },
    error: null,
  };
}

// ---------------------------------------------------------------------------
// Photos (AC-8): the private bucket, readable only by the author and the admin

const isAlreadyExists = (error: { message: string; statusCode?: string | number }) =>
  String(error.statusCode) === "409" || /already exists|duplicate/i.test(error.message);

export type UploadSubmissionPhotoResult =
  { data: { photoPath: string }; error: null } | { data: null; error: UploadRecipeImageError };

/**
 * Uploads the spec 0041 hero and card pair to
 * `<authorId>/<submissionId>-<hash>-(hero|card).webp` before the save, so the
 * save can name the path. Files are never overwritten; a pair already stored
 * under the same hash counts as uploaded, so a retried save is safe.
 */
export async function uploadSubmissionPhoto(
  client: SupabaseClient<Database>,
  authorId: string,
  submissionId: string,
  images: RecipeImagePair,
): Promise<UploadSubmissionPhotoResult> {
  const photoPath = submissionPhotoPath(authorId, submissionId, images.hash);
  const bucket = client.storage.from(RECIPE_SUBMISSION_PHOTOS_BUCKET);
  const files = [
    { path: submissionPhotoFile(photoPath, "hero"), bytes: images.hero },
    { path: submissionPhotoFile(photoPath, "card"), bytes: images.card },
  ];

  for (const file of files) {
    const { error } = await bucket.upload(file.path, file.bytes, {
      contentType: RECIPE_IMAGE_CONTENT_TYPE,
      upsert: false,
    });
    if (error && !isAlreadyExists(error)) {
      return { data: null, error: mapRecipeImageUploadError(error) };
    }
  }

  return { data: { photoPath }, error: null };
}

/** Removes both files of a photo path. Best effort: the daily cleanup is the backstop. */
export async function removeSubmissionPhoto(
  client: SupabaseClient<Database>,
  photoPath: string,
): Promise<void> {
  await client.storage
    .from(RECIPE_SUBMISSION_PHOTOS_BUCKET)
    .remove(submissionPhotoFiles(photoPath))
    .catch(() => undefined);
}

/**
 * Signed URLs (valid one hour) for the given photo paths at one size, keyed
 * by photo path. A path the caller may not read, or a missing file, is left
 * out, so the UI shows its no photo state.
 */
export async function signSubmissionPhotoUrls(
  client: SupabaseClient<Database>,
  photoPaths: readonly string[],
  size: SubmissionPhotoSize,
): Promise<Readonly<Record<string, string>>> {
  const unique = [...new Set(photoPaths)];
  if (unique.length === 0) return {};

  const files = unique.map((path) => submissionPhotoFile(path, size));
  const { data, error } = await client.storage
    .from(RECIPE_SUBMISSION_PHOTOS_BUCKET)
    .createSignedUrls(files, SUBMISSION_PHOTO_SIGNED_URL_SECONDS);

  if (error || !data) return {};

  return Object.fromEntries(
    data.flatMap((entry, index) =>
      entry.error || !entry.signedUrl ? [] : [[unique[index]!, entry.signedUrl] as const],
    ),
  );
}

// ---------------------------------------------------------------------------
// Author: reads (AC-1, AC-6)

export interface MyRecipeSubmissionSummary {
  id: string;
  status: SubmissionStatus;
  name: string;
  photoPath: string | null;
  rejectionReason: string | null;
  /** Set once approved; links to the live recipe unless `recipeRemoved`. */
  approvedRecipeId: string | null;
  /** The live recipe's localized name, English base name, and image (approved only). */
  recipeName: string | null;
  recipeBaseName: string | null;
  recipeImageUrl: string | null;
  /** Approved, but the recipe was deleted afterwards ("Removed from the catalog"). */
  recipeRemoved: boolean;
  submittedAt: string;
  reviewedAt: string | null;
}

export const MY_SUBMISSIONS_PAGE_SIZE = 20;

export async function fetchMyRecipeSubmissions(
  client: SupabaseClient<Database>,
  {
    cursor = null,
    limit = MY_SUBMISSIONS_PAGE_SIZE,
    locale,
  }: { cursor?: SubmissionCursor | null; limit?: number; locale: string },
): Promise<SubmissionPage<MyRecipeSubmissionSummary>> {
  const { data, error } = await client.rpc("fetch_my_recipe_submissions", {
    p_cursor_submitted_at: cursor?.at ?? null,
    p_cursor_id: cursor?.id ?? null,
    p_limit: limit,
    p_locale: locale,
  } as Rpc["fetch_my_recipe_submissions"]["Args"]);

  if (error) throw error;

  const items = (data ?? []).map((row) => ({
    id: row.id,
    status: toStatus(row.status),
    name: row.name,
    photoPath: row.photo_path ?? null,
    rejectionReason: row.rejection_reason ?? null,
    approvedRecipeId: row.approved_recipe_id ?? null,
    recipeName: row.recipe_name ?? null,
    recipeBaseName: row.recipe_base_name ?? null,
    recipeImageUrl: row.recipe_image_url ?? null,
    recipeRemoved: row.recipe_removed === true,
    submittedAt: row.submitted_at,
    reviewedAt: row.reviewed_at ?? null,
  }));

  const last = items[items.length - 1];
  return {
    items,
    nextCursor: items.length === limit && last ? { at: last.submittedAt, id: last.id } : null,
  };
}

/** What the submit form needs before the first save (AC-3, AC-18). */
export interface SubmissionFormContext {
  needsDisplayName: boolean;
  blocked: boolean;
}

export interface MyRecipeSubmission extends SubmissionFormContext {
  id: string;
  status: SubmissionStatus;
  locale: string;
  name: string;
  instructions: string;
  ingredients: SubmissionIngredientPayload[];
  glass: string | null;
  alcoholicStatus: string;
  note: string | null;
  photoPath: string | null;
  rejectionReason: string | null;
  approvedRecipeId: string | null;
  updatedAt: string;
}

export async function fetchSubmissionFormContext(
  client: SupabaseClient<Database>,
): Promise<SubmissionFormContext> {
  const { data, error } = await client
    .rpc("fetch_my_recipe_submission", {
      p_id: null,
    } as unknown as Rpc["fetch_my_recipe_submission"]["Args"])
    .single();
  if (error) throw error;
  return { needsDisplayName: data.needs_display_name, blocked: data.blocked };
}

/** Null when the row is missing or belongs to someone else. */
export async function fetchMyRecipeSubmission(
  client: SupabaseClient<Database>,
  id: string,
): Promise<MyRecipeSubmission | null> {
  const { data, error } = await client.rpc("fetch_my_recipe_submission", { p_id: id }).single();

  if (error) {
    if (raisedCode(error) === "not_found") return null;
    throw error;
  }

  return {
    id: data.id,
    status: toStatus(data.status),
    locale: data.locale,
    name: data.name,
    instructions: data.instructions,
    ingredients: toIngredients(data.ingredients),
    glass: data.glass ?? null,
    alcoholicStatus: data.alcoholic_status,
    note: data.note ?? null,
    photoPath: data.photo_path ?? null,
    rejectionReason: data.rejection_reason ?? null,
    approvedRecipeId: data.approved_recipe_id ?? null,
    updatedAt: data.updated_at,
    needsDisplayName: data.needs_display_name,
    blocked: data.blocked,
  };
}

// ---------------------------------------------------------------------------
// Author: withdraw (AC-6)

export type WithdrawSubmissionError =
  /** Gone already, or not the caller's. */
  | { reason: "not_found" }
  /** Approved rows are read only. */
  | { reason: "not_editable" }
  | { reason: "request_failed"; message: string };

export type WithdrawSubmissionResult =
  { data: { id: string }; error: null } | { data: null; error: WithdrawSubmissionError };

/**
 * Deletes a pending or rejected submission, then removes its photo files. A
 * failed file removal is left for the daily cleanup (AC-19), so it never
 * fails the withdraw.
 */
export async function withdrawRecipeSubmission(
  client: SupabaseClient<Database>,
  id: string,
): Promise<WithdrawSubmissionResult> {
  const { data, error } = await client.rpc("withdraw_recipe_submission", { p_id: id }).single();

  if (error) {
    const code = raisedCode(error);
    if (code === "not_found" || code === "not_editable") {
      return { data: null, error: { reason: code } };
    }
    return { data: null, error: { reason: "request_failed", message: error.message } };
  }

  const photoPath = (data as { photo_path: string | null }).photo_path;
  if (photoPath) {
    await removeSubmissionPhoto(client, photoPath);
  }

  return { data: { id }, error: null };
}

// ---------------------------------------------------------------------------
// Author: duplicate name warning (AC-7)

/**
 * Live catalog recipes whose localized or English name equals the typed
 * name: `search_recipes` in the current locale, then the exact match filter.
 */
export async function findDuplicateRecipeNames(
  client: SupabaseClient<Database>,
  { name, locale }: { name: string; locale: Locale },
): Promise<RecipeSearchResult[]> {
  const query = trimSubmissionText(name);
  if (query.length === 0) return [];
  const results = await searchRecipes(client, {
    query,
    pageLimit: DUPLICATE_SEARCH_LIMIT,
    locale,
  });
  return findDuplicateRecipes(query, results);
}

// ---------------------------------------------------------------------------
// Admin: list and fetch (AC-10, AC-11)

export interface AdminSubmissionSummary {
  id: string;
  name: string;
  authorId: string;
  authorDisplayName: string | null;
  locale: string;
  photoPath: string | null;
  textScreening: ScreeningResult | null;
  photoScreening: ScreeningResult | null;
  submittedAt: string;
  reviewedAt: string | null;
}

export const ADMIN_SUBMISSIONS_PAGE_SIZE = 25;

export async function adminListRecipeSubmissions(
  client: SupabaseClient<Database>,
  {
    status,
    cursor = null,
    limit = ADMIN_SUBMISSIONS_PAGE_SIZE,
  }: { status: SubmissionStatus; cursor?: SubmissionCursor | null; limit?: number },
): Promise<SubmissionPage<AdminSubmissionSummary>> {
  const { data, error } = await client.rpc("admin_list_recipe_submissions", {
    p_status: status,
    p_cursor_at: cursor?.at ?? null,
    p_cursor_id: cursor?.id ?? null,
    p_limit: limit,
  } as Rpc["admin_list_recipe_submissions"]["Args"]);

  if (error) throw error;

  const items = (data ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    authorId: row.author_id,
    authorDisplayName: row.author_display_name ?? null,
    locale: row.locale,
    photoPath: row.photo_path ?? null,
    textScreening: toScreening(row.text_screening),
    photoScreening: toScreening(row.photo_screening ?? null),
    submittedAt: row.submitted_at,
    reviewedAt: row.reviewed_at ?? null,
  }));

  const last = items[items.length - 1];
  const sortKey = (item: AdminSubmissionSummary) =>
    status === "pending" ? item.submittedAt : (item.reviewedAt ?? item.submittedAt);
  return {
    items,
    nextCursor: items.length === limit && last ? { at: sortKey(last), id: last.id } : null,
  };
}

export interface SimilarRecipe {
  id: string;
  name: string;
  baseName: string;
}

export interface AdminSubmissionDetail {
  id: string;
  authorId: string;
  status: SubmissionStatus;
  locale: string;
  name: string;
  instructions: string;
  ingredients: SubmissionIngredientPayload[];
  glass: string | null;
  alcoholicStatus: string;
  note: string | null;
  photoPath: string | null;
  textScreening: ScreeningResult | null;
  photoScreening: ScreeningResult | null;
  screeningNote: string | null;
  rejectionReason: string | null;
  approvedRecipeId: string | null;
  submittedAt: string;
  reviewedAt: string | null;
  /** The AC-14 concurrency token: send it back with approve or reject. */
  updatedAt: string;
  authorDisplayName: string | null;
  authorBlocked: boolean;
  similarRecipes: SimilarRecipe[];
}

function toSimilarRecipes(value: Json): SimilarRecipe[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (typeof item !== "object" || item === null || Array.isArray(item)) return [];
    const { id, name, base_name: baseName } = item;
    return typeof id === "string" && typeof name === "string"
      ? [{ id, name, baseName: typeof baseName === "string" ? baseName : name }]
      : [];
  });
}

/** Null when the submission no longer exists. Throws for a non admin. */
export async function adminFetchRecipeSubmission(
  client: SupabaseClient<Database>,
  id: string,
): Promise<AdminSubmissionDetail | null> {
  const { data, error } = await client.rpc("admin_fetch_recipe_submission", { p_id: id }).single();

  if (error) {
    if (raisedCode(error) === "not_found") return null;
    throw error;
  }

  return {
    id: data.id,
    authorId: data.author_id,
    status: toStatus(data.status),
    locale: data.locale,
    name: data.name,
    instructions: data.instructions,
    ingredients: toIngredients(data.ingredients),
    glass: data.glass ?? null,
    alcoholicStatus: data.alcoholic_status,
    note: data.note ?? null,
    photoPath: data.photo_path ?? null,
    textScreening: toScreening(data.text_screening),
    photoScreening: toScreening(data.photo_screening ?? null),
    screeningNote: data.screening_note ?? null,
    rejectionReason: data.rejection_reason ?? null,
    approvedRecipeId: data.approved_recipe_id ?? null,
    submittedAt: data.submitted_at,
    reviewedAt: data.reviewed_at ?? null,
    updatedAt: data.updated_at,
    authorDisplayName: data.author_display_name ?? null,
    authorBlocked: data.author_blocked === true,
    similarRecipes: toSimilarRecipes(data.similar_recipes),
  };
}

// ---------------------------------------------------------------------------
// Admin: reject (AC-13, AC-14)

export type RejectSubmissionError =
  | { reason: "validation"; error: RejectionReasonError }
  /** The author saved after you loaded it, or it is no longer pending (AC-14). */
  | { reason: "stale" }
  | { reason: "not_admin" }
  | { reason: "not_found" }
  | { reason: "request_failed"; message: string };

export type RejectSubmissionResult =
  { data: { updatedAt: string }; error: null } | { data: null; error: RejectSubmissionError };

export interface RejectSubmissionInput {
  submissionId: string;
  reason: string;
  /** The `updatedAt` the admin loaded. */
  expectedUpdatedAt: string;
}

export async function rejectRecipeSubmission(
  client: SupabaseClient<Database>,
  { submissionId, reason, expectedUpdatedAt }: RejectSubmissionInput,
): Promise<RejectSubmissionResult> {
  const invalid = validateRejectionReason(reason);
  if (invalid !== null) {
    return { data: null, error: { reason: "validation", error: invalid } };
  }

  const { data, error } = await client
    .rpc("admin_reject_recipe_submission", {
      p_id: submissionId,
      p_reason: trimSubmissionText(reason),
      p_expected_updated_at: expectedUpdatedAt,
    })
    .single();

  if (error) {
    const code = raisedCode(error);
    if (code === "stale" || code === "not_admin" || code === "not_found") {
      return { data: null, error: { reason: code } };
    }
    if (code === "invalid_reason") {
      return { data: null, error: { reason: "validation", error: "required" } };
    }
    return { data: null, error: { reason: "request_failed", message: error.message } };
  }

  return { data: { updatedAt: data.updated_at }, error: null };
}

// ---------------------------------------------------------------------------
// Admin: block from submitting (AC-18)

export type SetSubmissionBlockError =
  { reason: "not_admin" } | { reason: "not_found" } | { reason: "request_failed"; message: string };

export type SetSubmissionBlockResult =
  { data: { blocked: boolean }; error: null } | { data: null; error: SetSubmissionBlockError };

export interface SetSubmissionBlockInput {
  /** Any submission by the author; the block applies to the author. */
  submissionId: string;
  blocked: boolean;
}

export async function setSubmissionBlock(
  client: SupabaseClient<Database>,
  { submissionId, blocked }: SetSubmissionBlockInput,
): Promise<SetSubmissionBlockResult> {
  const { data, error } = await client
    .rpc("admin_set_submission_block", { p_submission_id: submissionId, p_blocked: blocked })
    .single();

  if (error) {
    const code = raisedCode(error);
    if (code === "not_admin" || code === "not_found") {
      return { data: null, error: { reason: code } };
    }
    return { data: null, error: { reason: "request_failed", message: error.message } };
  }

  return { data: { blocked: data.blocked }, error: null };
}

// ---------------------------------------------------------------------------
// Admin: approve (AC-11, AC-14)

export type ApproveSubmissionError =
  | { reason: "validation"; errors: AdminRecipeValidationError[] }
  /** The author saved after you loaded it, or it is no longer pending (AC-14). */
  | { reason: "stale" }
  | { reason: "not_admin" }
  | { reason: "not_found" }
  /** A database validation message (spec 0030's plain text). */
  | { reason: "rejected"; message: string }
  /** The kept photo could not be copied into recipe-images; nothing was saved. */
  | { reason: "photo_copy_failed" }
  /** The recipe is live under `recipeId`, but its style and tips did not save. */
  | { reason: "notes_failed"; recipeId: string; message: string }
  | { reason: "request_failed"; message: string };

export type ApproveSubmissionResult =
  { data: { recipeId: string }; error: null } | { data: null; error: ApproveSubmissionError };

export interface ApproveSubmissionInput {
  submissionId: string;
  expectedUpdatedAt: string;
  keepPhoto: boolean;
  /** The review form's values (the spec 0030 form, prefilled from the submission). */
  values: AdminRecipeFormValues;
}

async function readErrorBody(error: FunctionsHttpError): Promise<Record<string, unknown>> {
  try {
    const body: unknown = await error.context.json();
    return typeof body === "object" && body !== null ? (body as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/**
 * Calls the admin-approve-submission Edge Function, which creates the
 * community recipe in one atomic step, then saves the drink style and tips
 * the same way saveAdminRecipe does (admin_set_recipe_notes).
 */
export async function approveRecipeSubmission(
  client: SupabaseClient<Database>,
  { submissionId, expectedUpdatedAt, keepPhoto, values }: ApproveSubmissionInput,
): Promise<ApproveSubmissionResult> {
  const errors = validateAdminRecipeForm(values);
  if (errors.length > 0) {
    return { data: null, error: { reason: "validation", errors } };
  }

  const ingredients = values.ingredients.filter((i) => i.name.trim().length > 0);
  const tags = values.tags.filter((t) => t.name.trim().length > 0);
  const flavorNames = values.flavorProfile
    ? [...new Set(values.flavorProfile.map((f) => f.name.trim()).filter((n) => n.length > 0))]
    : null;

  const { data, error } = await client.functions.invoke<unknown>("admin-approve-submission", {
    method: "POST",
    body: {
      submission_id: submissionId,
      expected_updated_at: expectedUpdatedAt,
      keep_photo: keepPhoto,
      recipe: {
        name: values.name.trim(),
        instructions: values.instructions.trim(),
        glass: canonicalGlass(values.glass),
        alcoholic_status: values.alcoholicStatus,
        region: values.region?.trim() || null,
        ingredients: toAdminIngredientPayload(ingredients),
        tags: tags.map((tag) => ({ name: tag.name.trim() })),
        flavor_profile: flavorNames,
        method: values.method,
        fame_score: parseFameScore(values.fameScore).data,
        bartender_tip: values.bartenderTip.trim() || null,
      },
    },
  });

  if (error) {
    if (error instanceof FunctionsHttpError) {
      const status = error.context.status as number;
      if (status === 409) return { data: null, error: { reason: "stale" } };
      if (status === 403) return { data: null, error: { reason: "not_admin" } };
      if (status === 404) return { data: null, error: { reason: "not_found" } };
      if (status === 502) {
        const body = await readErrorBody(error);
        if (body.error === "photo_copy_failed") {
          return { data: null, error: { reason: "photo_copy_failed" } };
        }
      }
      if (status === 422) {
        const body = await readErrorBody(error);
        const message = typeof body.message === "string" ? body.message : "Validation failed.";
        return { data: null, error: { reason: "rejected", message } };
      }
    }
    return { data: null, error: { reason: "request_failed", message: error.message } };
  }

  const recipeId =
    typeof data === "object" &&
    data !== null &&
    typeof (data as { recipe_id?: unknown }).recipe_id === "string"
      ? (data as { recipe_id: string }).recipe_id
      : null;

  if (recipeId === null) {
    return { data: null, error: { reason: "request_failed", message: "Unexpected response." } };
  }

  const notes = await client.rpc("admin_set_recipe_notes", {
    p_recipe_id: recipeId,
    p_drink_style: values.drinkStyle,
    p_drink_style_note: values.drinkStyleNote.trim() || null,
    p_bartender_tip: values.bartenderTip.trim() || null,
    p_presentation_tip: values.presentationTip.trim() || null,
  } as Rpc["admin_set_recipe_notes"]["Args"]);

  if (notes.error) {
    return {
      data: null,
      error: { reason: "notes_failed", recipeId, message: notes.error.message },
    };
  }

  return { data: { recipeId }, error: null };
}

// ---------------------------------------------------------------------------
// Admin: Draft English (AC-12)

export interface EnglishDraft {
  name: string;
  instructions: string;
  glass: string | null;
  note: string | null;
  ingredients: { name: string; measure: string | null }[];
}

export type DraftEnglishError =
  | { reason: "not_admin" }
  | { reason: "not_found" }
  /** The model failed or returned an unusable draft; try again. */
  | { reason: "model_failed" }
  | { reason: "request_failed"; message: string };

export type DraftEnglishResult =
  { data: EnglishDraft; error: null } | { data: null; error: DraftEnglishError };

const isText = (value: unknown): value is string => typeof value === "string";
const isOptionalText = (value: unknown): value is string | null =>
  value === null || typeof value === "string";

/** Shape check of the Edge Function's reply; null when it isn't a draft. */
export function toEnglishDraft(raw: unknown): EnglishDraft | null {
  if (typeof raw !== "object" || raw === null) return null;
  const { name, instructions, glass, note, ingredients } = raw as Record<string, unknown>;
  if (!isText(name) || !isText(instructions) || !isOptionalText(glass) || !isOptionalText(note)) {
    return null;
  }
  if (!Array.isArray(ingredients)) return null;
  const parsed = ingredients.map((item: unknown) => {
    if (typeof item !== "object" || item === null) return null;
    const { name: ingredientName, measure } = item as Record<string, unknown>;
    return isText(ingredientName) && isOptionalText(measure)
      ? { name: ingredientName, measure }
      : null;
  });
  const valid = parsed.filter(
    (item): item is { name: string; measure: string | null } => item !== null,
  );
  if (valid.length !== parsed.length) return null;
  return { name, instructions, glass, note, ingredients: valid };
}

/**
 * Asks the draft-submission-english Edge Function for an English version of
 * a non English submission. Nothing is saved; the draft fills the review form.
 */
export async function draftSubmissionEnglish(
  client: SupabaseClient<Database>,
  submissionId: string,
): Promise<DraftEnglishResult> {
  const { data, error } = await client.functions.invoke<unknown>("draft-submission-english", {
    method: "POST",
    body: { submission_id: submissionId },
  });

  if (error) {
    if (error instanceof FunctionsHttpError) {
      const status = error.context.status as number;
      if (status === 403) return { data: null, error: { reason: "not_admin" } };
      if (status === 404) return { data: null, error: { reason: "not_found" } };
      if (status === 502) return { data: null, error: { reason: "model_failed" } };
    }
    return { data: null, error: { reason: "request_failed", message: error.message } };
  }

  const draft = toEnglishDraft(data);
  return draft ? { data: draft, error: null } : { data: null, error: { reason: "model_failed" } };
}
