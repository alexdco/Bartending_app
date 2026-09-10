# Verify: AI generated pantry drink ideas · spec 0007 · updated 2026-09-07

_Steps derived from spec 0007 acceptance criteria. `/check verify` runs these; `/test` locks the durable ones._

## UI / manual

- [ ] With a pantry of 2+ ingredients, open the drink ideas page and tap "Generate a new idea" → a named recipe appears with an ingredient list (rough amounts) and numbered steps, using only pantry ingredients, labeled "AI generated" → AC-1, AC-2
- [ ] With a pantry of 0 or 1 ingredients, open the drink ideas page → no Generate action is shown anywhere on the page; the existing spec 0006 empty state (or recipe list) renders unaffected → AC-3
- [ ] Refresh the page after a successful generation → the generated result is gone; generating again produces a different result, not the same one restored → AC-5
- [ ] With no active session (clear storage / sign out), open the drink ideas page and attempt to generate → the same retryable error state as a failed pantry/match request is shown, never a silent empty or default result → AC-6
- [ ] Trigger 10 generations for one user in a day, then attempt an 11th → a clear, retryable message names when the limit resets (not a silent failure); the message matches the server's `resetsAt` → AC-4
- [ ] Repeat the parity checks above on both `apps/web` and `apps/mobile` against the same live `generate-drink-idea` function → cross platform parity

## Commands

- [x] `pnpm --filter @bartendingapp/shared typecheck && pnpm --filter web typecheck && pnpm --filter mobile typecheck` → all pass → AC-1, AC-6, AC-7
- [x] `pnpm test` → all existing tests still pass (no regression) → general regression guard
- [x] `pnpm build` → web build succeeds, `/drink-ideas` route present → AC-1 through AC-4, AC-6, AC-7
- [ ] `select public.reserve_ai_generation_quota('<user>'::uuid, current_date, 10)` called 10 times for the same user then an 11th → first 10 return `true`, the 11th returns `false` → AC-4
- [ ] Two concurrent calls to `reserve_ai_generation_quota` for a user with exactly one slot left → exactly one returns `true`, the other `false`, never both `true` → AC-4
- [x] `curl -X POST <function-url>/generate-drink-idea` with no `Authorization` header → 401 → AC-6
- [ ] Call the function for a user with 1 pantry ingredient → 422 → AC-3 (server side backstop)
- [x] Inspect the RLS/grants on `ai_generation_quota` (`select has_table_privilege('anon', 'ai_generation_quota', 'select')` etc.) → all false for `anon` and `authenticated` → AC-4, AC-8
- [ ] Call the function for user A, then for user B → user B's quota row and result are independent of user A's; confirm via `select * from ai_generation_quota` → AC-8

## Acceptance-criteria coverage

- AC-1 (plausible original recipe from pantry only) … covered by the happy path manual step and the typecheck/build commands
- AC-2 (visibly labeled AI generated) … covered by the happy path manual step
- AC-3 (no generate action / 422 backstop on too-small pantry) … covered by the empty-pantry manual step and the 422 command
- AC-4 (10/day quota, atomic, race-free) … covered by the quota-exceeded manual step and the `reserve_ai_generation_quota` concurrency commands
- AC-5 (never persisted) … covered by the refresh manual step
- AC-6 (no session → retryable error) … covered by the no-session manual step and the 401 curl command
- AC-7 (AI failure → retry once, then clear error) … requires a simulated Anthropic timeout/5xx (not exercised here; recommend a mocked failure test in `/test`)
- AC-8 (never sees/affects another user's pantry or quota) … covered by the auth/permission manual step and the two-user command
