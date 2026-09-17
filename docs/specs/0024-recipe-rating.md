# 0024. Recipe rating

**Date**: 2026-09-16
**Status**: In Progress

## Summary

This spec lets a signed in user rate a recipe from 1 to 5 stars on the recipe detail page. Their own ratings then feed back into the existing "You may also like" recommendation engine (spec 0009), so a user who rates recipes highly sees more recipes with similar ingredients. Guests can see a recipe's average rating but cannot rate.

## Context

Spec 0009 built `recommend_recipes`, a Postgres function that ranks recipes by shared ingredients with a user's pantry (weight 1.0), favorited recipes (weight 0.75, added in a follow up migration), and recently viewed recipes (weight 0.5). All three signals are implicit: none of them asks the user directly whether they liked a recipe. There is currently no explicit taste signal anywhere in the schema.

Adding a 1 to 5 star rating gives users a direct way to say "I liked this" or "I did not," and gives the recommendation engine a stronger, more deliberate signal than the implicit ones it has today. The main forces at play: ratings must be easy to secure (who can rate what, once or many times), they must slot into the existing weighted ingredient overlap formula without a rewrite, and a low rating should not accidentally punish a whole ingredient family the user might still want to see.

## Requirements

**User stories**:
- As a signed in user, I want to rate a recipe from 1 to 5 stars, so I can record what I liked and get better recommendations.
- As a signed in user, I want to change my rating on a recipe I already rated, so a misclick or a change of mind is not permanent.
- As any user (guest or signed in), I want to see a recipe's average rating and how many people rated it, so I get a quick read on quality before trying it.
- As a signed in user, I want recipes similar to the ones I rated highly to show up more in my recommendations, so the app gets smarter about my taste over time.

**Acceptance criteria**:
- **AC-1**: A signed in user can submit a 1 to 5 star rating for a recipe from its detail page.
- **AC-2**: Submitting a new rating for a recipe the user already rated overwrites the old rating (one rating per user per recipe); there is exactly one row per (user, recipe) pair.
- **AC-3**: A guest (anonymous session) sees the star picker disabled or hidden, with a sign in prompt, and cannot submit a rating; an attempted direct write from a guest session is rejected by the database, not just hidden by the UI.
- **AC-4**: The recipe detail page shows the recipe's average rating and total rating count to every viewer (guest or signed in); when the signed in viewer has rated the recipe, their own rating is highlighted or pre filled in the star picker.
- **AC-5**: A recipe with zero ratings shows a neutral "no ratings yet" state instead of an average of zero or a blank space.
- **AC-6**: `recommend_recipes` includes the requesting signed in user's own 4 and 5 star rated recipes as a weighted ingredient source (5 star weight 1.0, 4 star weight 0.6), alongside the existing pantry (1.0), favorites (0.75), and recently viewed (0.5) signals; a 1, 2, or 3 star rating contributes no weight (neither boosts nor suppresses).
- **AC-7**: Any recipe the requesting user has rated (any score) is excluded from their own scored candidates and from the fallback list, the same way favorited and currently viewed recipes are excluded today.
- **AC-8**: A soft deleted recipe (`deleted_at` set) can never be rated, never appears with a rating UI, and its existing ratings are excluded from any average rating or recommendation scoring.
- **AC-9**: A malformed or out of range score (not an integer 1 to 5) is rejected by the database with a clear constraint violation, never silently clamped or stored.

## Options considered

### Option 1: New `ratings` table, blended into `recommend_recipes` as a weighted signal

Add a `public.ratings` table (one row per user per recipe) and extend `recommend_recipes` to pull a signed in user's own 4 and 5 star rated recipes into the same weighted ingredient overlap formula spec 0009 already uses, alongside pantry, favorites, and recently viewed.

**Pros**:
- Reuses the exact scoring shape spec 0009 already established (a weighted ingredient set, unioned across signals, `max` per ingredient); no new scoring model to learn or maintain.
- Small, additive migration: one new table, one `create or replace function`, no changes to existing tables or existing signals.
- Matches the existing RLS pattern for owned rows (`pantry_items`, `favorites`): `user_id references auth.users`, RLS scoped to `auth.uid()`.

