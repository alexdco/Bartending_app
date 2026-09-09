# 0015. Recipe favoriting

**Date**: 2026-09-09
**Status**: In Progress

## Summary

This decision adds a favorite toggle to recipe cards and the recipe detail page, a dedicated favorites list, and wires favoriting into the existing recommendations and analytics features. The database table this builds on already exists (spec 0002); this spec is entirely new application code (fetch functions, hooks, UI) on top of it. It closes two gaps other specs already flagged: recommendations dropped favorites as a signal because favoriting did not exist, and analytics deferred a favorited event for the same reason.

## Context

The `favorites` table (spec 0002) has existed since the data model was designed, with row level security (a Postgres feature restricting which rows a query can see or change) already scoping it to the requesting user, but no feature has ever read or written it. Two later specs surfaced this as a real gap rather than a hypothetical one: spec 0009 (recipe recommendations) dropped favorites from its scoring signal set specifically because favoriting did not exist yet, and spec 0013 (basic product analytics) deferred a `recipe_favorited` event for the same reason. Both left an explicit Follow-up item pointing back here.

The consequence of not building this is that two shipped features (recommendations, analytics) stay permanently short of a signal the product was always meant to have, and users have no way to keep a personal list of drinks they like across sessions, beyond what their pantry or recent views happen to capture.

Every screen this touches already assumes a live session (anonymous or signed in) per spec 0005/0008's bootstrap, so this feature adds no new session handling of its own; it reuses the pantry mutation pattern (optimistic update, rollback on error, query invalidation) already proven in production.

## Requirements

**User stories**:
- As a home bartender (guest or signed in), I want to favorite a recipe from its card or detail page, so I can find it again later without searching.
- As a home bartender, I want to see a list of everything I have favorited, so I can browse my own saved drinks.
- As a home bartender who signs up after using the app as a guest, I want my favorites to carry over to my account, so I do not lose what I already saved.

**Acceptance criteria** (the contract, each criterion is independently checkable):
- **AC-1**: A favorite toggle appears on every `RecipeCard` (search results, drink ideas, popular, recommendations) and on the recipe detail page, reflecting whether the current user has already favorited that recipe.
- **AC-2**: Tapping the toggle favorites or unfavorites the recipe for the current session's user (anonymous or signed in), updates the icon immediately (optimistic), and reverts silently if the write fails, with no error banner or toast.
- **AC-3**: Favoriting or unfavoriting the same recipe twice in a row is a no op the second time (already favorited stays favorited; already unfavorited stays unfavorited), matching the existing `favorites` table's unique constraint and no op delete behavior (spec 0002).
- **AC-4**: A dedicated favorites list page (web) / screen (mobile) shows the current user's favorited recipes as `RecipeCard`s, paginated with the same `RECIPE_SEARCH_PAGE_SIZE` constant used by search, with a stable empty state when there are none yet. Before the favorited-IDs query resolves, every card's toggle renders in its unfavorited (unstyled) state, the same as pantry's add control has no distinct loading state today; it corrects itself once the query resolves.
- **AC-5**: Unfavoriting a recipe from the favorites list invalidates and refetches the whole favorites list query (not a client side page splice), so the recipe disappears without the offset based pagination skipping or duplicating a row on the next page.
- **AC-6**: An anonymous user's favorites carry over automatically when they sign in or sign up, with no separate migration step (the underlying `auth.uid()` is unchanged across that transition, per spec 0005/0008).
- **AC-7**: `recommend_recipes` (spec 0009) adds a third weighted ingredient signal from the requesting user's favorited recipes (weight `0.75`, between pantry's `1.0` and recently viewed's `0.5`), and excludes a recipe the user has already favorited from their own recommendations. A user with an empty favorited set gets byte identical results to before this migration (the new term contributes zero, never null, to the score).
- **AC-8**: Adding or removing a favorite invalidates the recommendations query (query key prefix `["recommendations"]`, the same prefix the pantry mutation hooks already invalidate) and the favorites list query (key `["favorites", pageOffset]`) and the favorited-IDs query (key `["favorites", "ids"]`), so all three update without a manual refresh.
- **AC-9**: A `recipe_favorited` analytics event fires only on a confirmed successful toggle (favorite and unfavorite), never on a failed write that rolled back, with `recipe_id` and an `is_favorited` boolean, following the existing event builder pattern (spec 0013).
- **AC-10**: A signed out (no session) or another user's favorite can never be read, written, or removed by a client; every favorites read/write is scoped to `auth.uid()` (already enforced by spec 0002's row level security, unchanged by this feature).

