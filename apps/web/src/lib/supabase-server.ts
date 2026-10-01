import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "@bartendingapp/shared";
import { SUPABASE_ANON_KEY, SUPABASE_URL, SUPABASE_COOKIE_OPTIONS } from "./supabase-env";

export async function createSupabaseServerClient() {
  const cookieStore = await cookies();
  return createServerClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookieOptions: SUPABASE_COOKIE_OPTIONS,
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (cookiesToSet) => {
        // A Server Component itself cannot write cookies, only middleware and
        // Server Actions/Route Handlers can; the middleware's own refresh
        // step is what actually persists a refreshed session, so a write
        // failure here is expected and safely ignored when this runs inside
        // a Server Component. A Server Action or Route Handler using this
        // same factory CAN write cookies; a failure there is a real
        // environment problem and should not be silently assumed benign.
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch (error) {
          console.error("Supabase cookie write failed outside middleware", error);
        }
      },
    },
  });
}
