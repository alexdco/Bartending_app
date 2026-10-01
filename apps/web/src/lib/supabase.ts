import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@bartendingapp/shared";
import { SUPABASE_ANON_KEY, SUPABASE_URL, SUPABASE_COOKIE_OPTIONS } from "./supabase-env";

export const supabase = createBrowserClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, {
  cookieOptions: SUPABASE_COOKIE_OPTIONS,
});
