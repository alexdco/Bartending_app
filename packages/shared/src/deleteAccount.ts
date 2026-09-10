import { FunctionsHttpError, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

export type DeleteAccountErrorReason = "no_session" | "delete_failed";

export class DeleteAccountError extends Error {
  reason: DeleteAccountErrorReason;

  constructor(reason: DeleteAccountErrorReason, message: string) {
    super(message);
    this.reason = reason;
  }
}

export async function deleteAccount(client: SupabaseClient<Database>): Promise<void> {
  const { error } = await client.functions.invoke("delete-account", { method: "POST" });

  if (error) {
    if (error instanceof FunctionsHttpError && error.context.status === 401) {
      throw new DeleteAccountError("no_session", "No active session.");
    }

    throw new DeleteAccountError("delete_failed", "Failed to delete account.");
  }
}
