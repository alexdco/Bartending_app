# 0029. Server side session reading for gated pages on web

**Date**: 2026-09-30
**Status**: Accepted

## Summary

This spec decides how any Next.js server rendered page in `apps/web`, starting with the admin comments page from spec 0028, can find out who is signed in before it renders anything. Today the signed in state lives only in the browser's storage, so a server rendered page has no way to see it at all. The fix is to switch the web app to Supabase's own cookie based session package (`@supabase/ssr`, a small library that keeps the session in a cookie both the browser and the server can read), which means updating the existing browser based Supabase client too, not just adding a new one.

## Context

Spec 0028 designed `/admin/comments` as a Next.js server component that "reads the session server side, checks `is_admin`, and redirects to `/` immediately if false or absent, before any query against `comments` runs." That assumption does not hold today. The web app's one Supabase client (`apps/web/src/lib/supabase.ts`) is built with plain `createClient` from `@supabase/supabase-js`, which defaults to storing the session in the browser's `localStorage`. A server component runs on the server, with no access to the browser's `localStorage`, so it has no way to see whether a request is signed in, let alone whether that user is an admin. Every existing auth read in the app (`use-session.ts`, the nav badge, the account page, comment and rating mutations) is a client component hook built on this same browser only session.

This gap is not unique to the admin comments page. The project's own `AGENTS.md` names Next.js App Router with server rendering as a deliberate choice for SEO reasons, and spec 0028 itself frames the admin page as the first of "any future server gated page." Any later feature that wants a server rendered, authorization checked page (a second admin tool, a server rendered account page, anything that must redirect before sending markup to an unauthorized visitor) hits the same wall. Deciding this once, as a reusable pattern, avoids re-deriving it ad hoc per feature and avoids each one inventing a slightly different, possibly leaky, workaround (such as checking authorization client side after the page has already rendered, which spec 0028's own AC-4 explicitly rules out for the admin case).

The web app also already runs one middleware (`apps/web/src/proxy.ts`, for `next-intl` locale routing) and already bootstraps an anonymous Supabase session client side on first load (`ensureAnonymousSession`, called from `Providers`). Both interact with whatever changes here: Next.js only runs one middleware per matched path, and a first time visitor's cookie will not yet reflect any session, anonymous or signed in, when a server component first runs.

## Requirements

This is a standalone, cross cutting decision; it has no independent acceptance criteria of its own; it is a reusable pattern, not a shippable feature in its own right.

## Options considered

### Option 1: Adopt `@supabase/ssr`, cookie backed sessions, three Supabase client factories

Move the session into a cookie using Supabase's own `@supabase/ssr` package. Replace the single browser client in `apps/web/src/lib/supabase.ts` with `createBrowserClient` (same storage the server can also read), add a new `createServerClient` based factory for server components and route handlers, and keep a third, plain anon key client for server code that only needs public data and no user session. Wire a cookie refresh step into the existing `proxy.ts` middleware.

**Pros**:
- The officially supported, documented pattern for Next.js App Router plus Supabase; every later server gated page in this app follows the same recipe.
- Keeps every client's job honest: a browser client for client components, a cookie aware server client for session aware server code, a plain anon client for public server side reads that do not need cookies at all.

**Cons**:
- A real migration, not an additive change: the existing browser client swaps implementations, and that touches every file that imports it (around 25 web files today), plus the handful of existing server components that already import the browser client for public reads and need to move to the new anon client instead.

### Option 2: Keep localStorage sessions, gate server pages client side only

Leave the current browser only session model untouched. A server gated page like `/admin/comments` renders as a client component, checks `is_admin` from `useSession()` in the browser, and redirects client side if not an admin.

**Pros**:
- No migration of the existing client or its ~25 call sites; zero risk to any currently working auth flow.

**Cons**:
- Cannot meet spec 0028's own AC-4 ("redirected to the home page before any admin markup or comment data reaches them"): a client component's first render still ships to the browser before the redirect can fire, so admin markup and comment data would briefly reach every visitor, including the data the whole feature exists to protect from non admins.

### Option 3: Custom JWT claim via a Postgres auth hook, read without cookies

Set a custom claim (e.g. `app_metadata.is_admin`) via a Postgres auth hook and pass the raw access token to the server some other way (a custom header, a signed param) without adopting cookie based sessions at all.

