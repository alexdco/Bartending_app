# 0053. Timed revalidation for the Learn routes

**Date**: 2026-11-13
**Status**: In Progress

## Summary

The three Learn pages on the web app get a deliberate cache: a page is built once, served from cache, and rebuilt in the background at most every 60 seconds (ISR, incremental static regeneration). Spec 0025 promised this, but it never landed, and today the pages render fresh on every request by accident. Building it means letting each page render without reading request headers, prebuilding the landing and category pages at deploy, and building each article on its first visit. An edit or unpublish in Supabase Studio shows up within about two minutes (a preview deploy measures the real delay), with no webhook and no new infrastructure.

## Context

> ⚠️ Premise note: no performance problem has been measured on the Learn pages, and caching before measuring is usually premature. Here the cache is not an optimisation bolted on: spec 0025 already decided it, the work is closing the gap between that spec and the code, and the Learn pages are public, SEO facing, and rarely edited, which is the textbook fit for a timed cache. The change adds no infrastructure, so the usual cost of a premature cache (a new layer that can fail) does not apply. Scope stays at the three Learn routes; it is not a site wide caching standard.

Spec 0025 (Learn section) says the three Learn routes (`/learn`, `/learn/[category]`, `/learn/[category]/[slug]`) export `revalidate = 60`, so an archived article stops rendering within a bounded time. No route in `apps/web` exports `revalidate` today. Spec 0033 noticed the gap and logged it as a follow up; scope feature 56 tracks it.

