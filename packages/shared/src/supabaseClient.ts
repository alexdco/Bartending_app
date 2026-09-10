import { createClient, type SupabaseClient, type SupportedStorage } from "@supabase/supabase-js";
import type { Database } from "./database.types";

export type { Session } from "@supabase/supabase-js";

export function createSupabaseClient(
  url: string,
  anonKey: string,
  storage?: SupportedStorage,
): SupabaseClient<Database> {
  return createClient<Database>(url, anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
      ...(storage ? { storage } : {}),
    },
  });
}

export interface EnsureAnonymousSessionResult {
  userId: string;
}

export async function ensureAnonymousSession(
  client: SupabaseClient<Database>,
): Promise<EnsureAnonymousSessionResult> {
  const { data: existing, error: getSessionError } = await client.auth.getSession();

  if (getSessionError) {
    throw getSessionError;
  }

  if (existing.session) {
    return { userId: existing.session.user.id };
  }

  const { data, error } = await client.auth.signInAnonymously();

  if (error) {
    throw error;
  }

  if (!data.session) {
    throw new Error("Anonymous sign in did not return a session.");
  }

  return { userId: data.session.user.id };
}