**Pros**:
- Avoids touching the existing browser client.

**Cons**:
- Does not actually solve the stated problem: without a cookie (or an equivalent mechanism to carry the token to the server on each request) a server component still has no way to receive the token in the first place; this option solves "how is admin encoded" but not "how does the server see the session," which is the actual gap. Also reintroduces the auth hook complexity spec 0028 explicitly rejected as overkill for one admin.

## Decision

**Chosen option**: Option 1: Adopt `@supabase/ssr`, cookie backed sessions, three Supabase client factories

Add `@supabase/ssr` to `apps/web`. Three Supabase client factories now exist side by side, each with one honest job:

- `apps/web/src/lib/supabase.ts`: swaps to `createBrowserClient` from `@supabase/ssr`. Every existing "use client" call site (`use-session.ts`, `Providers`, mutation hooks, comment/rating/favorite/pantry hooks, and the rest of the ~25 current importers) keeps importing from the same path and keeps working unchanged, now backed by a cookie instead of `localStorage`.
- `apps/web/src/lib/supabase-server.ts` (new): `createServerClient` from `@supabase/ssr`, reading and writing cookies via `next/headers`. Used by server components and route handlers that need to know the signed in user (the admin check for `/admin/comments`, and any future server gated page).
- `apps/web/src/lib/supabase-public.ts` (new): a plain `createClient` with the anon key, no cookie handling at all. Used by server components that read public data with no session dependency: `sitemap.ts`, `app/[locale]/popular/page.tsx`, `app/[locale]/popular/[region]/page.tsx`, `app/[locale]/recipes/[slug]/page.tsx`, `app/[locale]/quizzes/page.tsx`, `app/[locale]/quizzes/[slug]/page.tsx`, `app/[locale]/learn/[category]/page.tsx`, `app/[locale]/learn/[category]/[slug]/page.tsx`, and `app/[locale]/search/page.tsx`, all of which currently import the plain browser client server side by coincidence rather than by design.

`apps/web/src/proxy.ts` gains a Supabase cookie refresh step composed into its existing exported middleware function (the same one `next-intl` already runs), so there is exactly one middleware function, matching the same broad route matcher it already uses (excluding `_next`, `_vercel`, and static files). The refresh step keeps the session cookie current so a server component downstream always sees an up to date session.

A server gated page's authorization check (the canonical pattern below) treats a missing cookie or an anonymous session identically to a non admin: both fail the `is_admin` check and redirect, with no special casing needed, since `is_admin` can never be true for a session that does not exist or belongs to an anonymous user. The redirect target is always the current locale's home page (`/<locale>`, using next-intl's own locale aware `redirect` helper, not a bare `redirect("/")`), since this app always renders under a `[locale]` segment; no original URL needs preserving, since an admin only page has no sign in UI to return a visitor to afterward.

Because an existing visitor's anonymous session lives only in `localStorage` today, swapping the browser client to a cookie backed one would otherwise make that session invisible on first load after deploy, silently orphaning their pantry, favorites, ratings, and comments under a `user_id` they can no longer reach. `Providers` gains a one time migration step, run before `ensureAnonymousSession`: read the existing `localStorage` session (the same key `@supabase/supabase-js`'s browser storage already uses), and if present, call the new client's `setSession()` with it before clearing the old key. This carries a signed in user's session across the same way.

Reading the session in middleware on every matched request (`supabase.auth.getUser()`, which calls out to Supabase Auth to verify the token) adds a network round trip to every page load, including search engine crawler traffic on the SEO scoped public pages, which this project's `AGENTS.md` names as a deliberate concern. Middleware uses the cheaper `supabase.auth.getClaims()` instead (local JWT verification, no network call) to decide whether a refresh is even needed, reserving the round trip `getUser()` call for the server gated page itself, where it is already paying for the `user_preferences` query right after it. The middleware's cookie refresh work is further scoped to the same broad matcher (everything except `_next`, `_vercel`, static files, and `/api`) since any page could be the entry point to a gated one, but the per request cost is now a local check, not a network call, except on the small number of requests that actually need a refresh.

**Implementation skills**: `nextjs-app-router-patterns` (`wshobson/agents`, `.agents/skills/nextjs-app-router-patterns/`) · `supabase-postgres-best-practices` (`supabase/agent-skills`, `.agents/skills/supabase-postgres-best-practices/`)

