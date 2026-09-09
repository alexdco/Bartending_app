# Verify: recipe favoriting · spec 0015 · updated 2026-09-09
_Steps derived from spec 0015 acceptance criteria. `/check verify` runs these; `/test` locks the durable ones._

## UI / manual
- [ ] On the search page, tap the favorite toggle on a `RecipeCard` → icon fills immediately (optimistic) → AC-1, AC-2
- [ ] Tap the same toggle again → icon reverts to unfavorited immediately, second tap is a no op beyond the toggle itself → AC-3
- [ ] Open a recipe's detail page after favoriting it from a card → the detail page's favorite toggle already shows favorited → AC-1
- [ ] Tap the detail page's favorite toggle → icon updates immediately → AC-1, AC-2
- [ ] Navigate to `/favorites` (web) or the Favorites screen via Account (mobile) → the favorited recipe appears as a `RecipeCard` → AC-4
- [ ] With no favorites yet, visit the favorites page/screen → stable empty state with a "browse recipes" action, no error → AC-4
- [ ] From the favorites list, unfavorite a recipe → it disappears from the list without a manual refresh, and the list re-fetches wholesale (no skipped/duplicated row on the next page) → AC-5
- [ ] Sign up from an anonymous session that already has favorites → the same favorites are still present with no extra step → AC-6
- [ ] Favorite a recipe that shares ingredients with other recipes → those other recipes rank higher in "You may also like" than from recently viewed alone, and the favorited recipe itself never appears in its own recommendations → AC-7
- [ ] Toggle a favorite → the recommendations section and the favorites list both update without a manual page refresh → AC-8
- [ ] Simulate a failed favorite write (e.g. offline) → the icon reverts silently with no error banner or toast, and no `recipe_favorited` event fires → AC-2, AC-9

## Commands
- [ ] `pnpm --filter @bartendingapp/shared typecheck` → passes → AC-1 through AC-10 (shared layer)
- [ ] `pnpm --filter web typecheck` && `pnpm --filter mobile typecheck` → both pass → AC-1 through AC-10 (app layer)
- [ ] `pnpm --filter web lint` && `pnpm --filter mobile lint` → both pass
- [ ] `pnpm test` → repo-wide vitest suite passes with no regressions
- [ ] Query `recommend_recipes` for a user with zero favorited recipes, before and after this migration → byte identical output → AC-7 (no regression)
- [ ] As an anonymous client with no session, attempt to `select`/`insert`/`delete` another user's `favorites` row directly → RLS returns 0 rows / rejects the write → AC-10

## Acceptance-criteria coverage
- AC-1 (toggle appears + reflects state) … covered by the card/detail toggle steps
- AC-2 (optimistic update + silent rollback) … covered by the toggle steps + the failed-write step
- AC-3 (idempotent toggle) … covered by the double-tap step
- AC-4 (dedicated favorites list, paginated, empty state) … covered by the favorites page/screen steps
- AC-5 (unfavorite invalidates the whole list query) … covered by the unfavorite-from-list step
- AC-6 (favorites carry over on sign up) … covered by the anonymous-to-signed-in step
- AC-7 (recommendations signal + exclusion + no regression) … covered by the recommendations ranking step + the byte-identical command
- AC-8 (invalidates recommendations, favorites list, favorited-IDs) … covered by the toggle-updates-both-sections step
- AC-9 (`recipe_favorited` event on confirmed success only) … covered by the failed-write step (no event) — pair with a PostHog/console check on a successful toggle for the positive case
- AC-10 (RLS scoping, no cross-user access) … covered by the anonymous/crafted-request command
