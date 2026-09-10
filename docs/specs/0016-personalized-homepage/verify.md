# Verify: Personalized homepage · spec 0016 · updated 2026-09-09
_Steps derived from spec 0016 acceptance criteria. `/check verify` runs these; `/test` locks the durable ones._

## UI / manual

- [ ] Visit web `/` as a guest with pantry items, recent views, and a tagged region → hero, region shortcut row, and all four carousels render in order (drink ideas, recommended, recently viewed, popular by region) → AC-1
- [ ] Same on mobile's Home tab → same four carousels, same order → AC-1
- [ ] A source returning more than 10 items shows exactly 10 cards in its carousel row, horizontally scrollable → AC-2
- [ ] Drink ideas carousel "See more" navigates to `/drink-ideas` (web) / the Drink ideas tab (mobile) → AC-3
- [ ] Popular by region carousel "See more" navigates to `/popular/<region-slug>` (web) / the Popular tab preset to that region (mobile) → AC-3, AC-13
- [ ] Recommended and recently viewed carousels render with no "See more" control → AC-3
- [ ] New guest with no recently viewed history → recently viewed carousel and its heading are absent entirely (no empty state box) → AC-4
- [ ] Pantry empty (drink ideas query settles with zero matches) → drink ideas carousel is replaced by a single "Go to pantry" call to action card → AC-5
- [ ] No region has been tagged (`listPopularRegions` returns empty) → region shortcut row and popular by region carousel are both absent → AC-6
- [ ] Region shortcut row renders one pill per region in the order `listPopularRegions` returns; tapping a pill navigates to that region's Popular page/tab without changing the homepage's own popular by region carousel (still headed with the first region's name) → AC-7
- [x] Hero renders a static tagline and a "Search recipes" action that navigates to `/search` (web) or the Search tab (mobile), with no loading state ever shown for the hero itself → AC-8 — `curl http://localhost:3000/`, HTML contains "What are you drinking tonight" and `href="/search"` (mobile not exercised, no simulator)
- [ ] Throttle network before load → each carousel shows a skeleton row sized to its final height, and no visible layout shift occurs as each resolves → AC-9 — BLOCKED, no browser tool connected
- [ ] Force drink ideas and recommendations to error with a missing/invalid session (`28000`) → a single dismissible page level "Something went wrong loading your homepage. Retry." banner appears; other carousels (e.g. popular by region) still render normally → AC-9 — BLOCKED, no browser tool connected; the underlying `28000` error code was confirmed real and live (see Commands section)
- [x] Web: visit `/?q=margarita` → 307 redirect to `/search?q=margarita`; visit bare `/` → homepage renders, not a redirect → AC-10 — `curl -D - http://localhost:3000/?q=margarita` → `307`, `location: /search?q=margarita`; `curl http://localhost:3000/` → `200`, homepage HTML
- [x] Web: `/search` metadata is unconditionally `noindex, follow`; `/` metadata has `canonical: "/"` and stays indexable → AC-10 — `/search` HTML has `<meta name="robots" content="noindex, follow">`; `/` HTML has `<link rel="canonical" href="http://localhost:3000">` and no robots-noindex meta
- [x] Mobile: confirm `apps/mobile/src/app/explore.tsx` no longer exists and no `NativeTabs.Trigger name="explore"` remains in `app-tabs.tsx`; `index` tab is still first/default; Search tab behavior/position unchanged → AC-11 — `ls apps/mobile/src/app/explore.tsx` → no such file; `grep "NativeTabs.Trigger name=\"explore\""` → no match
- [ ] Sign out to a fresh guest session and reload the homepage → page still renders with no sign in gate anywhere except the `/?q=` redirect path → AC-12 — BLOCKED, no browser tool connected; also anonymous sign-in is currently disabled on the live Supabase project (`anonymous_provider_disabled`), so this can't be simulated via script either
- [x] Mobile: `useLocalSearchParams<{ region?: string }>()` seeds `explicitRegion`'s initial state in `apps/mobile/src/app/popular.tsx` (code inspection; no simulator available to drive the actual navigation) → AC-13

## Value sourcing coverage

- [ ] Drink ideas carousel reflects current pantry state (add a pantry item, reload, confirm the carousel changes) → drink ideas value sourcing row — BLOCKED, needs a browser + a live session (anonymous sign-in currently disabled on the project)
- [ ] Recommended carousel reflects recent view history (view a new recipe, reload, confirm recommendations shift) → recommendations value sourcing row — BLOCKED, same reason
- [x] Recently viewed carousel: `fetchRecipesByIds` preserves input id order and drops a nonexistent id rather than erroring → recently viewed value sourcing row — live Supabase query against 3 real recipe ids in shuffled order, resorted output matched input order exactly; a 4th bogus id mixed in returned 3 rows, not 4, no error (scratch script run against project `ctuzjhhpnkkhooneporu`, deleted after)
- [ ] Popular by region carousel is fixed to the first region from `listPopularRegions`, independent of which region pill was last tapped → popular by region value sourcing row — BLOCKED, `listPopularRegions()` currently returns `[]` live (region tagging script from feature 11 hasn't been run against this project yet), so there is no region to fix the carousel to right now; confirmed via direct RPC call

## Commands

- [x] `pnpm --filter @bartendingapp/shared typecheck` → passes
- [x] `pnpm --filter web typecheck` → passes
- [x] `pnpm --filter mobile typecheck` → passes
- [x] `pnpm lint` → passes across all workspaces (all 4 packages)
- [x] `pnpm test` → all existing tests pass (4 files, 30 tests)
- [x] `pnpm --filter web build` → succeeds; route list includes `ƒ /` and `ƒ /search`

## Acceptance-criteria coverage

- AC-1 … homepage render order (web + mobile) · AC-2 … 10 item cap · AC-3 … see more targets and their absence · AC-4 … recently viewed omit rule · AC-5 … drink ideas zero-match CTA · AC-6 … no regions omit rule · AC-7 … region pill row and fixed first-region carousel · AC-8 … hero · AC-9 … skeletons, independent failure, session error banner · AC-10 … `/search` split, redirect, metadata · AC-11 … explore tab removal · AC-12 … guest/signed-in parity · AC-13 … mobile region route param
