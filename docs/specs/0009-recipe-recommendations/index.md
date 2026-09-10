# 0009. Recipe recommendations

**Date**: 2026-09-07
**Status**: In Progress

## Summary

This spec adds a "You may also like" section on the recipe detail page that suggests recipes based on what a user's pantry and recently viewed recipes have in common with the rest of the catalog. It reuses the existing pantry matching pattern (spec 0006) as a new database function, with no new tables. A user with no activity yet sees a stable default list instead of an empty section.

## Requirements

**User stories**:
- As a user (guest or signed in), I want to see recipes similar to what I already have or have recently viewed, so I can discover new drinks without searching.
- As a new user with no activity yet, I want to see a sensible list of recipes anyway, so the app doesn't feel broken or empty on first use.

**Acceptance criteria** (the contract, each criterion is independently checkable):
- **AC-1**: A "You may also like" section on the recipe detail page shows a list of recipes ranked by shared ingredients with the requesting user's pantry contents and recently viewed recipes (recent views passed in from local device storage), for both guests (anonymous session) and signed in users.
- **AC-2**: When the scored candidate list for the current page is empty (including the case where pantry and recently viewed recipes are both empty), the section falls back to a stable default list (recipes ordered by name) instead of showing nothing.
- **AC-3**: Either pantry or recently viewed recipes being non-empty is enough to produce scored (non fallback) results; the fallback in AC-2 is not gated on both being non-empty.
- **AC-4**: The list shows a first page of results with a "See more" link/action to a full view, both using the same underlying query and page size.
- **AC-5**: Adding or removing a pantry item invalidates the recommendations query so the section updates without a manual refresh.
- **AC-6**: Recently viewed recipes are tracked locally on each device (not synced across devices), capped at the last 20 viewed recipes.
- **AC-7**: A genuine fetch failure (network or server error) shows a retryable error state, distinct from the empty/fallback case in AC-2.
- **AC-8**: A signed out (anonymous) user only ever sees recommendations scored from their own session's pantry; no client can request another user's pantry data. A malformed, oversized, or stale `recent_recipe_ids` list (containing duplicate, unknown, or soft deleted recipe IDs) never errors the request; such IDs are silently ignored.
- **AC-9**: A soft deleted recipe (`deleted_at` set) never appears in scored results, the fallback list, or as a resolved entry from `recent_recipe_ids`.

## Decision

**Chosen option**: Option 1: New Postgres function scoring by ingredient overlap

Add a `recommend_recipes` Postgres function that scores candidate recipes by shared ingredients with the requesting user's pantry and recently viewed recipes, with a stable default ordering fallback when scoring produces no candidates.

**Implementation skills**: `supabase-postgres-best-practices` (`supabase/agent-skills`, `.agents/skills/supabase-postgres-best-practices/`)

## Feature design

**Data model sketch**:

No new tables. This feature is a read only function over existing entities from spec 0002:
- `pantry_items` (existing, `user_id`, `ingredient_id`) — read via `auth.uid()`/session, same as `match_recipes_to_pantry`
- `recipe_ingredients` (existing, join table) — the basis for ingredient overlap scoring
- `recipes` (existing, `deleted_at` filtered) — candidate pool and the fallback ordering
- Recently viewed recipe IDs: no new table; kept in local device storage (AsyncStorage on mobile, localStorage on web), a capped rolling list of the last 20 recipe IDs, written whenever a recipe detail page is opened. Passed to the function as a parameter, since it has no server representation.

**State transitions**: none, this is a read only feature.