**Cons**:
- A fourth weighted signal in one formula is one more thing to keep straight when reasoning about why a recipe was recommended (mitigated by keeping `score` in the RPC output for debugging, as spec 0009 already does).
- Average rating display and scoring both read the same table; a very active rater could make their own average rating query slightly more expensive as their rating count grows (not a concern at current catalog size, per spec 0009's own scale note).

### Option 2: Separate similarity score blended in via a weighted sum

Compute a second, independent score per candidate recipe based on similarity to the user's highly rated recipes (its own ingredient overlap pass), then blend it with the existing `recommend_recipes` score using a tunable blend weight (e.g. `0.7 * ingredient_score + 0.3 * rating_similarity_score`).

**Pros**:
- More tunable long term: the blend weight can be adjusted independently of the ingredient overlap formula's internal weights.
- Keeps the "the user liked this" signal conceptually separate from "the user has this" and "the user recently looked at this," which could make future debugging or A/B testing of the rating signal specifically easier.

**Cons**:
- Adds a second scoring pass and a new blend weight to define and justify now, for a benefit (independent tuning) nothing in the current requirements asks for.
- Diverges from spec 0009's established formula shape, so a future reader has two different scoring patterns to understand instead of one consistent one.

## Decision

**Chosen option**: Option 1: New `ratings` table, blended into `recommend_recipes` as a weighted signal

Add a `public.ratings` table (`user_id`, `recipe_id`, `score`, `created_at`, `updated_at`) and extend `recommend_recipes` so a 5 star rated recipe's ingredients contribute weight 1.0 and a 4 star rated recipe's ingredients contribute weight 0.6; 1 to 3 star ratings contribute nothing. Rated recipes (any score) are excluded from that user's own candidates, matching how favorites are excluded today.

**Implementation skills**: `supabase-postgres-best-practices` (`supabase/agent-skills`, `.agents/skills/supabase-postgres-best-practices/`)

## Rationale

Option 1 wins because it is a straight extension of a formula that already works and that the team already understands: spec 0009's weighted ingredient union pattern was built exactly so a new signal source could be unioned in without restructuring the query, and the favorites follow up migration already proved that pattern out once. Option 2's independent tunability is a real advantage in the abstract, but nothing in this feature's requirements calls for tuning a blend weight yet, and a second scoring pass is a second thing that can silently drift out of sync with the first (two `deleted_at` filters, two exclusion lists, two orderings to keep matching). Following the boring, already proven pattern here keeps the one `recommend_recipes` function as the single place recommendation logic lives, which is the more maintainable choice for a team of this size.

The specific weight choice, 1.0 for 5 stars and 0.6 for 4 stars, places a 5 star rating (an explicit, deliberate "I liked this") on par with owning the ingredient (pantry, 1.0), the strongest existing signal, since a person choosing to rate something 5 stars is at least as strong a signal of future interest as merely having the ingredients on hand. A 4 star rating sits just above recently viewed (0.5) and just below favorites (0.75) at 0.6, reflecting that it is a real but softer endorsement than either a full favorite or a top rating. Ratings of 3 and below contribute zero weight rather than a negative one, per the explicit decision to never let one bad experience with a recipe suppress an entire ingredient family the user might still want to see; this mirrors spec 0009's own conservative stance on not over fitting to sparse signals.

## Feature design

**Data model sketch**:

| Entity | Field | Type | Nullable | Notes |
|---|---|---|---|---|
| `ratings` | `user_id` | uuid | not null | FK `auth.users(id)`, `on delete cascade` |
| `ratings` | `recipe_id` | uuid | not null | FK `public.recipes(id)`, `on delete cascade` (a rating has no meaning once its recipe is gone) |
| `ratings` | `score` | smallint | not null | `check (score between 1 and 5)` |
| `ratings` | `created_at` | timestamptz | not null | `default now()` |
| `ratings` | `updated_at` | timestamptz | not null | `default now()`, bumped by trigger on update |

Primary key: `(user_id, recipe_id)`, matching the `pantry_items`/`favorites` pattern (one row per pair, upsert target for AC-2). Index on `recipe_id` for the average rating read path (matching `favorites_recipe_id_idx`). No new column on `recipes`; average and count are computed on read (Option chosen in the design conversation over a stored, trigger maintained aggregate, since the catalog is still small per spec 0022's own scale note and a computed read avoids trigger drift risk for a first version).

**State transitions**: none beyond upsert (insert or update the one row per user per recipe) and delete on `recipe_id` cascade; no rating specific state machine.

**API surface**:
| Endpoint | Method | Key inputs | Key outputs | Auth | Key errors |
|---|---|---|---|---|---|
| `public.ratings` (direct PostgREST upsert) | POST (upsert, `on conflict (user_id, recipe_id) do update`) | `recipe_id: uuid`, `score: smallint` (1 to 5); `user_id` supplied as `auth.uid()` by the client, never trusted from the request body via RLS `with check` | the upserted row (`user_id`, `recipe_id`, `score`, `updated_at`) | signed in, non anonymous session required | RLS denial for a guest/anonymous session or a mismatched `user_id`; `23514` check constraint violation for an out of range `score` |
| `recipe_rating_summary` (Postgres function via Supabase RPC) | POST (RPC) | `recipe_id: uuid` | `{ average: real \| null, count: int }` | none required (public read, matches `recipes`/`recipe_ingredients` today) | none beyond an unknown `recipe_id` returning `{ average: null, count: 0 }` |
| `recommend_recipes` (existing function, extended) | POST (RPC) | unchanged signature (`recent_recipe_ids`, `current_recipe_id`, `page_limit`, `page_offset`) | unchanged output shape; scoring now also folds in the requesting user's own ratings | session required (unchanged) | unchanged (`28000` for no session) |

**Value sourcing**:
| Action | Value produced / displayed | Source |
|---|---|---|
| Submit a rating | The rating owner | `auth.uid()` inside the RLS policy, never a client supplied `user_id` (same pattern as `pantry_items`/`favorites`) |
| Submit a rating | Whether the session may write at all | `(select auth.jwt() ->> 'is_anonymous') = 'false'`, the same non anonymous gate `bar_members` already uses (spec 0023) |
| Show average + count | The average and count values | `recipe_rating_summary(recipe_id)`, computed from `public.ratings` filtered to that `recipe_id`, joined to `public.recipes` to exclude a `deleted_at` recipe's ratings (AC-8) |
| Show average + count | The "no ratings yet" neutral state | Client renders it when `recipe_rating_summary` returns `count = 0` (AC-5); no new column needed |
| Show the user's own rating in the star picker | The pre filled score | A client side fetch of the signed in user's own row from `public.ratings` for `(auth.uid(), recipe_id)`, allowed by the existing owner scoped RLS select policy |
| Score recommendations | Which of the user's rated recipes count, and at what weight | `recommend_recipes`, reading `public.ratings` filtered to `user_id = auth.uid()` and `score >= 4`, weight `1.0` for `score = 5` and `0.6` for `score = 4` (this spec's Decision) |
| Score recommendations | Excluding rated recipes from that user's own candidates | `recommend_recipes`, a `not exists` clause against `public.ratings` for `auth.uid()`, added alongside the existing `favorites` exclusion |

**Key invariants**:
- Exactly one `ratings` row per `(user_id, recipe_id)` pair (primary key enforced), so AC-2's overwrite semantics hold without an explicit delete step.
- `score` is always an integer 1 to 5, enforced by a check constraint, never validated only in application code (AC-9).
- A rating on a since soft deleted recipe never contributes to `recipe_rating_summary`'s average/count or to `recommend_recipes`'s scoring (AC-8); both queries join through `public.recipes` with `deleted_at is null`.
- Only a non anonymous, signed in session may insert or update a `ratings` row; RLS enforces this at the database layer regardless of what the client UI allows (AC-3).
- `recommend_recipes`'s total order (`score desc, name asc, id asc` when scoring, `name asc, id asc` for the fallback) is unchanged; the new rating signal only changes which candidates score above zero and how they compare, never the tie breaking or pagination shape.

**Security model**:
`ratings` follows the exact RLS shape of `bar_members`'s non anonymous gate combined with `favorites`'s ownership shape: select is open to the row's own `user_id` (`auth.uid() = user_id`) so the client can pre fill the star picker; insert and update both require `auth.uid() = user_id` and `(select auth.jwt() ->> 'is_anonymous') = 'false'`; delete is not exposed (no requirement to delete a rating, only to overwrite it, per AC-2). `recipe_rating_summary` is `security invoker` but requires no session, matching the existing public read policy on `recipes`. `recommend_recipes` keeps its existing `security invoker`, session required behavior; the new rating read inside it is scoped to `auth.uid()` exactly like the existing pantry and favorites reads, so a client can never see or influence another user's ratings through it.

**Configuration required**: none, no new environment variables or credentials.

**Critical test scenarios**:
- Happy path: a signed in user submits a 5 star rating, sees it reflected in the star picker and in the recipe's average, verifies **AC-1**, **AC-4**
- Overwrite: the same user submits a different score for the same recipe; exactly one row exists afterward with the new score, verifies **AC-2**
- Guest blocked: an anonymous session's direct insert attempt against `ratings` is rejected by RLS, verifies **AC-3**
- Cold start: a recipe with no ratings shows the neutral "no ratings yet" state, not `0.0` or a blank, verifies **AC-5**
- Scoring blend: a user with a 5 star rated recipe sees candidates sharing that recipe's ingredients scored higher than a user with no ratings, all else equal, verifies **AC-6**
- Neutral rating: a user with only 1 to 3 star ratings sees no scoring change from those ratings versus having none at all, verifies **AC-6**
- Self exclusion: a recipe the user rated (any score) never appears in their own recommendations, verifies **AC-7**
- Soft delete: a rating on a since soft deleted recipe is excluded from both the average rating and `recommend_recipes` scoring, verifies **AC-8**
- Invalid input: an upsert attempt with `score = 0` or `score = 6` is rejected with a constraint violation, verifies **AC-9**

## Build plan

1. Write the `ratings` table migration (table, primary key, check constraint, `recipe_id` index, `updated_at` trigger reusing the project's existing trigger function if one exists, RLS enabled with the select/insert/update policies above) plus regenerate shared TypeScript types, satisfies **AC-1**, **AC-2**, **AC-3**, **AC-9**
2. Write the `recipe_rating_summary` Postgres function (average and count over non deleted recipes, `security invoker`, no session required) migration, satisfies **AC-4**, **AC-5**, **AC-8**
3. Extend `recommend_recipes` (new `create or replace function` migration) to fold in the requesting user's own 4 and 5 star rated recipes at weights 0.6 and 1.0, and to exclude any recipe the user has rated from their own candidates and fallback list, satisfies **AC-6**, **AC-7**, **AC-8**
4. Add a shared `ratings.ts` module in `packages/shared` (pure helpers: score validation, the upsert payload shape) plus a per app `useRecipeRating(recipeId)` hook wrapping the upsert and the summary fetch, satisfies **AC-1**, **AC-2**, **AC-4**
5. Build the star rating UI on the recipe detail page (web and mobile): the average + count display with the neutral zero state, and the interactive picker gated on session (disabled/hidden with a sign in prompt for a guest, pre filled with the user's own rating when signed in and already rated), satisfies **AC-1**, **AC-3**, **AC-4**, **AC-5**
6. Wire the rating mutation to invalidate the existing recommendations query key (spec 0009's pattern, alongside the pantry and favorites mutations), so a new rating updates "You may also like" without a manual refresh
7. Cross platform parity check: confirm both apps share the same query keys, validation, and gating behavior for the rating UI, satisfies **AC-1** through **AC-9**

## Consequences

**Positive**:
- Gives the recommendation engine a genuine explicit taste signal for the first time, on top of three implicit ones, without inventing a new scoring model.
- Reuses three already proven patterns end to end (the `favorites`/`pantry_items` owned row shape, the `bar_members` non anonymous RLS gate, and spec 0009's weighted ingredient union), so the team is not learning anything structurally new.
- The average rating display is useful on its own, independent of the recommendation change, and costs nothing extra to add now that the table exists.

**Negative / tradeoffs**:
- `recommend_recipes` now unions four weighted signal sources instead of three; reasoning about why a specific recipe scored the way it did gets slightly harder (mitigated by keeping `score` in the RPC output, as today).
- Rated recipes (any score, not just low ones) are excluded from the user's own recommendations, which means a 5 star recipe cannot be "recommended back" as a reminder; acceptable for now since the goal is discovery of new recipes, not resurfacing known favorites.
- Ratings of 1 to 3 stars are collected but contribute nothing to scoring yet; if usage shows most ratings cluster at 3 and below, revisit whether a neutral floor still makes sense in Follow-up.

**Neutral**:
- No changes to `recipes`, `pantry_items`, or `favorites`; this is purely additive (`ratings` table) plus one function replace (`recommend_recipes`), which keeps blast radius small and fully revertable by rolling back the migrations.

## Follow-up

- [ ] If rating volume grows large enough that `recipe_rating_summary`'s on read average/count becomes measurably slow, revisit the deferred stored aggregate (columns on `recipes`, maintained by trigger), the way spec 0009 deferred a real popularity signal until usage existed.
- [ ] Once a recipe's own average rating is a meaningful signal (enough ratings to trust it), revisit whether it should factor into `recommend_recipes` globally (a tie breaker or quality floor), not just as each user's personal signal; this spec deliberately scoped that out, mirroring spec 0009's own deferred popularity follow up.
- [ ] Consider whether a 3 star rating should eventually contribute a small positive weight (weaker than 4 stars) once real usage data shows how ratings actually distribute; this spec treats 1 to 3 uniformly as neutral for simplicity at launch.
