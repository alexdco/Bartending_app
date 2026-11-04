// One middleware function, both concerns composed. next-intl's middleware
// may itself return a redirect or rewrite (locale detection); the Supabase
// cookie refresh must run against that SAME response object, not a separate
// one, so a refreshed cookie is never written onto a response that gets
// discarded, and request.cookies is updated in lockstep so anything reading
// cookies later in this same middleware pass sees the refreshed values.
import createMiddleware from "next-intl/middleware";
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { isSupportedLocale, resolveRedirectLocale } from "@bartendingapp/shared";
import { routing } from "./i18n/routing";
import { SUPABASE_ANON_KEY, SUPABASE_URL, SUPABASE_COOKIE_OPTIONS } from "./lib/supabase-env";

const intlMiddleware = createMiddleware(routing);

// Every path with no locale prefix is sent to a launched locale here, ahead of
// next-intl, whose own detection would accept any supported locale.
function unprefixedRedirect(request: NextRequest): NextResponse | null {
  const { pathname } = request.nextUrl;
  const firstSegment = pathname.split("/")[1]?.toLowerCase();

  if (isSupportedLocale(firstSegment)) {
    return null;
  }

  const locale = resolveRedirectLocale(
    request.cookies.get("NEXT_LOCALE")?.value,
    request.headers.get("accept-language"),
  );
  const url = request.nextUrl.clone();
  url.pathname = pathname === "/" ? `/${locale}` : `/${locale}${pathname}`;
  return NextResponse.redirect(url);
}

export default async function middleware(request: NextRequest) {
  const response = unprefixedRedirect(request) ?? intlMiddleware(request);

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
