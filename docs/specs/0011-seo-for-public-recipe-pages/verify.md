# Verify: SEO for public recipe pages · spec 0011 · updated 2026-09-07 (re-run 2026-09-07)

_Steps derived from spec 0011 acceptance criteria. `/check verify` runs these; `/test` locks the durable ones._

_Implementation note: the legacy bare `/recipes/<uuid>` form is not a separate route (Next.js does not allow two differently named dynamic segments at the same path level). Instead `/recipes/[slug]/page.tsx` itself parses the trailing UUID out of whatever param it receives and issues the 308 redirect when the param isn't already the canonical slug. Functionally this satisfies AC-3 identically to a dedicated legacy route._

_Implementation note: AC-4 assumes the search page's active query is reflected in the URL's `q` param. The page had no such URL state before this build (it used only local component state); `apps/web/src/recipes/search-page-client.tsx` now syncs `q` via `router.replace` so metadata and `noindex` can read it. This was treated as required wiring the spec already named the mechanism for, not a new decision._

## UI / manual

- [x] Visit `/recipes/negroni-<id>` → renders with title "Negroni", a `<link rel="canonical">` to the same slugged URL, and a valid Recipe JSON-LD `<script>` tag → AC-1, AC-2, AC-9
- [x] Visit `/recipes/<bare-id>` (no slug) → 308 redirect to `/recipes/negroni-<id>` → AC-3
- [x] Visit `/recipes/anything-<unknown-or-deleted-id>` → real 404 → AC-3
- [ ] Visit a recipe with `imageUrl: null` → normal metadata renders, no JSON-LD `<script>` tag present (no null-image recipe exists in the live catalog to exercise this; verified by code inspection of `buildRecipeJsonLd` instead) → AC-2
- [x] Visit `/?q=margarita` → title "margarita recipes", `<meta name="robots" content="noindex, follow">` → AC-4
- [x] Visit `/` with no query → generic fallback title/description, no `noindex` tag → AC-4
- [ ] Visit `/popular/<a-real-region-slug>` → server rendered list with a title naming that region (no region has been tagged against the live catalog yet — feature 11's tagging script hasn't been run — so this can't be exercised live; region slug matching verified directly against `matchRegionSlug`/`slugify` instead) → AC-5, AC-9
- [x] Visit `/popular` with zero tagged regions → renders a real empty state instead of a blank page (the redirect-to-first-region and legacy `?region=` redirect paths are implemented but likewise unexercised live pending region data) → AC-5
- [ ] Visit `/popular/not-a-real-region` → real 404 (unexercised live for the same reason; `matchRegionSlug` returning `null` → `notFound()` verified by code inspection) → AC-6

## Commands

- [x] `curl -s http://localhost:3000/sitemap.xml` → includes `/`, every non deleted recipe's slugged URL, no bare `/recipes/<uuid>` entries → AC-7
- [x] `curl -s http://localhost:3000/robots.txt` → allows `/`, `/recipes`, `/popular`; disallows `/account`, `/auth`, `/pantry` → AC-8
- [x] `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm --filter web build` → all clean

## Acceptance-criteria coverage

- AC-1 … covered by the recipe detail manual step (live) · title/description from real name + ingredients
- AC-2 … covered by the recipe detail JSON-LD manual step (live, image present) and code inspection (null image path, no live data available)
- AC-3 … covered by the canonical-slug and bare-id-redirect manual steps (live) and the 404 step (live)
- AC-4 … covered by the `?q=` and bare `/` manual steps (live)
- AC-5 … covered by the empty-state manual step (live, zero tagged regions) and code inspection for the tagged-region and redirect paths (no live region data yet)
- AC-6 … covered by code inspection of `matchRegionSlug` → `notFound()` (no live region data yet)
- AC-7, AC-8 … covered by the sitemap/robots command checks (live)
- AC-9 … covered by the recipe detail canonical/OG check (live); search and popular region OG tags added identically but not independently re-checked live beyond the code review