## Rationale

Option 2 is ruled out directly by spec 0028's own AC-4, which this spec exists to make buildable in the first place; a client side only gate cannot satisfy "before any admin markup or comment data reaches them" because the client component's output still ships before the redirect runs. Option 3 does not address the actual problem (the server has no way to receive the session at all without a cookie or equivalent carrier), and reintroduces the auth hook complexity spec 0028 weighed and rejected for the same reason: one admin, for the foreseeable future, does not justify that operational surface.

Option 1 costs a real migration of the existing browser client, but the alternative is two session stores (the old `localStorage` based one and a new cookie based one) that silently disagree about who is signed in, which is a worse outcome than the migration itself. Splitting into three factories, rather than reusing the browser client for the existing public server side reads, keeps each client's contract honest: `createBrowserClient` is documented to run in a browser and manage `document.cookie`, and using it inside a server component (as several files already do today, by accident) is a latent bug waiting on the day it is asked to do something that actually depends on cookie behavior. The public anon client makes those existing reads correct by construction instead of by coincidence.

## Standard definition

**Canonical pattern**:
```typescript
// apps/web/src/lib/supabase-env.ts — fail fast at module load, not per request,
// since the server client now runs inside middleware on every matched request
function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const SUPABASE_URL = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
export const SUPABASE_ANON_KEY = requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY");

// Shared cookie options for every Supabase cookie written in this app.
// httpOnly stays false deliberately: the browser client (below) reads these
// same cookies via document.cookie, which every existing "use client" call
// site depends on; secure is relaxed outside production so local http dev
// still works; sameSite "lax" keeps the cookie attached across the
// auth-callback-client.tsx redirect (email confirm, password reset, email
// change), which is a same site top level navigation.
export const SUPABASE_COOKIE_OPTIONS = {
  path: "/",
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
};
```

```typescript
// apps/web/src/lib/supabase.ts — browser client, for "use client" components and hooks
import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@bartendingapp/shared";
import { SUPABASE_ANON_KEY, SUPABASE_URL, SUPABASE_COOKIE_OPTIONS } from "./supabase-env";

export const supabase = createBrowserClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, {
  cookieOptions: SUPABASE_COOKIE_OPTIONS,
});
```

```typescript
// apps/web/src/lib/supabase-server.ts — cookie aware client, for server components,
// server actions, and route handlers that need to know the signed in user
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
        // step (below) is what actually persists a refreshed session, so a
        // write failure here is expected and safely ignored when this runs
        // inside a Server Component. A Server Action or Route Handler using
        // this same factory CAN write cookies; a failure there is a real
        // environment problem (e.g. no response object available) and
        // should not be silently assumed benign the way the Server Component
        // case is, so it is logged rather than swallowed.
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          );
        } catch (error) {
          console.error("Supabase cookie write failed outside middleware", error);
        }
      },
    },
  });
}
```

```typescript
// apps/web/src/lib/supabase-public.ts — plain anon client, for server side
// reads of public data with no user session dependency (sitemap, recipe/
// quiz/popular/learn pages)
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@bartendingapp/shared";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "./supabase-env";

export const supabasePublic = createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY);
```

```typescript
// A server gated page, e.g. apps/web/src/app/[locale]/admin/comments/page.tsx
// Note this reconciles spec 0028's page path (written there as the unlocalized
// apps/web/src/app/admin/comments/page.tsx) to this app's real routing, which
// is entirely under a [locale] segment (see apps/web/src/i18n/routing.ts); the
// admin page is built under [locale] like every other page, this spec's Follow
// up flags updating spec 0028's Build plan to match.
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { redirect } from "@/i18n/routing"; // next-intl's locale aware redirect

export default async function AdminCommentsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || user.is_anonymous) {
    redirect({ href: "/", locale });
  }

  const { data: preferences } = await supabase
    .from("user_preferences")
    .select("is_admin")
    .eq("user_id", user.id)
    .single();

  if (!preferences?.is_admin) {
    redirect({ href: "/", locale });
  }

  // Safe to query comments and render admin markup from here on. Note this
  // route reading cookies via createSupabaseServerClient opts it out of
  // static rendering/ISR, which is expected and fine for an admin only page,
  // but is the reason public pages route through supabase-public.ts instead
  // (see Rationale).
}
```

