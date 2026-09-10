# Verify: recipe recommendations · spec 0009 · updated 2026-09-07
_Steps derived from spec 0009 acceptance criteria. `/check verify` runs these; `/test` locks the durable ones._

## UI / manual
- [ ] Open a recipe detail page (web and mobile) with pantry items sharing ingredients with other recipes → see a "You may also like" section with ranked recipes → AC-1
- [ ] Open a recipe detail page as a brand new guest with an empty pantry and no recently viewed recipes → see a stable fallback list (alphabetical), not an empty section → AC-2
- [ ] View a couple of recipes first (building recently viewed), then open a detail page with an empty pantry → see scored (non fallback) results → AC-3
- [ ] Click "See more" on the section → land on a dedicated full page/screen showing further results at the same page size → AC-4
- [ ] Add a pantry item while a recipe detail page is open → the "You may also like" section updates without a manual refresh → AC-5
- [ ] View more than 20 recipes across a session → confirm only the most recent 20 IDs are retained locally (inspect `localStorage`/`AsyncStorage`) → AC-6
- [ ] Simulate a network/server failure on the RPC call → see a retryable error state distinct from the empty/fallback rendering → AC-7
- [ ] Confirm no client-side control or request can pass another user's pantry data → AC-8

## Commands
- [x] `select recommend_recipes()` with a pantry item seeded for a temp session → returns scored rows in `score desc, name asc, id asc` order → AC-1 (verified live via Supabase MCP)
- [x] `select recommend_recipes()` with empty pantry and no recent views → returns 20 rows in `name asc` fallback order → AC-2 (verified live)
- [x] `select recommend_recipes(array[viewed_id, viewed_id, fake_id, deleted_id], viewed_id)` → succeeds, scores off the recent view alone, `max_score = 0.5` → AC-3, AC-8 (verified live)
- [x] `select recommend_recipes()` with no session (`request.jwt.claims` unset) → raises `28000` → AC-8 (verified live)
- [x] Join `recommend_recipes(..., 50, 0)` results against `recipes` filtered to `deleted_at is not null` → 0 rows → AC-9 (verified live)
- [ ] `pnpm test` — add unit coverage for `appendRecentlyViewed` (dedupe, cap at 20) once `/test` runs
- [x] `pnpm --filter @bartendingapp/shared typecheck && pnpm --filter web typecheck && pnpm --filter mobile typecheck` — all clean
- [x] `pnpm --filter web build` — both new routes (`/recipes/[id]`, `/recipes/[id]/more-like-this`) compile and register
- [x] `pnpm test` (repo-wide vitest) — 26/26 passing, no regressions

## Acceptance-criteria coverage
- AC-1 … covered by the happy-path DB test (live) and the manual detail-page step
- AC-2 … covered by the cold-start DB test (live) and the manual empty-activity step
- AC-3 … covered by the recent-view-only DB test (live) and the manual partial-signal step
- AC-4 … covered by the manual "See more" step (dedicated full page/screen, same query/page size)
- AC-5 … covered by the pantry mutation invalidation wiring (`use-pantry-mutations.ts`, both apps) and the manual reactivity step
- AC-6 … covered by `appendRecentlyViewed` cap=20 plus the manual local-storage inspection step
- AC-7 … covered by the manual network-failure step (retryable `EmptyState`/error UI, both apps)
- AC-8 … covered by the no-session `28000` DB test and the malformed/duplicate/unknown/soft-deleted `recent_recipe_ids` DB test (both live)
- AC-9 … covered by the soft-delete leakage DB test (live, 0 rows joined)
