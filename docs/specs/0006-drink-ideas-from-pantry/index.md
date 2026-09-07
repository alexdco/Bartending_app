# 0006. Drink ideas from pantry

**Date**: 2026-09-07
**Status**: In Progress

## Summary

This spec covers a dedicated page where a user, guest or signed in, sees which cocktail recipes they can make right now with what is in their pantry, plus recipes they are close to making. It reuses the recipe catalog and pantry data that already exist; the only new piece is a Postgres function that compares the two and ranks the results. No new tables.

Design history (context, options considered, rationale): [rationale.md](./rationale.md). Verify checklist: [verify.md](./verify.md).

## Requirements

**User stories**:
- As a guest or signed in user, I want to see which recipes I can make right now with what is in my pantry, so I know what to mix without checking each recipe by hand.
- As a guest or signed in user, I want to see recipes I am close to making, and exactly which ingredients I am missing, so I know what to add to my pantry or buy.

**Acceptance criteria**:
- **AC-1**: A user can open a dedicated drink ideas page/screen and see every recipe they can make with zero missing ingredients, under a "you can make now" section.
- **AC-2**: The same page shows recipes missing at most 25 percent of their ingredients, or missing exactly one ingredient regardless of recipe size, under a separate "almost there" section, each one naming which ingredients are missing.
- **AC-3**: The combined list across both sections is paginated at 20 results per page, with a way to load more.
- **AC-4**: When the user's pantry produces zero matches in both sections (including an empty pantry), the page shows an empty state that links to the pantry page instead of an empty list with no explanation.
- **AC-5**: Adding or removing a pantry item, from any entry point (dedicated pantry screen, recipe detail, in a future feature a search result), updates the drink ideas page's results without a manual refresh, the next time it is viewed or if already open.
- **AC-6**: A user with no active session (the anonymous session bootstrap from spec 0005 failed or has not run yet) sees the same retryable error state as a failed pantry action, never a silent "you have no matches" result.
- **AC-7**: A recipe that is soft deleted (`deleted_at` set, spec 0002's reconciliation) never appears in either section.
- **AC-8**: If fetching matches fails (network or function error), the page shows a retry affordance instead of an empty list; the rest of the app keeps working.
- **AC-9**: A user's matches are computed only from their own pantry; no client can see or influence another user's match results.

## Decision

**Chosen option**: Option 1: One Postgres function call returning both sections, split client side (see [rationale.md](./rationale.md) for the options considered and the reasoning)

**Implementation skills**: `supabase-postgres-best-practices` (`supabase/agent-skills`, `.agents/skills/supabase-postgres-best-practices/`)

## Feature design

**Data model sketch**:

No new tables or columns. This feature reads existing tables from specs 0002 and 0005 through one new function.

| Entity | Primary key | Fields used | Foreign keys | Cardinality |
|---|---|---|---|---|
| `recipes` | `id` (uuid) | `name`, `image_url`, `alcoholic_status`, `deleted_at` | — | referenced by `recipe_ingredients` |
| `recipe_ingredients` | (`recipe_id`, `ingredient_id`) | — | `recipe_id` → `recipes`, `ingredient_id` → `ingredients` | N:M `recipes` ↔ `ingredients` |
| `ingredients` | `id` (uuid) | `name` | — | referenced by `recipe_ingredients`, `pantry_items` |
| `pantry_items` | (`user_id`, `ingredient_id`) | — | `user_id` → `auth.users`, `ingredient_id` → `ingredients` | N:M `auth.users` ↔ `ingredients` |

**State transitions**: none, a match result is computed fresh on each call, no stored state.

**API surface**:
| Endpoint | Method | Key inputs | Key outputs | Auth | Key errors |
|---|---|---|---|---|---|
| `match_recipes_to_pantry(max_ratio, page_limit, page_offset)` (new Postgres function) | RPC | `max_ratio: real` (default `0.25`, the near match ceiling; a recipe qualifies when `missing_ratio <= max_ratio` or it is missing exactly one ingredient), `page_limit: int` (default 20), `page_offset: int` (default 0) | one ranked, paginated list of `{ id, name, image_url, alcoholic_status, missing_ratio, missing_ingredients: [{ id, name }] }`, ordered by `missing_ratio asc, name asc, id asc`; the client splits this single list into "you can make now" (`missing_ratio = 0`) and "almost there" (`missing_ratio > 0`) | anonymous or signed in session required (`auth.uid()` read internally); a null `auth.uid()` raises `raise exception 'no active session' using errcode = '28000'`, which the client treats identically to a network failure (the same retryable error state either way) | no session (SQLSTATE `28000`); network/timeout |

**Value sourcing**:
| Action | Value produced / displayed | Source |
|---|---|---|
| Load drink ideas page, both sections | One ranked page of matches at or under the near match cutoff | `match_recipes_to_pantry(max_ratio: 0.25, page_limit: 20, page_offset)`, one call, via a shared `useDrinkIdeas()` hook built on TanStack Query's `useInfiniteQuery` (`getNextPageParam` returns the next offset when the last page returned exactly `page_limit` rows, `undefined` otherwise, the same "short page means done" signal used elsewhere; the query key is `['drinkIdeas']`) |
| "You can make now" section | The subset of the loaded pages where `missing_ratio = 0` | Client side filter over the single `useDrinkIdeas()` result, no separate fetch |
| "Almost there" section | The subset of the loaded pages where `missing_ratio > 0` | Same filter, the complement |
| Each near match card | Names of missing ingredients | `missing_ingredients` array the function already returns (mapped from the RPC's snake case `missing_ingredients: [{ id, name }]` to `RecipeCard`'s camelCase prop, the same mapping `recipes.ts`/`pantry.ts` already do for their own RPC calls), computed server side from the `recipe_ingredients`/`ingredients`/`pantry_items` join, no second lookup |
| Each match card | Recipe name, image, alcoholic status | Same function's output, same fields `RecipeCard` (spec 0004) already renders |
| Each near match card | The missing ingredients line's display | `RecipeCard` gains a new optional prop, `missingIngredientNames?: string[]`; when present and non empty it renders as a comma joined list capped at 3 names plus a "+N more" suffix beyond that, omitted entirely (prop left undefined) for an exact match |
| Drink ideas page, empty state | The prompt copy and pantry link shown when there are zero matches | Static copy in the shared `EmptyState` component (spec 0003), drink ideas specific text and a link to `/pantry` passed as props; shown only once the `useDrinkIdeas()` query has settled successfully with zero total rows across both sections (a query still loading, or one that errored, never shows this state, AC-8's retry state takes precedence on error) |
| Drink ideas page, retry on fetch failure | The retry affordance | `query.refetch()` on the `useDrinkIdeas()` hook, same pattern as the pantry page's own `pantry.refetch()` (spec 0005) |
| Drink ideas page, refresh on pantry change | Up to date match results with no manual refresh | `useAddPantryItem`/`useRemovePantryItem` (spec 0005, both `apps/web/src/pantry/use-pantry-mutations.ts` and the mobile equivalent) add `queryClient.invalidateQueries({ queryKey: ['drinkIdeas'] })` alongside their existing pantry key invalidation in `onSettled`; because `['drinkIdeas']` is a prefix, this invalidates every loaded page and TanStack Query's `useInfiniteQuery` refetches from page 0, so a pantry change never leaves a stale, offset shifted page behind |

**Key invariants**:
- `match_recipes_to_pantry` never accepts a pantry ingredient list as a parameter; it always resolves the caller's pantry via `auth.uid()`, so a match result can never be computed against, or reveal, another user's pantry (AC-9).
- A recipe with `deleted_at` set is excluded from all results, matching `search_recipes`'s own filter (AC-7).
- A recipe with zero rows in `recipe_ingredients` is excluded from all results (the inner join to compute `missing_ratio` naturally drops it), never a division by zero.
- `missing_ratio` is always `missing ingredient count / total ingredient count` for that recipe. A recipe qualifies for the returned list when `missing_ratio <= max_ratio` (default `0.25`) **or** its missing ingredient count is exactly `1`, so a short recipe (2 or 3 ingredients) missing just one item is never excluded purely for having a small denominator.
- The function returns one ranked list; the client, not the database, decides the "you can make now" vs "almost there" split (`missing_ratio = 0`), so there is exactly one source of truth for which recipes qualify at all.
- `page_limit` is clamped the same way `search_recipes`/`search_ingredients` clamp theirs (`least(greatest(page_limit, 1), 50)`), so no caller can request an unbounded page.

**Security model**:
No new RLS policies; `match_recipes_to_pantry` runs `security invoker` with `set search_path = ''`, so every reference inside it (`auth.uid()`, `public.recipes`, and so on) is schema qualified, and its internal read of `pantry_items` is already governed by that table's existing RLS (spec 0005: `select`/`delete` scoped to `auth.uid() = user_id`). `recipes`, `recipe_ingredients`, and `ingredients` are public read tables (spec 0002), so no additional access rule is needed for them. The function itself is granted to `anon`/`authenticated` only, matching `search_recipes`/`search_ingredients`; a caller with no session at all gets `auth.uid()` as null, which the function surfaces as a raised exception (SQLSTATE `28000`) rather than a false empty result, so the client can distinguish "you have no matches" from "your session is not working" (AC-6).

**Configuration required**: none new; reuses the Supabase project already configured for both apps.

**Critical test scenarios**:
- Happy path: a user with lime juice, gin, and tonic water in their pantry opens the drink ideas page, sees a gin and tonic under "you can make now", and a daiquiri missing only simple syrup under "almost there" naming "simple syrup" as missing, verifies **AC-1**, **AC-2**.
- Short recipe near miss: a 2 ingredient highball missing exactly 1 ingredient (a 0.5 ratio, over the 0.25 cutoff) still appears under "almost there" via the missing count exception, verifies **AC-2**.
- Refresh on change: the same user adds simple syrup from the pantry page while the drink ideas page is open in another tab/screen, and the daiquiri moves from "almost there" to "you can make now" with no manual refresh and no duplicated or skipped rows on the next page load, verifies **AC-5**.
- Failure case: the match request fails (simulated network error), the page shows a retry affordance instead of an empty list, and retrying re-fetches successfully, verifies **AC-8**.
- No session: a client with no active session calls the drink ideas page; the RPC raises the `28000` error, and the page shows the same retryable error state as a network failure, never an empty result, verifies **AC-6**.
- Auth/permission: a session with no pantry items and a second, different session with several pantry items each call `match_recipes_to_pantry`; the first session's results never include or depend on the second session's pantry contents, verifies **AC-9**.

## Build plan

1. [x] Migration: add `match_recipes_to_pantry(max_ratio real default 0.25, page_limit int default 20, page_offset int default 0)`, `security invoker`, `set search_path = ''`, excluding recipes with `deleted_at` set or zero `recipe_ingredients` rows, including the missing count `<= 1` exception, raising SQLSTATE `28000` on a null `auth.uid()`, granted to `anon`/`authenticated` like `search_recipes`/`search_ingredients`, satisfies **AC-1**, **AC-2**, **AC-3**, **AC-6**, **AC-7**, **AC-9**.
2. [x] Extend spec 0005's `useAddPantryItem`/`useRemovePantryItem` mutation hooks (both `apps/web/src/pantry/use-pantry-mutations.ts` and the mobile equivalent) to also call `queryClient.invalidateQueries({ queryKey: ['drinkIdeas'] })` in their existing `onSettled`, satisfies **AC-5**.
3. [x] Shared `drinkIdeas.ts` in `packages/shared`: a `fetchDrinkIdeaMatches` function wrapping the `match_recipes_to_pantry` RPC call (mapping its snake case output to camelCase), plus a `useDrinkIdeas()` TanStack Query hook built on `useInfiniteQuery`, keyed `['drinkIdeas']`, one per app (`packages/shared` carries no React dependency, so the hook itself lives in each app, matching the existing `useRecipeSearch` pattern; the fetch/mapping logic it wraps is the one shared piece), satisfies **AC-1**, **AC-2**, **AC-3**, **AC-8**.
4. [x] Extend `RecipeCard` (spec 0004) with the optional `missingIngredientNames?: string[]` prop and its truncation rule, satisfies **AC-2**.
5. [x] Dedicated drink ideas screen/page (mobile route, web page): client side split of the one `useDrinkIdeas()` result into "you can make now" and "almost there" sections, one shared "load more" advancing both, the `EmptyState` empty case (shown only once settled with zero total rows) linking to the pantry page, and the retryable error state, satisfies **AC-1** through **AC-4**, **AC-6**, **AC-8**.
6. [x] Cross platform parity check: same shared hooks and the same live `match_recipes_to_pantry` call on both apps, mirroring specs 0004 and 0005's own parity step.

## Consequences

**Positive**:
- Every user with any pantry contents gets an immediately useful "what can I make" view with no manual recipe browsing, built entirely on data and patterns (RLS, Postgres search functions, TanStack Query) already proven in this codebase.
- Matching logic lives in one place (the database function), consumed identically by both apps, so mobile and web can never compute different match results for the same pantry.

**Negative / tradeoffs**:
- `matchPantryToRecipes`, the pure client side function from spec 0005, is now unused by any shipped feature. It stays in `packages/shared` rather than being deleted as part of this spec (see Follow-up); a future reader may reasonably wonder why the app has recipe matching logic on both the client and the server.
- Every drink ideas view now depends on a working anonymous or signed in session, the same dependency spec 0005 introduced for pantry actions; a Supabase auth outage blocks this page too (AC-6's retryable error state is the mitigation, not a fix).

**Neutral**:
- Adds a third Postgres search/filter function alongside `search_recipes` and `search_ingredients`; the pattern is now well established for any future catalog filtering feature.

## Follow-up

- [ ] Decide whether `matchPantryToRecipes` in `packages/shared` should be removed, kept as a documented alternative (e.g. for a future offline matching mode), or repurposed; it is unused once this feature ships.
- [ ] Recipe recommendations (scope feature 10) may want to reuse `match_recipes_to_pantry`'s missing ingredient computation as one of its signals; revisit when that feature is designed.