How the routes really behave today (from the last build's `prerender-manifest.json`): none of the three Learn routes is prerendered, not even the `/learn` landing page, which reads no data at all. Every Learn view is a full server render with fresh Supabase reads. The cause is next-intl: the pages call `getTranslations` and `getLocale` without first calling `setRequestLocale` themselves. Only `[locale]/layout.tsx` calls it, and since layouts and pages render in parallel, next-intl falls back to reading the locale from request headers, which forces dynamic rendering. The layout itself is static capable (the client pages under it, such as `/en/account`, are prerendered).

Two more facts shape the design. The article page reads the same article twice per render, once in `generateMetadata` and once in the page body, with nothing deduping the calls. And Learn content is edited only in Supabase Studio or the dashboard SQL editor (spec 0033), so the app has no code path that runs when an article changes; anything that wants to react to an edit would need a database webhook.

Workspace: `apps/web` only (Next.js 16.3, next-intl 4.14, React 19.2, deployed on Vercel). Mobile reads Learn through TanStack Query and is not affected. The shared fetch helpers (`fetchArticlesByCategory`, `fetchArticleDetail`, `fetchQuizBySource` in `packages/shared`) throw on a Supabase error rather than returning empty, which matters for how a failed rebuild behaves.

## Requirements

**User stories**:
- As a reader (or a search crawler), I want Learn pages served from cache so that they load fast.
- As the content owner, I want an edit or an unpublish in Studio to reach the live site within about a minute, without a redeploy.
- As the developer, I want the caching mode written down and matching the code, so that no spec promises something the code does not do.

**Acceptance criteria**:
- **AC-1**: Each of the three Learn route files (`learn/page.tsx`, `learn/[category]/page.tsx`, `learn/[category]/[slug]/page.tsx`) exports `revalidate = 60`, and none exports `dynamic = "force-dynamic"`.
- **AC-2**: After `pnpm --filter web build`, `.next/prerender-manifest.json` lists `/<locale>/learn` and `/<locale>/learn/<category>` under `routes` for every locale in `routing.locales` and every category in `LEARN_CATEGORIES`, each with `initialRevalidateSeconds: 60`.
- **AC-3**: The same manifest lists `/[locale]/learn/[category]/[slug]` as a key under `dynamicRoutes` (built on first visit, then cached; `dynamicRoutes` entries carry no revalidate value, so presence is the check), and no `/<locale>/learn/<category>/<slug>` key appears under `routes` (no article is prebuilt).
- **AC-4**: On the deployed site, a change to a published article's `summary` made in the SQL editor appears on that article's page and its category page within about 2 minutes of the edit, after at most two page loads. (The page window is 60 seconds and stale while revalidate means the first load past it may still be old; Next's data cache may hold the Supabase read for up to another window during the rebuild. The preview check measures the real delay, and if it is about 1 minute this AC is tightened to match.)
- **AC-5**: Setting a published article's `status` to `archived` makes its page return a 404 and drops it from its category list, under the same timing as AC-4.
- **AC-6**: One render of an article page reads `learn_articles` once, not twice: `generateMetadata` and the page body share one `resolveArticle` result through React `cache()`, verified by counting reads in a `next dev` server log (React `cache()` is a passthrough under vitest, so a unit test cannot show it).
- **AC-7**: Every Learn page still renders the right locale's chrome and metadata: `/es/learn/<category>` shows the Spanish category title and description, and an article page's canonical URL and hreflang alternates are unchanged from today. No Learn page calls `getLocale()`; every locale value comes from the `locale` route param.
- **AC-8**: On a Vercel preview, `curl -I` on a non canonical article slug answers with a 308 to the canonical slug, and an unknown category or article id returns a 404.
- **AC-9**: If Supabase is unreachable while `next build` prebuilds a category page, the build fails (it does not ship an empty category page). If Supabase is unreachable during a background rebuild, the last good page keeps being served.
- **AC-10**: Spec 0025's caching bullet points to this spec as the record of the built caching mode.

## Options considered

### Option 1: Timed revalidation (ISR, 60 seconds)

Make the three pages static capable (call `setRequestLocale` in each page, pass the locale explicitly in metadata), export `revalidate = 60`, prebuild landing and category pages, build articles on first visit.

**Pros**:
- Matches spec 0025 exactly; the code finally does what was decided.
- Pages are served from Vercel's cache: fast for readers and crawlers, and Supabase sees at most one read per page per minute instead of one per view.
- No new infrastructure, secrets, or code paths that run outside a page render.

**Cons**:
- Edits are not instant: up to 60 seconds plus one request.
- The build now reads Supabase (category pages), so a Supabase outage blocks a deploy.
- Every distinct article URL visited (including made up ids) becomes a cache entry.

### Option 2: Dynamic render, made explicit

Keep today's behaviour, mark it with `export const dynamic = "force-dynamic"`, and correct spec 0025 instead of the code.

**Pros**:
- Edits show immediately; nothing new to build or reason about.
- The build never touches Supabase for Learn.

**Cons**:
- Every view, crawler traffic included, pays a full server render and fresh Supabase reads.
- Slower time to first byte on SEO facing pages that change perhaps a few times a month.

### Option 3: Timed revalidation plus on demand revalidation

ISR with a long window (say a day), plus a Supabase database webhook on `learn_articles` that calls a secret Next route handler, which calls `revalidatePath` for the affected pages.

**Pros**:
- Edits show in seconds while pages stay cached almost all the time.

**Cons**:
- Adds a webhook, a shared secret, a public route handler, and a failure mode (webhook down means content stays stale until the long window).
- All that for edits that happen rarely and by hand in Studio.

### Option 4: Cache Components (`cacheComponents`, `"use cache"`)

Turn on Next 16's Cache Components and mark the Learn data reads with `"use cache"`, `cacheLife`, and `cacheTag`.

**Pros**:
- The current model for caching in Next.js, with fine grained control per data read.

**Cons**:
- `cacheComponents` is a project wide flag that changes how every route in the app renders; adopting it is a cross cutting decision far larger than three pages.

## Decision

**Chosen option**: Option 1: Timed revalidation (ISR, 60 seconds)

The three Learn routes revalidate every 60 seconds; landing and category pages are prebuilt at deploy for every locale, articles are built on their first visit and then cached.

**Implementation skills**: `nextjs-app-router-patterns` (`wshobson/agents`, `.claude/skills/nextjs-app-router-patterns/`)

## Rationale

The forces that decide this are in Context: the content is public and SEO facing, it is edited rarely and only by hand in Studio, and spec 0025 already chose a 60 second window because an unpublish must take effect in bounded time. Option 1 is the only option that satisfies all three with no new moving parts. Option 2 is honest and simple, but it pays a server render and a Supabase round trip on every crawler hit to serve content that changes a few times a month. Option 3 buys seconds of freshness for rare manual edits at the price of a webhook, a secret, and a route handler someone has to keep working. Option 4 is the right conversation for the whole app someday, not for three pages.

The engineer chose to prebuild landing and category pages but not articles. The category list is fixed in code (`LEARN_CATEGORIES`), so prebuilding it needs no query to enumerate pages, and those pages are the entry points crawlers and readers hit first. Articles grow over time; enumerating them at build would make every deploy slower and still not cover articles published after the deploy. Building them on first visit keeps the build flat.

The engineer chose to let the build fail when Supabase is unreachable. That is the safe default: the shared helpers already throw on error, Vercel keeps serving the previous deploy, and catching the error would ship (or need special code to avoid shipping) an empty category page. The same throwing behaviour is what makes a failed background rebuild safe: Next keeps the last good page when a revalidation render throws.

Decisions settled while writing (each with the runner up):
- **All three routes get `revalidate = 60`, the landing page included.** Its content is pure translations, so it is effectively static, but one uniform mode is what scope feature 56 asks for and the cost is near zero. Runner up: leave the landing page plain static with no `revalidate`, which reads as a different mode for no gain.
- **The article route exports `generateStaticParams` returning `[]`.** This is the explicit way to say "no prebuilt articles, build each on first visit and cache it", and it keeps the route out of dynamic rendering. Runner up: omit it and rely on `revalidate` alone, which leaves the mode implicit and easier to break.
- **No `dynamicParams = false` anywhere.** The existing `isLearnCategory` check already returns a 404 for unknown categories; adding `dynamicParams` would be a second mechanism doing the same job. Runner up: `dynamicParams = false` on the category route.
- **Metadata functions pass the locale explicitly** (`getTranslations({ locale, namespace: "learn" })`, as `[locale]/layout.tsx` already does), and page bodies call `setRequestLocale(locale)` first. Runner up: call `setRequestLocale` in `generateMetadata` too, which works but is less explicit.
- **`getLocale()` is removed from all three pages.** The article page's `generateMetadata` and its `permanentRedirect` branch read `locale` from `params` instead, because metadata renders in parallel with the layout, so nothing guarantees `setRequestLocale` ran first and `getLocale()` could still read headers. Each page's param type gains `locale: string` (the article's becomes `{ locale; category; slug }`). Runner up: keep `getLocale()` in the page body only, which works once `setRequestLocale` ran but leaves two ways to get the locale.
- **Pages do not validate `locale` themselves.** The layout already calls `notFound()` for an unknown locale and the proxy routes only known ones, so a page passes the param straight to `setRequestLocale` (cast to `Locale`). Runner up: a `hasLocale(routing.locales, locale)` check per page, which duplicates the layout.
- **The landing page becomes an `async` component** taking `params`, so it can call `setRequestLocale(locale)` before `useTranslations`. Runner up: `use(params)` in a sync component, which is less common in this codebase.
- **The category `generateStaticParams` returns only `{ category }`** (`LEARN_CATEGORIES.map((category) => ({ category }))`); Next combines it with the parent `[locale]` params from the layout. Runner up: return `{ locale, category }` pairs itself, which duplicates the locale list.
- **All 9 locales in `routing.locales` are prebuilt, unlaunched ones included.** That is 45 category pages and about 90 Supabase reads per build, all returning the same English rows. It matches how the layout already prebuilds every locale, and the cost is a few seconds. Runner up: prebuild launched locales only and let the rest build on first visit, which makes the build depend on the launch list.
- **Unbounded article cache entries are accepted.** A crawler hitting made up article URLs creates one cached entry per URL (a 404, or a redirect for a non canonical slug with a valid id). `extractIdFromRecipeSlug` already rejects slugs without a valid UUID, so the space is bounded by validity, not by existence; at this traffic, with Vercel's cache eviction, that is not worth more guarding. Runner up: check the article exists before caching a redirect, which adds a read for no real gain.

## Feature design

**Data model sketch**: none. No schema change; the routes read `learn_articles` and `quizzes` through the existing shared helpers.

**API surface**: no new endpoints. The change is the route segment config and render path of three existing pages.

| Route file | Segment config | Prebuilt at deploy | Supabase reads per render |
|---|---|---|---|
| `[locale]/learn/page.tsx` | `revalidate = 60` | every locale (from the layout's `generateStaticParams`) | none |
| `[locale]/learn/[category]/page.tsx` | `revalidate = 60`, `generateStaticParams` over `LEARN_CATEGORIES` | every locale × every category | `fetchArticlesByCategory`, `fetchQuizBySource` |
| `[locale]/learn/[category]/[slug]/page.tsx` | `revalidate = 60`, `generateStaticParams` returning `[]` | none (first visit) | `fetchArticleDetail` once, via React `cache()` |

**Value sourcing**:
| Action | Value produced / displayed | Source |
|---|---|---|
| Any Learn render | locale used for translations, canonical, hreflang, Open Graph, and the canonical redirect | the `locale` route param from `params` (never `getLocale()`), set with `setRequestLocale(locale)` in the page body and passed explicitly to `getTranslations`, `localizedPath`, `buildOpenGraph`, and `permanentRedirect` |
| Category prebuild | the list of category paths | `generateStaticParams` returning `LEARN_CATEGORIES.map((category) => ({ category }))`; Next combines it with the parent `[locale]` params |
| Landing and category prebuild | the list of locales | `routing.locales`, via the existing `generateStaticParams` in `[locale]/layout.tsx` |
| Every cached page | how long it may be served before a rebuild | the literal `60` in each route's `revalidate` export (decided in spec 0025, kept here) |
| Article render | the article, read once for metadata and body | `fetchArticleDetail`, wrapped by a module level `cache()`'d `resolveArticle(category, slug)` |
| Category render | the published articles and the category quiz | `learn_articles` rows with `status = 'published'`, `quizzes` with `source_type = 'learn_category'` (existing helpers) |

**Key invariants**:
- No Learn page reads cookies, headers, or the session. Any such read silently turns the route dynamic again; AC-2 and AC-3 are the guard.
- `revalidate` is a literal number in each route file. Next requires segment config to be statically analyzable, so it cannot be an imported constant.
- A Supabase error during a render always throws (never returns empty), so neither a build nor a background rebuild can cache a falsely empty page.
- The cached HTML is identical for every visitor: the pages use only the anon `supabasePublic` client and show no per user data.

**Security model**: unchanged. Public pages, anon key, `learn_articles` row level security already limits anon reads to published rows. Caching a shared render is safe because nothing in it is per user.

**Configuration required**: none. No new env vars. The build already has `NEXT_PUBLIC_SUPABASE_URL` and the anon key, which category prebuilding now uses at build time.

**Critical test scenarios** (each maps to an acceptance criterion):
- Happy path: build, then inspect the prerender manifest for prebuilt landing and category paths with a 60 second revalidate and the article route under `dynamicRoutes`, verifies **AC-1**, **AC-2**, **AC-3**
- Freshness: on a deployed preview, edit an article summary in the SQL editor, then load the page every 30 seconds and record when the new summary first appears (expected within about 2 minutes), verifies **AC-4**
- Unpublish: archive an article the same way (then restore it), see a 404 and its removal from the category list, verifies **AC-5**
- Locale: load `/es/learn/<category>` and an `/fr` article, check titles, descriptions, canonical, hreflang, verifies **AC-7**
- Routing edges: `curl -I` a non canonical slug on the preview (expect a 308 to the canonical slug), an unknown category and an unknown id (expect 404), verifies **AC-8**
- Single read: a temporary log around `fetchArticleDetail` during `next dev` shows one `learn_articles` read per article render (remove the log after), verifies **AC-6**
- Failure at build: run `pnpm --filter web build` with `NEXT_PUBLIC_SUPABASE_URL` set to an unreachable host and confirm the build fails on a category page, verifies **AC-9**
- Failure at rebuild: not tested directly; it rests on Next keeping the last good page when a revalidation render throws, and on the shared helpers throwing on error. A first visit to an uncached article during an outage returns a 500, which is not cached, so each later visit renders again and reports to Sentry until Supabase recovers, verifies **AC-9**

## Build plan

Tracer Bullet: the first slice proves the whole caching path end to end on one route (article, the hardest one, since it is first visit ISR with metadata, redirects, and 404s), then the remaining two routes follow the proven pattern.

1. Article route end to end: add `locale` to the param type, call `setRequestLocale(locale)` at the top of the page, replace both `getLocale()` calls with the `locale` param, pass the locale explicitly in `generateMetadata`, wrap `resolveArticle` in React `cache()`, export `revalidate = 60` and `generateStaticParams` returning `[]`; build and confirm the route is a key under `dynamicRoutes` with no article path under `routes`, satisfies **AC-1**, **AC-3**, **AC-6**, **AC-7**
2. Category route: add `locale` to the param type, same locale handling, `revalidate = 60`, `generateStaticParams` returning only `{ category }`; build and confirm every locale × category path (45) is prebuilt with a 60 second revalidate, satisfies **AC-1**, **AC-2**, **AC-7**, **AC-9**
3. Landing route: make it `async` taking `params`, call `setRequestLocale`, pass the locale explicitly in `generateMetadata`, export `revalidate = 60`; confirm it is prebuilt per locale, satisfies **AC-1**, **AC-2**, **AC-7**
4. Point spec 0025's caching bullet at this spec, satisfies **AC-10**
5. Deployed gate on a Vercel preview (a gate, not an afterthought: the timing and redirect behaviour can only be proven deployed): `curl -I` the routing edges, then edit and archive an article (then restore it) and record the real delay; tighten AC-4 if it is about 1 minute, satisfies **AC-4**, **AC-5**, **AC-8**

## Consequences

**Positive**:
- The Learn pages serve from cache: faster for readers and crawlers, and Supabase load for Learn drops to at most one read per page per minute.
- Spec 0025 and the code agree, and the caching mode is written down once, here.
- The article page stops reading the same row twice.

**Negative / tradeoffs**:
- Edits and unpublishes take up to about 2 minutes to appear (one page window plus a possible data cache window, plus a request). Checking an edit right after making it will show the old page; spec 0033's after apply check needs to wait and reload.
- `next build` now depends on Supabase being reachable (category prebuilds: 45 pages, about 90 reads per build). A Supabase outage blocks deploys until it recovers.
- The Learn pages become fragile to dynamic reads: adding anything that reads cookies or headers (a signed in banner, say) quietly makes them dynamic again. Only a build output check catches it.
- Each distinct article URL requested becomes a cache entry, including made up ids.

**Neutral**:
- The pattern (per page `setRequestLocale`, explicit metadata locale) is the one next-intl requires for static rendering; any other public route that later wants caching (recipes, quizzes) would follow it.
- No migration, no feature flag. Rollback is reverting the commit, which returns the routes to per request rendering.

## Follow-up

- [ ] Other public content pages (quizzes, recipes, popular, home) are also rendered per request today for the same next-intl reason. Whether they should be cached is a separate decision, possibly a cross cutting caching standard (or the Cache Components switch); out of scope here.
- [ ] Spec 0033 still says its after apply check loads a fresh render; with this spec built, that check must wait and reload (/sync flags spec drift).
- [ ] Root `AGENTS.md` still lists community skills under `.agents/skills/`, while spec 0039 made `.claude/skills/` the one home (/sync owns that file).
- [ ] Once CI exists (feature 48), consider a check that fails if the Learn routes drop out of the prerender manifest, so an accidental dynamic read is caught automatically.
