// One middleware function, both concerns composed. next-intl's middleware
// may itself return a redirect or rewrite (locale detection); the Supabase
// cookie refresh must run against that SAME response object, not a separate
// one, so a refreshed cookie is never written onto a response that gets
// discarded, and request.cookies is updated in lockstep so anything reading
// cookies later in this same middleware pass sees the refreshed values.
import createMiddleware from "next-intl/middleware";
import { createServerClient } from "@supabase/ssr";
import { type NextRequest } from "next/server";
import { routing } from "./i18n/routing";
import { SUPABASE_ANON_KEY, SUPABASE_URL, SUPABASE_COOKIE_OPTIONS } from "./lib/supabase-env";

const intlMiddleware = createMiddleware(routing);

export default async function middleware(request: NextRequest) {
  const response = intlMiddleware(request);

  const supabase = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookieOptions: SUPABASE_COOKIE_OPTIONS,
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (cookiesToSet) => {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
      },
    },
  });

  // getClaims() verifies the JWT locally (no network call), so most requests
  // (including SEO crawler traffic on public pages, which this matcher also
  // covers) pay no round trip cost at all. Only a token close to expiry
  // triggers the network-calling refresh, via getUser(), which also writes
  // the refreshed cookie through setAll above.
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims) {
    await supabase.auth.getUser();
  }

  return response;
}

export const config = {
  matcher: ["/((?!api|_next|_vercel|.*\\..*).*)"],
};
