# Verify: recipe rating · spec 0024 · updated 2026-09-17
_Steps derived from spec 0024 acceptance criteria. `/check verify` runs these; `/test` locks the durable ones._

## UI / manual
- [ ] Sign in, open any recipe detail page, click a star to submit a rating → the star picker reflects the new rating and the average/count updates → AC-1, AC-4
- [ ] On the same recipe, click a different star value → exactly one rating persists (the new score, not two rows) → AC-2
- [ ] Sign out (or use a fresh guest session), open a recipe detail page → the star picker is disabled/hidden with a sign in prompt, no write is possible from the UI → AC-3
- [ ] Open a recipe with no ratings yet → the page shows a neutral "No ratings yet" state, not "0.0 (0 ratings)" → AC-5
- [ ] As a signed in user, view a recipe you have not rated on the account average vs one you rated → the average/count display is visible to guests too (log out and revisit the same recipe) → AC-4
- [ ] Rate a recipe 5 stars, then view "You may also like" on the recipe detail page → recommendations shift toward recipes sharing that recipe's ingredients → AC-6
- [ ] Rate a recipe 2 stars → recommendations are unchanged from having no rating on that recipe at all → AC-6
- [ ] After rating any recipe (any score) → that recipe never appears in your own "You may also like" list → AC-7

## Commands
- [ ] `select * from public.recipe_rating_summary('<any recipe id>')` on an unrated recipe → `{average: null, count: 0}` → AC-5 (confirmed live 2026-09-17)
- [ ] `insert into public.ratings (user_id, recipe_id, score) values (auth.uid(), '<id>', 0)` as an authenticated client → rejected with a `23514` check constraint violation → AC-9 (constraint confirmed live via `pg_constraint`, 2026-09-17: `CHECK (((score >= 1) AND (score <= 5)))`)
- [ ] An anonymous session's direct `insert`/`update` against `public.ratings` → rejected by RLS (`ratings_insert`/`ratings_update` require `is_anonymous = 'false'`) → AC-3
- [ ] Soft delete a recipe (`deleted_at` set) that has existing ratings, then call `recipe_rating_summary` and `recommend_recipes` for a user who rated it → the rating is excluded from both the average/count and the scoring → AC-8

## Acceptance-criteria coverage
- AC-1 (submit a rating) … covered by UI step 1
- AC-2 (overwrite on change) … covered by UI step 2
- AC-3 (guest blocked, both UI and DB) … covered by UI step 3 and command step 3
- AC-4 (average/count visible to all, own rating pre filled) … covered by UI steps 1, 5
- AC-5 (neutral zero state) … covered by UI step 4 and command step 1
- AC-6 (weighted signal, neutral 1 to 3) … covered by UI steps 6, 7
- AC-7 (rated recipes excluded from own recommendations) … covered by UI step 8
- AC-8 (soft deleted recipe never scored or ratable) … covered by command step 4
- AC-9 (invalid score rejected) … covered by command step 2
