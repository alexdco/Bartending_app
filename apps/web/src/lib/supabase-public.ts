import { createClient } from "@supabase/supabase-js";
import type { Database } from "@bartendingapp/shared";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "./supabase-env";

export const supabasePublic = createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY);
