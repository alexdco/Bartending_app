import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";
import { validateDisplayName, type DisplayNameValidationError } from "./initials";

export type Theme = "light" | "dark" | "system";

export const DEFAULT_THEME: Theme = "system";

export interface Profile {
  theme: Theme;
  displayName: string | null;
}

export async function fetchPreferences(client: SupabaseClient<Database>): Promise<Theme> {
  const { data, error } = await client.from("user_preferences").select("theme").maybeSingle();

  if (error) {
    throw error;
  }

  return (data?.theme as Theme | undefined) ?? DEFAULT_THEME;
}

export async function fetchProfile(client: SupabaseClient<Database>): Promise<Profile> {
  const { data, error } = await client
    .from("user_preferences")
    .select("theme, display_name")
    .maybeSingle();

  if (error) {
    throw error;
  }

  return {
    theme: (data?.theme as Theme | undefined) ?? DEFAULT_THEME,
    displayName: data?.display_name ?? null,
  };
}

export type UpdateDisplayNameError =
  | { reason: DisplayNameValidationError }
  | { reason: "no_session" }
  | { reason: "request_failed"; message: string };

export type UpdateDisplayNameResult =
  | { data: { displayName: string | null }; error: null }
  | { data: null; error: UpdateDisplayNameError };

/**
 * Column scoped update (never a full row upsert) so a concurrent write to `theme`
 * from another device is never clobbered. Trims and validates before saving; an
 * empty (post trim) value clears the stored name.
 */
export async function updateDisplayName(
  client: SupabaseClient<Database>,
  rawValue: string,
): Promise<UpdateDisplayNameResult> {
  const { trimmed, error: validationError } = validateDisplayName(rawValue);

  if (validationError) {
    return { data: null, error: { reason: validationError } };
  }

  const displayName = trimmed.length === 0 ? null : trimmed;

  const { data: sessionData, error: sessionError } = await client.auth.getSession();

  if (sessionError || !sessionData.session?.user.id) {
    return { data: null, error: { reason: "no_session" } };
  }

  const userId = sessionData.session.user.id;

  // Upsert scoped to user_id + display_name only: the conflict branch updates
  // just this column (never resetting theme), the insert branch only fires
  // when this user has no row yet (theme then takes its table default).
  const { error } = await client
    .from("user_preferences")
    .upsert({ user_id: userId, display_name: displayName }, { onConflict: "user_id" });

  if (error) {
    return { data: null, error: { reason: "request_failed", message: error.message } };
  }

  return { data: { displayName }, error: null };
}

export async function updatePreferences(
  client: SupabaseClient<Database>,
  theme: Theme,
): Promise<void> {
  const { data: sessionData, error: sessionError } = await client.auth.getSession();

  if (sessionError) {
    throw sessionError;
  }

  const userId = sessionData.session?.user.id;

  if (!userId) {
    throw new Error("No active session; cannot update preferences.");
  }

  const { error } = await client
    .from("user_preferences")
    .upsert({ user_id: userId, theme }, { onConflict: "user_id" });

  if (error) {
    throw error;
  }
}
