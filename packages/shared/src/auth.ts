import type { SupabaseClient } from "@supabase/supabase-js";
import { ensureAnonymousSession } from "./supabaseClient";
import type { Database } from "./database.types";
import { fetchProfile, updateDisplayName, updateLocale } from "./preferences";
import type { Locale } from "./locale";

export type AuthErrorReason =
  | "weak_password"
  | "invalid_credentials"
  | "email_already_registered"
  | "no_session"
  | "network_error";

export class AuthError extends Error {
  reason: AuthErrorReason;

  constructor(reason: AuthErrorReason, message: string) {
    super(message);
    this.reason = reason;
  }
}

function toAuthError(error: { message: string; code?: string }): AuthError {
  const message = error.message.toLowerCase();

  if (error.code === "weak_password" || message.includes("password")) {
    return new AuthError("weak_password", error.message);
  }
  if (error.code === "invalid_credentials" || message.includes("invalid login")) {
    return new AuthError("invalid_credentials", error.message);
  }
  if (error.code === "user_already_exists" || message.includes("already registered")) {
    return new AuthError("email_already_registered", error.message);
  }

  return new AuthError("network_error", error.message);
}

export interface SignUpResult {
  /** False only when a name was provided but saving it after linking failed; sign up itself still succeeded. */
  nameSaved: boolean;
}

export async function signUpWithPassword(
  client: SupabaseClient<Database>,
  email: string,
  password: string,
  name?: string,
): Promise<SignUpResult> {
  const { error } = await client.auth.updateUser({ email, password });

  if (error) {
    throw toAuthError(error);
  }

  const trimmedName = name?.trim() ?? "";
  if (trimmedName.length === 0) {
    return { nameSaved: true };
  }

  // Non blocking: sign up already succeeded above regardless of this outcome.
  const result = await updateDisplayName(client, trimmedName);
  return { nameSaved: result.error === null };
}

export async function signInWithPassword(
  client: SupabaseClient<Database>,
  email: string,
  password: string,
  guestLocale?: Locale | null,
): Promise<void> {
  const { error: signOutError } = await client.auth.signOut();
  if (signOutError) {
    throw toAuthError(signOutError);
  }

  const { error } = await client.auth.signInWithPassword({ email, password });

  if (error) {
    throw toAuthError(error);
  }

  // AC-16: the account's own stored locale always wins; the guest's local
  // choice is written up only when the account has none yet. Non blocking,
  // matching signUpWithPassword's display name write: sign in already
  // succeeded above regardless of this outcome.
  if (guestLocale) {
    const profile = await fetchProfile(client);
    if (profile.locale === null) {
      await updateLocale(client, guestLocale);
    }
  }
}

export async function signOutToAnonymous(client: SupabaseClient<Database>): Promise<void> {
  const { error } = await client.auth.signOut();
  if (error) {
    throw toAuthError(error);
  }

  await ensureAnonymousSession(client);
}

export async function requestPasswordReset(
  client: SupabaseClient<Database>,
  email: string,
  redirectTo: string,
): Promise<void> {
  const { error } = await client.auth.resetPasswordForEmail(email, { redirectTo });

  if (error) {
    throw toAuthError(error);
  }
}

export async function completePasswordReset(
  client: SupabaseClient<Database>,
  newPassword: string,
): Promise<void> {
  const { error } = await client.auth.updateUser({ password: newPassword });

  if (error) {
    throw toAuthError(error);
  }
}

export async function changeEmail(
  client: SupabaseClient<Database>,
  newEmail: string,
): Promise<void> {
  const { error } = await client.auth.updateUser({ email: newEmail });

  if (error) {
    throw toAuthError(error);
  }
}