```typescript
// apps/web/src/proxy.ts — one middleware function, both concerns composed.
// next-intl's middleware may itself return a redirect or rewrite (locale
// detection); the Supabase cookie refresh must run against that SAME
// response object, not a separate one, so a refreshed cookie is never
// written onto a response that gets discarded, and request.cookies is
// updated in lockstep so anything reading cookies later in this same
// middleware pass sees the refreshed values.
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
```

**Replaces**:
- `createClient` from `@supabase/supabase-js` as the web app's browser client (`apps/web/src/lib/supabase.ts`), which stores the session in `localStorage` and is invisible to the server.
- The implicit pattern, already present in several server components (`sitemap.ts`, `popular/page.tsx`, `popular/[region]/page.tsx`, `recipes/[slug]/page.tsx`, `quizzes/page.tsx`, `quizzes/[slug]/page.tsx`, `learn/[category]/page.tsx`, `learn/[category]/[slug]/page.tsx`, `search/page.tsx`), of importing the browser client server side for public reads; these move to `supabase-public.ts`.
- A client side only authorization gate for any page that must hide its markup and data from an unauthorized visitor (ruled out directly by spec 0028's AC-4).

**Enforcement**:
Review convention for now: `apps/web/AGENTS.md` documents the three client factories and when to use each (this spec's Follow-up). No lint rule enforces the split today; a future ESLint rule restricting imports of `supabase-server.ts` to server only files, or `supabase.ts` to `"use client"` files, is left as a Follow-up rather than built now, since the project has exactly one server gated page today and a lint rule for a three way split is premature at this scale.

**One time session carry over** (part of the same migration PR, runs once client side before the new browser client's first real use):

```typescript
// In apps/web/src/app/[locale]/providers.tsx, before ensureAnonymousSession
// runs. @supabase/supabase-js's old localStorage format stores the session
// under a key shaped "sb-<project-ref>-auth-token"; without this step, every
// existing visitor's anonymous session (and the pantry/favorites/ratings/
// comments tied to its user_id) becomes unreachable the moment the browser
// client starts reading cookies instead of localStorage, since
// ensureAnonymousSession would silently mint a brand new anonymous user.
function carryOverLegacySession() {
  const legacyKey = Object.keys(window.localStorage).find(
    (key) => key.startsWith("sb-") && key.endsWith("-auth-token"),
  );
  if (!legacyKey) return; // nothing to carry over, e.g. a first time visitor

  try {
    const stored = JSON.parse(window.localStorage.getItem(legacyKey) ?? "null");
    if (stored?.access_token && stored?.refresh_token) {
      supabase.auth.setSession({
        access_token: stored.access_token,
        refresh_token: stored.refresh_token,
      });
    }
  } finally {
    window.localStorage.removeItem(legacyKey);
  }
}
```

**Rollout**:
Single migration PR. The browser client swap, the two new factories, the middleware composition, and the one time session carry over land together, since a half migrated state (new server client reading cookies that the old browser client never writes, or visitors silently losing their anonymous session) would leave the two sides disagreed about the session, or quietly orphan existing guest data. The public reads already importing the browser client server side move to `supabase-public.ts` in the same change, since they sit on the same file being swapped. Before merging, re-derive the list of server side files importing `@/lib/supabase` by search rather than trusting the list below, since new files may have been added since this spec was written.

**Exceptions**:
None. Every Supabase client in `apps/web` going forward uses one of the three factories above, matched to its context (browser component, server component needing the user, or server component reading public data only).

## Consequences

**Positive**:
- Unblocks spec 0028's admin comments page, and every future server gated page in `apps/web`, with one documented, reusable pattern instead of each page inventing its own.
- Fixes a latent correctness issue in the existing public server side reads, which were using a browser oriented client server side by coincidence, not by design.

**Negative / tradeoffs**:
- A real migration touching `apps/web/src/lib/supabase.ts` and roughly 25 existing call sites (their imports are unchanged, but the underlying client's session storage mechanism changes from `localStorage` to cookies), plus the handful of existing server components that move to the new public client. Risk is concentrated in the swap itself; a mistake there could sign users out unexpectedly or break the anonymous session bootstrap. The one time session carry over step mitigates the specific risk of an existing visitor's anonymous session becoming unreachable, but is itself new code with its own small risk (a malformed legacy value, handled by the `try`/`finally` always clearing the old key so a failed carry over degrades to "mints a new anonymous user," the same outcome as doing nothing, not a crash).
- A server gated page that reads cookies (via `createSupabaseServerClient`) opts out of static rendering and ISR for that route; acceptable for an admin only page, but worth remembering before gating something that was relying on static generation for SEO.
- The middleware's local JWT check (`getClaims()`) still runs on every matched request, including SEO crawler traffic; this is cheap (no network call) compared to the `getUser()` alternative, but is not literally free, and is the tradeoff accepted for keeping one broad matcher instead of narrowing the Supabase step to only non public routes.
- One more client factory to keep straight (three, instead of one); a future contributor must pick the right one for a new file's context, which this spec's Follow-up addresses by documenting the split in `apps/web/AGENTS.md`.
- Mobile (`apps/mobile`) is unaffected and keeps its own existing `createSupabaseClient` from `packages/shared`; this spec is scoped to the web app only, since React Native has no server rendering concept this decision would apply to.
- `@supabase/supabase-js` becomes a direct dependency of `apps/web` (today it is only reached transitively through `@bartendingapp/shared`), since `supabase-public.ts` calls its `createClient` directly; `@supabase/ssr` is also added directly. Both must be pinned to versions compatible with `packages/shared`'s existing `@supabase/supabase-js` version to avoid a pnpm workspace hoisting two incompatible majors, which would break the shared `Database` generic across the three client factories.

**Neutral**:
- `packages/shared`'s existing `createSupabaseClient` factory (used by `apps/mobile` and today also by `apps/web`) is left untouched; this spec does not touch `packages/shared`, since the new SSR aware client depends on `next/headers`, which `packages/shared` cannot depend on per its own `AGENTS.md` (no React or Next.js dependency).
- The anonymous session bootstrap (`ensureAnonymousSession`, called client side from `Providers`) is unchanged in its own logic; a server gated page simply treats a not yet bootstrapped (missing) session the same as a non admin, which already matches spec 0028's AC-4. `Providers` does gain the one time session carry over step described above, which runs once ahead of the existing bootstrap call.
- There are no Route Handlers (`app/**/route.ts`) in `apps/web` today; `createSupabaseServerClient` is written to also work from one once any exist (e.g. a future server side `/auth/callback` route, see Follow-up), not only from Server Components.

## Follow-up

- [ ] Document the three client factory split (`supabase.ts`, `supabase-server.ts`, `supabase-public.ts`) and when to use each in `apps/web/AGENTS.md`'s `## Key files` and `## Conventions` sections; not yet captured there.
- [ ] Consider an ESLint import restriction rule once more than one or two server gated pages exist, to catch a server component accidentally importing the browser client; not justified yet at today's single page scale.
- [ ] Spec 0028's `## Build plan` step 3 names the page path as `apps/web/src/app/admin/comments/page.tsx`; this spec's canonical pattern corrects that to `apps/web/src/app/[locale]/admin/comments/page.tsx`, matching how every other page in this app actually routes. Update spec 0028's Build plan to match before or during that page's build.
- [ ] `auth-callback-client.tsx` (email confirmation, password reset, email change) is a client component today; now that cookie based sessions make a server side code exchange possible, consider moving it to a Route Handler (`app/[locale]/auth/callback/route.ts`) using `createSupabaseServerClient`, which is the more conventional place for an OAuth/magic link style code exchange. Not required for this spec's scope, flagged for a later pass.

## References

**Project sources** (verifiable, in this repo):
- `AGENTS.md`, the Next.js App Router / Supabase stack decision (spec 0001)
- Spec 0028, the admin comments page's AC-4 (the requirement this spec unblocks) and its `is_admin` column/RLS design
- `apps/web/src/proxy.ts`, the existing `next-intl` middleware this spec composes into
- `packages/shared/AGENTS.md`, the no React/Next.js dependency rule that keeps the new server client web app local rather than in `packages/shared`

**Practices & standards**:
- Supabase's documented server side rendering pattern for `@supabase/ssr` with the Next.js App Router (three client contexts: browser, server component, middleware)
- Fail closed authorization: a missing or ambiguous session (no cookie, or an anonymous user) is treated as unauthenticated, never as an implicit pass
