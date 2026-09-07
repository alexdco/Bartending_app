# Verify: Recipe search and detail · spec 0004 · updated 2026-09-07
_Steps derived from spec 0004 acceptance criteria. `/check verify` runs these; `/test` locks the durable ones._

## UI / manual
- [ ] Web: visit `/`, no query entered → the first 20 recipes render alphabetically without needing input → AC-2
- [ ] Web: type "margarita" in the search box → the Margarita recipe appears near the top, opening it shows instructions, image, and its ordered ingredients with measures → AC-1, AC-5, AC-6
- [ ] Web: type "lime" (an ingredient, not a recipe name) → recipes containing lime appear, ordered alphabetically → AC-1, AC-5
- [ ] Web: select the "Non alcoholic" filter with an empty query → only non alcoholic recipes render → AC-3
- [ ] Web: select a filter and a query together → results satisfy both → AC-3
- [ ] Web: scroll to the bottom of the loaded results → the next page appends without a full reload or losing scroll position → AC-4
- [ ] Web: visit `/recipes/<a real id>` → name, alcoholic status, glass, ordered ingredients with measures, and instructions all render → AC-6
- [ ] Web: visit `/recipes/00000000-0000-0000-0000-000000000000` (a nonexistent id) → a not found page (404), not a crash or blank page → AC-7
- [ ] Web: with the network disabled or Supabase unreachable, load `/` → a visible error state with a retry action, not a silent failure → AC-8
- [ ] Mobile: open the Search tab with an empty query → the first 20 recipes render → AC-2
- [ ] Mobile: search "margarita" on the Search tab, open the result → the same detail content as web renders (image, instructions, ordered ingredients) → AC-1, AC-6, AC-9
- [ ] Mobile: scroll to the bottom of search results → the next page loads via `onEndReached` → AC-4
- [ ] Mobile: open a soft deleted or nonexistent recipe id → a "Recipe not found" empty state, not a crash → AC-7
- [ ] Mobile: force a network failure on the Search tab → a visible error state with a Retry button → AC-8

## Commands
- [ ] `pnpm --filter web build` → succeeds, `/` prerenders statically using live data → AC-1, AC-2
- [ ] `pnpm --filter mobile exec tsc --noEmit` → passes → AC-9
- [ ] `pnpm test` → all existing suites still pass (26/26 at build time) → regression guard

## Live data checks (already run once during this build; re run to confirm no drift)
- [ ] `select count(*) from search_recipes('margarita')` → 2 results, Margarita ranked first → AC-1, AC-5
- [ ] `select count(*) from search_recipes('', null, 100000, 0)` → exactly 50 rows (the page_limit clamp) → AC-4
- [ ] Two adjacent pages (`page_offset` 0 and 5, `page_limit` 5) of `search_recipes('')` share zero overlapping recipe ids → AC-4
- [ ] Temporarily soft delete a recipe containing a known ingredient (e.g. tequila in "Margarita"), then `search_recipes('tequila')` inside a rolled back transaction → 0 rows for that recipe, confirming the ingredient branch does not leak soft deleted recipes despite `recipe_ingredients`/`ingredients` RLS having no `deleted_at` awareness → AC-7, security

## Acceptance-criteria coverage
- AC-1 (name or ingredient match) … covered by the margarita/lime manual steps and the live SQL check
- AC-2 (empty query browses all) … covered by the empty-query manual steps on both platforms
- AC-3 (status filter composes with query) … covered by the filter manual steps
- AC-4 (pagination, infinite scroll) … covered by the scroll manual steps, the page_limit clamp, and the adjacent-page overlap check
- AC-5 (name relevance first, then alphabetical ingredient matches) … covered by the margarita/lime manual steps
- AC-6 (detail page full content) … covered by the detail page manual steps on both platforms
- AC-7 (not found / soft deleted) … covered by the nonexistent-id manual steps and the soft delete SQL check
- AC-8 (visible error + retry) … covered by the network failure manual steps on both platforms
- AC-9 (platform parity) … covered by the shared query layer (built once, used by both) and the mobile detail manual step comparing content to web
