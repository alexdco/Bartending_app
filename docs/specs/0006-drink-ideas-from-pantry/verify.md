# Verify: Drink ideas from pantry · spec 0006 · updated 2026-09-07
_Steps derived from spec 0006 acceptance criteria. `/check verify` runs these; `/test` locks the durable ones._

## UI / manual
- [ ] With lime juice, gin, and tonic water in the pantry, open the drink ideas page → a gin and tonic (or any recipe made only of those) appears under "You can make now" → AC-1
- [ ] With the same pantry, a recipe missing only one ingredient (e.g. simple syrup) appears under "Almost there", naming "simple syrup" as missing → AC-2
- [ ] Find or seed a 2 ingredient recipe missing exactly 1 ingredient (a 0.5 ratio, over the 0.25 cutoff) → it still appears under "Almost there" via the missing count exception → AC-2
- [ ] With a pantry that produces more than 20 combined matches, scroll or tap load more → the next page of results appears, spanning both sections → AC-3
- [ ] With an empty pantry (or one producing zero matches in both sections), open the drink ideas page → an empty state appears with a link/button to the pantry page, not an empty list → AC-4
- [ ] With the drink ideas page open, add or remove a pantry item from the pantry page (or recipe detail) → the drink ideas results update without a manual refresh, the next time the page is viewed or if already open → AC-5
- [ ] Simulate no active session (clear the anonymous session / block auth) → the drink ideas page shows the same retryable error state as a failed pantry action, never a silent "no matches" result → AC-6
- [ ] Soft delete a recipe (`deleted_at` set) that would otherwise match the pantry → it never appears in either section → AC-7
- [ ] Simulate a network or function failure while fetching matches → the page shows a retry affordance instead of an empty list; the rest of the app keeps working; retry re-fetches successfully → AC-8
- [ ] With two different sessions, one with no pantry items and one with several → each session's results reflect only its own pantry, never the other's → AC-9

## Commands
- [ ] `pnpm --filter @bartendingapp/shared typecheck` → passes → AC-1 through AC-9 (shared types compile)
- [ ] `pnpm --filter web typecheck` && `pnpm --filter web build` → passes, `/drink-ideas` route present → AC-1 through AC-8
- [ ] `pnpm --filter mobile typecheck` → passes → AC-1 through AC-8
- [ ] `pnpm test` → existing suite passes (no regression in `pantryMatching`/`tokens` tests) → regression guard
- [ ] `select public.match_recipes_to_pantry();` with no session set → raises `28000` → AC-6
- [ ] `select * from public.match_recipes_to_pantry(0.25, 50, 0);` with an authenticated session and no pantry rows → every returned row has `missing_ratio = 1` (nothing satisfies AC-1's zero-missing bar) → AC-1, AC-9 isolation

## Acceptance-criteria coverage
- AC-1 (you can make now) … covered by the happy path UI step and the no-pantry RPC check
- AC-2 (almost there + short recipe exception) … covered by the two "Almost there" UI steps
- AC-3 (pagination, 20/page) … covered by the load-more UI step
- AC-4 (empty state links to pantry) … covered by the empty pantry UI step
- AC-5 (refresh on pantry change) … covered by the add/remove-while-open UI step
- AC-6 (no session → retryable error) … covered by the no-session UI step and the RPC `28000` check
- AC-7 (soft deleted recipes excluded) … covered by the soft delete UI step
- AC-8 (fetch failure → retry) … covered by the simulated failure UI step
- AC-9 (pantry isolation) … covered by the two-session UI step and the RPC isolation check
