# Verify: popular drinks by region · spec 0010 · updated 2026-09-07
_Steps derived from spec 0010 acceptance criteria. `/check verify` runs these; `/test` locks the durable ones._

## UI / manual
- [ ] Before tagging: visit `/popular` (web) or the Popular tab (mobile) → the region picker shows no regions (its "no popular drinks yet" empty state), not an error or a blank page → AC-2
- [ ] Run `tag-regions` then `apply-regions` (see the report for the exact commands), then revisit `/popular` → the region picker shows every region that has at least one ranked recipe, in alphabetical order → AC-2
- [ ] Pick a region with 10 or more ranked recipes → exactly 10 recipe cards render, ordered by rank (rank 1 first) → AC-1, AC-3
- [ ] Pick a region with fewer than 10 ranked recipes → exactly that many render, no padding or repeats → AC-3
- [ ] Tap/click a recipe card from the popular list → the existing recipe detail page/screen opens (spec 0004), unchanged → AC-4
- [ ] Load `/popular` (web) or the Popular tab (mobile) as a signed out (guest) user with no session at all → identical behavior to a signed in user → AC-6
- [ ] On web, pick a region, refresh the page → the same region stays selected (the `?region=` query param survives the refresh) → AC-1

## Commands
- [ ] `pnpm --filter @bartendingapp/shared typecheck` → passes → AC-1 through AC-7 (build correctness)
- [ ] `pnpm --filter web typecheck` and `pnpm --filter mobile typecheck` → both pass → AC-1 through AC-6
- [ ] `pnpm lint` → passes with no errors → AC-1 through AC-6
- [ ] Simulate a network failure on `list_popular_regions` or `popular_recipes_by_region` (e.g. temporarily revoke `EXECUTE` from `anon`/`authenticated` in a rolled back transaction, or throw in the fetch layer) → the page/screen shows a visible error state with a retry action, not a crash or blank page → AC-5
- [ ] Run `tag-regions.ts` a second time without `--all` → it only proposes for recipes still missing a `region`, confirming safe rerunnability (Key invariants) → supports AC-7
- [ ] Run `apply-regions.ts` with a proposals file containing a `region` value outside the fixed 9 value list → the script aborts with a validation error and makes no writes (confirm via `select count(*) from recipes where region is not null` unchanged before/after) → AC-7
- [ ] After a real apply run, query `select region, popularity_rank from recipes where region is not null and popularity_rank is not null order by region, popularity_rank` → ranks are contiguous 1..N per region (no gaps, no duplicates), confirming the partial unique index and the `row_number()` recompute both hold → AC-3

## Acceptance-criteria coverage
- AC-1 (dedicated page/screen with picker + top ten) · covered by the "region picker" and "10 or more" UI steps, plus both apps' typecheck
- AC-2 (only regions with tagged recipes appear) · covered by the "before tagging" and "after tagging" UI steps
- AC-3 (rank order, exact count, no padding) · covered by the "10 or more"/"fewer than 10" UI steps and the ranks-contiguous SQL check
- AC-4 (recipe tap opens existing detail page unchanged) · covered by the "tap a recipe card" UI step
- AC-5 (failed query shows error + retry) · covered by the simulated network failure command
- AC-6 (identical web/mobile behavior, guest and signed in) · covered by the guest user UI step and both apps' typecheck/lint
- AC-7 (review before apply, never a direct write) · covered by the rerun and invalid-region validation command steps