## Options considered

### Option 1: Bulk favorited-IDs fetch, cross-referenced client side; extend `recommend_recipes`

Add a shared `favorites.ts` (fetch the current user's favorited recipe IDs in one call, add, remove), a `useFavoriteRecipeIds()` query hook that each list screen fetches once and cross-references per card, and a `useFavoriteRecipes()` paginated hook for the dedicated list page. Extend `fetchRecipeDetail` to include the single recipe's favorited state in its existing query. Migrate `recommend_recipes` to add the favorites weight and exclusion (AC-7).

**Pros**:
- No change to `search_recipes`, `match_recipes_to_pantry`, or `popular_recipes_by_region`; a user's favorited set is small and naturally cacheable, so one bulk fetch per list is cheap and keeps those four functions focused on their own concern.
- Reuses the exact mutation and hook pattern already proven for pantry (optimistic update, rollback, invalidation), so there is no new pattern to learn or maintain.
- Closes spec 0009's Follow-up completely in one pass instead of leaving it open again.

**Cons**:
- A card needs two pieces of client state (the list's own rows, plus the separate favorited-IDs set) instead of one flat row shape; a missed invalidation between the two could show a stale favorite icon for a moment.
- `recommend_recipes` grows a third weighted signal and a new exclusion clause, adding to the SQL surface spec 0009 already flagged as "more to keep consistent" if the scoring approach changes later.

### Option 2: Add `is_favorited` to every list-returning function

Modify `search_recipes`, `match_recipes_to_pantry`, `recommend_recipes`, and `popular_recipes_by_region` to each `LEFT JOIN favorites` and return an `is_favorited` boolean per row, so every card gets its state from the same query that fetched the row.

**Pros**:
- One flat shape per row; no second query or client side cross-referencing to keep in sync.

**Cons**:
- Four Postgres functions touched instead of one, each needing a new join and a regenerated return type, for data (a user's own favorited set) that is naturally small and does not need to be joined per row across four different query shapes.
- Couples every future list-returning function to the favorites table forever; a fifth list feature would need the same join repeated again.

**This option is not chosen.** The favorited set is a small, personal, frequently-reused piece of state; fetching it once per screen and cross-referencing client side (Option 1) is simpler and touches far less SQL surface for the same result.

## Decision

**Chosen option**: Option 1: Bulk favorited-IDs fetch, cross-referenced client side; extend `recommend_recipes`.

**Implementation skills**: `supabase-postgres-best-practices` (`supabase/agent-skills`, `.agents/skills/supabase-postgres-best-practices/`)

## Rationale

The deciding force is the shape of the favorited set itself: it belongs to one user, stays small in practice, and is reused across every list screen in the app (search, drink ideas, popular, recommendations, and the new favorites list). Fetching it once per screen and cross-referencing client side (Option 1) matches how the app already treats pantry, another small per-user set consulted across multiple screens without being joined into every query that touches a recipe.

Extending `recommend_recipes` (AC-7) is not a new decision, it directly executes spec 0009's own Follow-up, which already named the shape of the change (a scoring weight and an exclusion) and left only the exact weight open, now set to `0.75`, between pantry's `1.0` (the strongest signal: ingredients the user actually owns) and recently viewed's `0.5` (the weakest: passive browsing). Favoriting sits between the two: a deliberate signal of taste, stronger than a passive view, weaker than "I have this in my kitchen right now."

## Feature design

**Data model sketch**:

No new tables or columns. Reuses `favorites` exactly as spec 0002 defined it:

| Entity | Primary key | Fields | Foreign keys | Cardinality |
|---|---|---|---|---|
| `favorites` (existing) | (`user_id`, `recipe_id`), unique | `created_at` (timestamptz) | `user_id` → `auth.users` (cascade), `recipe_id` → `recipes` (restrict) | N:M `auth.users` ↔ `recipes` |

Row level security (already in force, spec 0002): `SELECT`/`DELETE` via `USING ((select auth.uid()) = user_id)`, `INSERT` via `WITH CHECK ((select auth.uid()) = user_id)`, no `UPDATE` policy, no public read. This feature adds no migration for the table itself; only `recommend_recipes` gets a migration (see Build plan).

**State transitions**: none; a favorite is a plain owned row (present or absent), no lifecycle states.

**API surface**:
| Endpoint | Method | Key inputs | Key outputs | Auth | Key errors |
|---|---|---|---|---|---|
| `fetchFavoriteRecipeIds` (Supabase client read on `favorites`) | GET (select) | none (session scoped) | `recipe_id: uuid[]` for the current user | session required | RLS returns empty on no session, not an error |
| `addFavorite` (Supabase client upsert on `favorites`) | POST (upsert, `ON CONFLICT (user_id, recipe_id) DO NOTHING`) | `recipeId: uuid` (required) | none (void on success) | session required | no op if already favorited (AC-3) |
| `removeFavorite` (Supabase client delete on `favorites`) | POST (delete) | `recipeId: uuid` (required) | none (void on success) | session required | no op if not favorited (AC-3), scoped by RLS so it can only ever affect the caller's own row |
| `fetchFavoriteRecipes` (Supabase client select, `favorites` joined to `recipes`) | GET (select) | `pageLimit` (default `RECIPE_SEARCH_PAGE_SIZE`), `pageOffset` (default `0`) | `{ id, name, imageUrl, alcoholicStatus }[]`, same shape `RecipeCard` already accepts (matching `RecipeSearchResult`), ordered `created_at desc` (most recently favorited first) | session required | empty array, not an error, when there are none yet |
| `fetchRecipeDetail` (existing, extended) | GET (select) | `id: uuid` (required, unchanged) | adds `isFavorited: boolean` to the existing `RecipeDetail` shape | session required | unchanged from spec 0004 |
| `recommend_recipes` (existing Postgres function, migrated) | POST (RPC, unchanged signature) | unchanged (`recent_recipe_ids`, `current_recipe_id`, `page_limit`, `page_offset`) | unchanged shape; scoring internally also weighs the caller's favorited recipes' ingredients at `0.75` and excludes any recipe the caller has favorited | session required (unchanged) | unchanged (`28000` on no session) |

**Value sourcing**:
| Action | Value produced / displayed | Source |
|---|---|---|
| Render a favorite toggle on any `RecipeCard` | Whether this recipe is currently favorited | `fetchFavoriteRecipeIds`'s result set, fetched once per screen via `useFavoriteRecipeIds()`, checked for membership by `recipe.id` |
| Render the favorite toggle on the detail page | Whether this recipe is currently favorited | `RecipeDetail.isFavorited`, added to `fetchRecipeDetail`'s existing query |
| Toggle a favorite | The user this write applies to | The requesting client's `auth.uid()` (anonymous or signed in session), same as `addPantryItem`/`removePantryItem`; never a client supplied user id |
| Favorites list page | The recipes shown, and their order | `fetchFavoriteRecipes`, ordered `created_at desc`, paginated with `RECIPE_SEARCH_PAGE_SIZE`, query key `["favorites", pageOffset]` |
| `recipe_favorited` analytics event | `recipe_id`, `is_favorited` | `recipe_id` from the toggled card/detail page's own recipe; `is_favorited` from the direction of the toggle (`true` on favorite, `false` on unfavorite); fired only from the mutation's `onSuccess`, never from `onError` or a rolled back optimistic update |
| Recommendations invalidation on toggle | Which query keys are invalidated | `["recommendations"]` prefix (unchanged from spec 0009), `["favorites", "ids"]`, and `["favorites", pageOffset]` (all pages, via the query key prefix) |
| `recommend_recipes` scoring | The caller's favorited recipe IDs (for the new weighted signal) | `favorites` filtered by `auth.uid()`/session inside the function body, same pattern as the existing `pantry_items` read |

**Key invariants**:
- `favorites(user_id, recipe_id)` stays unique (unchanged from spec 0002); the insert path uses `ON CONFLICT DO NOTHING` so a duplicate favorite is a no op (AC-3); a delete affecting 0 rows is also a no op, not an error.
- Every favorites read or write is scoped to `auth.uid()` via the existing row level security; no client parameter can address another user's favorites (AC-10, unchanged from spec 0002).
- **`recommend_recipes`'s scoring formula, spelled out exactly** (spec 0009's existing formula, extended): for each candidate recipe, build one weighted ingredient set from the caller's pantry (`pantry_items`, weight `1.0` per ingredient), their favorited recipes' ingredients (`favorites` joined to `recipe_ingredients`, weight `0.75` per ingredient, new in this spec), and their recently viewed recipes' ingredients (`recent_recipe_ids` param joined to `recipe_ingredients`, weight `0.5` per ingredient, existing). Where the same ingredient appears in more than one source, its contributing weight to the set is the **maximum** of the weights it would get from each source individually (not summed), so a pantry ingredient that is also in a favorited recipe still contributes `1.0`, never `1.75`. `score = sum(weight of the candidate's ingredients present in that combined set) / count(the candidate's recipe_ingredients rows)`, unchanged from spec 0009 otherwise. The favorited-recipes join uses `left join`/`coalesce` to an empty set, never an inner join, so a caller with zero favorited recipes gets exactly spec 0009's original two-signal score (AC-7's byte identical requirement).
- The favorites exclusion (new) removes any recipe present in the caller's own `favorites` from the candidate pool entirely, the same way `current_recipe_id` is already excluded; it is a `WHERE NOT IN`/`WHERE NOT EXISTS` filter, applied before scoring, not a weight of zero.
- The favorited-IDs set (`fetchFavoriteRecipeIds`, key `["favorites", "ids"]`) and the favorites list (`fetchFavoriteRecipes`, key `["favorites", pageOffset]`) are two different queries over the same table; a toggle invalidates both keys, plus the `["recommendations"]` prefix, so no screen shows a stale state after a mutation settles. The favorites list query is invalidated wholesale on any favorite/unfavorite (never spliced client side), so offset pagination never skips or duplicates a row across pages when the underlying set changes between fetches.

**Security model**:
No change to the security model spec 0002 already established for `favorites`: row level security enabled, `SELECT`/`INSERT`/`DELETE` scoped to `auth.uid()`, no `UPDATE` policy, no public read. This feature only adds application code (fetch functions, hooks, UI) on top of policies that already exist; `recommend_recipes`'s migration reads `favorites` the same way it already reads `pantry_items`, inside a `security invoker` function scoped to the calling session, never as a client supplied parameter.

**Configuration required**: none, no new environment variables or credentials.

**Critical test scenarios**:
- Happy path: a user favorites a recipe from its card, the icon updates immediately, the recipe now appears in the favorites list, and unfavoriting it from the list removes it immediately, verifies **AC-1**, **AC-2**, **AC-4**, **AC-5**
- Idempotency: favoriting an already favorited recipe, or unfavoriting an already unfavorited one, changes nothing and errors nothing, verifies **AC-3**
- Cross session: an anonymous user favorites two recipes, then signs up; both favorites are still present on their new signed in session with no extra step, verifies **AC-6**
- Reactivity: favoriting a recipe invalidates the recommendations query and the favorites list query without a manual refresh, verifies **AC-8**
- Recommendations signal: a user who has favorited a recipe sharing ingredients with unfavorited recipes sees those recipes scored higher than they would be from recently viewed alone, and never sees the favorited recipe itself in their own recommendations, verifies **AC-7**
- No regression: a user with zero favorited recipes gets byte identical `recommend_recipes` output before and after this migration, verifies **AC-7**
- Analytics: toggling a favorite on and then off, both succeeding, fires two `recipe_favorited` events with the same `recipe_id` and opposite `is_favorited` values; a toggle that fails and rolls back fires no event, verifies **AC-9**
- Failure case: the favorite mutation fails (network/server error); the icon reverts to its prior state with no error banner and no analytics event, verifies **AC-2**, **AC-9**
- Auth/permission: a request with no valid session cannot read, add, or remove any `favorites` row; a crafted delete targeting another user's `(user_id, recipe_id)` pair affects 0 rows under RLS, verifies **AC-10**

## Build plan

1. [x] Write the `recommend_recipes` migration adding the favorited-recipes weighted signal (`0.75`, `left join`/`coalesce` to preserve the no-favorites case) and the already-favorited exclusion, per the exact formula in Key invariants, regenerate shared TypeScript types, satisfies **AC-7**. — `supabase/migrations/20260909053700_recommend_recipes_favorites_signal.sql`, applied live; signature unchanged so no type regeneration was required.
2. [x] Add a shared `favorites.ts` in `packages/shared` (`fetchFavoriteRecipeIds`, `addFavorite`, `removeFavorite`, `fetchFavoriteRecipes`), plus an `isFavorited` field added to `fetchRecipeDetail`'s existing query and `RecipeDetail` type, satisfies **AC-1**, **AC-3**, **AC-4**, **AC-6**, **AC-10**.
3. [x] Add per app `useFavoriteRecipeIds()` and `useFavoriteRecipes()` query hooks, and `useToggleFavorite()` mutation hooks (optimistic update, silent rollback on error, invalidating the favorited-IDs query, the favorites list query, and the recommendations query key), following the existing `use-pantry-mutations.ts` pattern, satisfies **AC-2**, **AC-3**, **AC-5**, **AC-8**.
4. [x] Add a favorite toggle control to `RecipeCard` (both apps) and to the recipe detail page/screen header, wired to the new hooks, satisfies **AC-1**, **AC-2**.
5. [x] Add the `recipe_favorited` event builder and type to `packages/shared/src/analytics.ts` (mirroring `buildPantryItemAddedEvent`), and fire it from the toggle mutation's success path on both apps, satisfies **AC-9**.
6. [x] Build the dedicated favorites list page (web: `/favorites`, mobile: a Favorites screen reachable from account or tabs), reusing `RecipeCard`, paginated the same as drink ideas, with an empty state and the optimistic removal from step 3, satisfies **AC-4**, **AC-5**.
7. [x] Cross platform parity check: confirm both apps share the same query key shapes, page size constant, and the same `recommend_recipes` weight/exclusion behavior, satisfies **AC-1** through **AC-10**.

This ships in one pass (no thin-thread slicing needed): the underlying table already exists, so there is no schema risk to de-risk incrementally, and every consuming surface (card, detail, list, recommendations, analytics) is small enough to build and verify together, consistent with a normal feature under the project's Tracer Bullet approach.

## Consequences

**Positive**:
- Closes two real, previously flagged gaps (spec 0009's dropped signal, spec 0013's deferred event) in one pass, rather than leaving both open indefinitely.
- No new migration for the favorites table itself; all new surface is application code on top of an already-hardened security model.
- Reuses the exact optimistic mutation pattern already proven by pantry, so the team is not learning a new approach.

**Negative / tradeoffs**:
- `recommend_recipes` grows a third weighted signal and a new exclusion clause; each future signal added to this function increases the cost of reasoning about its scoring formula as a whole (a tradeoff spec 0009 already flagged and this spec adds one more instance of).
- A card's favorited state now depends on two separate client queries (the list's own rows plus the favorited-IDs set) instead of one flat row; a missed invalidation on a rare code path could show a stale icon for a moment until the next natural refetch.
- Silent rollback on a failed toggle (no error banner) means a user whose favorite silently failed to save has no feedback beyond the icon reverting; acceptable because pantry already behaves this way with no reported confusion, but worth revisiting if it becomes a real complaint.
- Toggling the same recipe from two devices at nearly the same moment is not specially handled: each device optimistically shows its own last action, and the database ends in whichever state the last write actually applied (last writer wins), so a device that toggled first may briefly show a state the server has already overwritten, until its next invalidation or refetch corrects it. Accepted for the same reason pantry accepts it: favoriting is a low stakes, single user action with no correctness requirement stronger than eventual consistency.

**Neutral**:
- The favorites list page/screen is a new route on both platforms, following the same pattern as the drink-ideas and popular pages/screens.
- `recipe_favorited` becomes the fourth analytics event, following the existing builder pattern exactly.

## Follow-up

- [ ] Once the favorites list exists, consider whether the account/profile page (spec 0008) should link to it directly, so a signed in user can reach their favorites from their account view.
- [ ] Revisit `recommend_recipes`'s three-signal scoring formula (pantry, favorited, recently viewed) if a fourth signal is ever proposed; the function's growing weight table was already flagged as increasing surface in spec 0009.