**Scoring formula** (resolves the previously undefined "shared ingredients" ranking):
- Build one weighted ingredient set per request: each pantry ingredient contributes weight `1.0`; each ingredient of a recently viewed recipe contributes weight `0.5` (a weaker signal than "I have this," matching the stronger to weaker ordering the scope itself implies: pantry, then activity).
- For each candidate recipe (excluding the recipe the detail page is currently showing, and excluding any recipe with `deleted_at is not null`), score = `sum(weight of its ingredients present in the weighted set) / count(its recipe_ingredients rows)`, i.e. weighted overlap normalized by recipe size so a large recipe does not win purely by having more ingredients.
- Only recipes with score > 0 are scored candidates; a page with zero scored candidates triggers the AC-2 fallback for that request.
- Order: `score desc, name asc, id asc` (a total order, required for correct offset pagination, matching `match_recipes_to_pantry`'s pattern).
- Fallback order (AC-2): `name asc, id asc` over `deleted_at is null` — the same stable, no-real-popometric-yet ordering spec 0002 already uses for region browsing. Favorites count is not used for this ordering: a `security invoker` function only sees the calling session's own `favorites` rows under RLS, so a count based on it would not reflect real popularity across users even once favoriting ships.
- The fallback decision is made once per request based on the first page's scored candidate count (`page_offset = 0`); it does not switch mid scroll if the caller loads a second page.

**API surface**:
| Endpoint | Method | Key inputs | Key outputs | Auth | Key errors |
|---|---|---|---|---|---|
| `recommend_recipes` (Postgres function via Supabase RPC) | POST (RPC) | `recent_recipe_ids: uuid[]` (required, may be empty; deduplicated, first 20 kept, unknown/soft deleted IDs ignored), `current_recipe_id: uuid` (opt, excludes the recipe currently being viewed), `page_limit: int` (default 20, clamped 1 to 50), `page_offset: int` (default 0, clamped >= 0) | `{ id: uuid, name: text, image_url: text, alcoholic_status: text, score: real }[]`, paginated the same way as `match_recipes_to_pantry`/`search_recipes` (a short page signals the end; no separate cursor) | session required (anonymous or signed in) | `28000` (no/invalid session, same as `match_recipes_to_pantry`) |

`score` is returned for ordering/debugging only; it is not displayed in the UI.

**Value sourcing**:
| Action | Value produced / displayed | Source |
|---|---|---|
| Score candidate recipes | Pantry ingredient IDs for the requesting user | `pantry_items` filtered by `auth.uid()`/session, server side (same as `match_recipes_to_pantry`) |
| Score candidate recipes | Recently viewed recipe IDs and their ingredient weight | `recent_recipe_ids` function parameter, sourced from local device storage on the calling client; server side `coalesce(recent_recipe_ids, '{}'::uuid[])`, deduplicated, first 20 kept, joined against `recipes` with `deleted_at is null` (unknown/deleted IDs simply match nothing, per AC-8/AC-9) |
| Fallback ordering | A stable default order when scoring is empty | `recipes.name asc, id asc` filtered to `deleted_at is null`, no new column (see Scoring formula) |
| Pagination | Page boundaries | `page_limit`/`page_offset` params, same pattern as `match_recipes_to_pantry`/`search_recipes`; a returned page shorter than `page_limit` signals the last page |

**Key invariants**:
- Scoring and the fallback both exclude `deleted_at is not null` recipes and the `current_recipe_id` being viewed (AC-9).
- The result set always has a total order (`score desc, name asc, id asc` when scoring; `name asc, id asc` for the fallback), so offset pagination never duplicates or skips a row across pages.
- `recent_recipe_ids` is never trusted as is: it is coalesced, deduplicated, capped at 20 entries server side, and any ID that does not resolve to a non deleted `recipes` row is silently ignored, never an error (AC-8).
- The fallback (AC-2) is decided once per request from the first page's scored candidate count; it never switches mode between pages of the same underlying query.

**Security model**:
Session required, same as `match_recipes_to_pantry`: an anonymous or signed in session is required to call the function (`28000` error otherwise). Pantry is read strictly through `auth.uid()`/session inside the function body, never accepted as a client supplied parameter, so a client cannot request another user's pantry. `recipes` and `recipe_ingredients` stay publicly readable as they already are (spec 0002). `recent_recipe_ids` is the one client controlled input; it is treated as untrusted (see Key invariants) rather than as an identity bearing parameter. No new write surface; this feature is read only, so no new RLS policy beyond what spec 0002 already grants for reads.

**Configuration required**: none, no new environment variables or credentials.

**Critical test scenarios**:
- Happy path: a user with pantry items sees a ranked list of recipes sharing ingredients with those items, in `score desc, name asc, id asc` order, verifies **AC-1**
- Cold start: a brand new guest with an empty pantry and no recently viewed recipes sees the stable fallback list (`name asc`), not an empty section, verifies **AC-2**
- Partial signal: a user with recently viewed recipes but an empty pantry still gets scored (non fallback) results, verifies **AC-3**
- Empty array input: a request with `recent_recipe_ids = '{}'` and a non empty pantry still scores correctly off the pantry alone (the empty array does not null out the whole scoring predicate), verifies **AC-1**, **AC-3**
- Failure case: the RPC call fails (network/server error) and the UI shows a retryable error state distinct from the fallback rendering, verifies **AC-7**
- Auth/permission: a request with no valid session receives the `28000` error; a request with a `recent_recipe_ids` array containing duplicate, unknown, or soft deleted recipe IDs succeeds and simply ignores those entries, verifies **AC-8**
- Soft delete: a soft deleted recipe never appears in scored results, the fallback list, or as a resolved `recent_recipe_ids` entry, verifies **AC-9**
- Reactivity: adding a pantry item invalidates the recommendations query and the section updates, verifies **AC-5**

## Build plan

1. [x] Write the `recommend_recipes` Postgres migration (function body: read pantry via session, accept `recent_recipe_ids`/`current_recipe_id`/`page_limit`/`page_offset` params, coalesce and cap `recent_recipe_ids` server side, score by the weighted ingredient overlap formula above, apply the `deleted_at`/current recipe exclusions, fall back to the stable name ordering when the first page's scored count is zero), plus regenerate shared TypeScript types, satisfies **AC-1**, **AC-2**, **AC-3**, **AC-8**, **AC-9** — `supabase/migrations/20260907210000_recommend_recipes_function.sql`, applied live to `BartendingAppWeb` (ctuzjhhpnkkhooneporu); types regenerated in `packages/shared/src/database.types.ts`
2. [x] Add the local recently viewed tracking: a pure, testable helper in `packages/shared` (`appendRecentlyViewed(list, id, cap)`, mirroring `pantryMatching.ts`'s style, framework free) plus a thin storage adapter per app (AsyncStorage on mobile, localStorage on web), wired into the recipe detail view on both apps, satisfies **AC-6** — `packages/shared/src/recentlyViewed.ts`, `apps/web/src/recipes/recently-viewed-storage.ts`, `apps/mobile/src/recipes/recently-viewed-storage.ts`
3. [x] Add a shared `recommendations.ts` fetch function in `packages/shared` (fixed constant `RECOMMENDATIONS_PAGE_SIZE = 20`; `RECENTLY_VIEWED_CAP = 20` lives alongside the helper in `recentlyViewed.ts`) plus a per app `useRecipeRecommendations(currentRecipeId, pageOffset)` query hook, keyed on `['recommendations', currentRecipeId, recentRecipeIds, pageOffset]`, satisfies **AC-1**, **AC-4**, **AC-7** — `packages/shared/src/recommendations.ts`, `apps/web/src/recipe-recommendations/use-recipe-recommendations.ts`, `apps/mobile/src/recipe-recommendations/use-recipe-recommendations.ts`
4. [x] Extend the existing pantry mutation hooks (spec 0005/0006's pattern) to also invalidate the recommendations query key, satisfies **AC-5** — both apps' `use-pantry-mutations.ts`
5. [x] Build the "You may also like" section on the recipe detail page (web and mobile), reusing the existing `RecipeCard` component, a first page plus a "See more" action to a dedicated full page/screen, and a retryable error state for genuine failures, satisfies **AC-1**, **AC-4**, **AC-7** — web: `apps/web/src/recipe-recommendations/{recommendations-section.tsx,more-like-this-client.tsx}` + `apps/web/src/app/recipes/[id]/more-like-this/page.tsx`; mobile: `apps/mobile/src/recipe-recommendations/recommendations-section.tsx` + `apps/mobile/src/app/recipe/[id]/more-like-this.tsx` (detail screen relocated `[id].tsx` → `[id]/index.tsx` to coexist with the new nested route)
6. [x] Cross platform parity check: confirm both apps share the same query key shape, page size, and recently viewed cap constants, satisfies **AC-1** through **AC-9** — confirmed identical query key shape and byte identical pantry mutation invalidation

## Consequences

**Positive**:
- Reuses proven patterns end to end (session scoped RLS reads, query invalidation, the offset pagination shape already used by `match_recipes_to_pantry`/`search_recipes`), so the team is not learning a new approach for this slice.
- Works identically for guests and signed in users with no special casing, since pantry is already session scoped and recent views are local either way.
- Narrowing to pantry plus recent views (dropping favorites for now) keeps this slice buildable against what exists today, rather than silently depending on an unshipped feature.

**Negative / tradeoffs**:
- Recently viewed recipes do not sync across a signed in user's devices; a device switch loses that specific signal (pantry still syncs, per spec 0008).
- Ingredient overlap only, no tag based similarity yet, means recommendations may feel repetitive for users whose pantry is narrow, until the deferred tagging feature ships and this can be revisited.
- No real popularity signal exists yet (spec 0002's own gap), so the cold start fallback is a stable but generic name ordering, not a "popular drinks" experience; revisit once usage data exists (scope item 14).
- A second SQL function alongside `match_recipes_to_pantry` with a similar shape (session scoped, ingredient overlap based) is more surface to keep consistent if the scoring approach changes later.
- Dropping favorites from this revision means the feature ships without one of the three signals the original scope wording named; it needs a follow up once favoriting ships.

**Neutral**:
- No new tables or RLS policies; only a new function and its migration.

## Follow-up

- [ ] Favoriting (a toggle-favorite mutation, a UI control on `RecipeCard`/detail) does not exist yet. Once it ships, revisit this spec to add the favorites signal (scoring weight, exclusion from results, and query invalidation on favorite/unfavorite) back into `recommend_recipes`.
- [ ] Once the deferred tagging feature (recipe search and detail's own follow up, per spec 0002) ships real `recipe_tags` data, revisit whether `recommend_recipes` should blend tag overlap into the score alongside ingredient overlap.
- [ ] Once a real popularity signal exists (scope item 14, basic product analytics), replace the `name asc` fallback ordering with a genuine popularity ordering.
- [ ] Watch `recommend_recipes`'s full catalog scan cost as the recipe count grows; if it becomes a measured problem, consider capping the candidate pool the way `match_recipes_to_pantry` already does, rather than optimizing ahead of a measured need.
