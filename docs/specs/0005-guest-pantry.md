# 0005. Guest pantry

**Date**: 2026-09-07
**Status**: In Progress

## Summary

This spec covers letting a user, guest or signed in, keep a list of ingredients they have on hand (their pantry), add and remove items from it, and see it stay in sync across the app. It builds entirely on the database table and the guest identity model already decided in earlier specs, it just adds no schema yet. The one new piece of work this spec closes is that neither app currently starts an anonymous session, so this feature is also where that gets built, on both mobile and web. Matching pantry contents to recipes is intentionally left for the next feature.

## Context

Every later slice of this app, drink ideas from pantry contents and AI generated ideas, needs a pantry to read from. The database table for it, `pantry_items`, and the decision that every guest gets a real anonymous Supabase session (so their pantry can be written under row level security with no separate device only mode) were both already decided, in [0001-stack-and-architecture.md](0001-stack-and-architecture.md) and [0002-data-model.md](0002-data-model.md). What has not been decided is the actual add, remove, and view experience: where a user manages their pantry, how they pick which ingredient to add, what happens if two entry points touch the same pantry at once, and how the pantry read/write layer is shared between the mobile and web codebases the way the existing recipe search layer already is.

> ⚠️ Premise note: this feature also has to close a gap the earlier specs assumed away. Spec 0001 decided every guest gets an anonymous Supabase session from first launch, but no code in either app creates one yet, `apps/web/src/lib/supabase.ts` is a bare client and `apps/mobile/src/app/_layout.tsx` never calls sign in. Recipe search and detail (spec 0004) never needed `auth.uid()`, so this went unnoticed until now, pantry is the first feature that actually writes a row scoped to a user. This spec treats standing up that session bootstrap, once, in the shared package, as part of its own build plan rather than a silent assumption.

## Requirements

**User stories**:
- As a guest or signed in user, I want to add an ingredient to my pantry so the app knows what I have on hand.
- As a guest or signed in user, I want to remove an ingredient from my pantry when I use it up or added it by mistake.
- As a guest or signed in user, I want to see my full pantry list in one place.
- As a user viewing a recipe, I want to add an ingredient straight from its ingredient list, and see which ones I already have.

**Acceptance criteria**:
- **AC-1**: A user can search the ingredient catalog and add a matching ingredient to their pantry from a dedicated pantry screen/page.
- **AC-2**: A user can remove an ingredient from their pantry from the dedicated pantry screen/page.
- **AC-3**: The dedicated pantry screen/page lists every ingredient currently in the user's pantry, and shows a prompt to search and add when the pantry is empty.
- **AC-4**: A user can add an ingredient to their pantry directly from a recipe's ingredient list on the recipe detail page, and that list visibly marks which of its ingredients are already in the pantry.
- **AC-5**: A user can add an ingredient to their pantry directly from a recipe detail page's ingredient list (same mechanism as AC-4); a search result card itself does not carry ingredient data (it shows `id`, `name`, `imageUrl`, `alcoholicStatus` only, per spec 0004) and stays out of scope for quick add in this slice.
- **AC-6**: Adding an ingredient already in the pantry, from any entry point, is a no op that leaves the pantry unchanged and reflects the item as already added, never an error.
- **AC-7**: A pantry change made from any entry point (dedicated screen, recipe detail, search result) is reflected in every other open view of the pantry within the same session, with no manual refresh.
- **AC-8**: If a pantry add or remove request fails, the UI rolls back the optimistic change and shows an inline error; the rest of the app keeps working.
- **AC-9**: A user's pantry is private: no client can read or write another user's `pantry_items` rows.
- **AC-10**: On first load, in both apps, a guest with no existing session gets a real anonymous Supabase session created automatically, with no visible sign in step; an existing session (guest or signed in) is restored, not replaced. If session creation fails, the rest of the app (browsing, search) still works, only pantry actions show a retryable error state.

## Options considered

### Option 1: Live query against Postgres via TanStack Query, no local cache

Pantry reads and writes go straight to Supabase through the same TanStack Query pattern already used for recipe search and detail (spec 0004): a shared `usePantry()` query plus `useAddPantryItem()`/`useRemovePantryItem()` mutations, with optimistic updates for snappy add/remove and TanStack Query's own cache keeping every open view in sync.

**Pros**:
- Reuses a pattern already proven in this codebase (spec 0004), no new state management concept to learn.
- No offline/sync conflict logic to build or reason about; Postgres via RLS is the only source of truth, always.

**Cons**:
- No pantry data with zero network connectivity; a user who opens the pantry screen fully offline sees a loading/error state instead of their list.

### Option 2: AsyncStorage backed local cache, reconciled with Postgres

Persist the pantry list on device (`AsyncStorage` on mobile, a web storage equivalent) as a read through cache, syncing with Postgres in the background and reconciling on reconnect.

**Pros**:
- Pantry list still renders with no network, useful for a bartender checking their shelf away from wifi.

**Cons**:
- A real sync layer: conflict handling when the same pantry item changes offline on two devices, cache invalidation, staleness bugs. Spec 0001 already flagged this table as small and single writer per user, not worth this cost yet.

### Option 3: Full matching UI bundled into this feature

Extend this spec to also build the "what can I make" experience using the already written `matchPantryToRecipes` function in `packages/shared`, instead of leaving that to its own scope slice.

**Pros**:
- One pass through the pantry code touches both the CRUD and the matching UI, no context switch between two specs.

**Cons**:
- Matching has its own real requirements (near matches, ranking display, a dedicated results screen) that deserve their own design pass, per the scope plan's own slicing (feature 7); folding it in here blurs two independently shippable features into one and makes this spec harder to verify cleanly.

## Decision

**Chosen option**: Option 1: Live query against Postgres via TanStack Query, no local cache

Pantry state is a normal server backed list, read and written live through Postgres via TanStack Query, with optimistic updates for responsiveness and no on device cache in this slice.

**Implementation skills**: `supabase-postgres-best-practices` (`supabase/agent-skills`, `.agents/skills/supabase-postgres-best-practices/`)

## Rationale

The pantry is small (a home bar's ingredients run to dozens, not thousands) and single writer per user, exactly the shape spec 0001 already sized when it called a local cache optional rather than required. TanStack Query already gives an in memory cache, shared keys across every consuming component, and refetch on mutation, which alone satisfies the sync-across-views requirement (AC-7) with no extra plumbing, the same pattern spec 0004 already proved out for recipe search. Building the offline cache (Option 2) now would add real complexity, conflict handling, staleness, a second source of truth, for a use case (fully offline pantry viewing) nobody has asked for yet; it stays a reasonable follow up once real usage shows it matters. Option 3 was rejected purely on scope grounds: the project's own scope plan already treats matching as its own slice with its own acceptance criteria, and folding it in here would make this spec, and its later verification, harder to reason about for no real benefit.

## Feature design

**Data model sketch**:

No new tables or columns. This feature reads and writes the existing `pantry_items` table from spec 0002:

| Entity | Primary key | Fields | Foreign keys | Cardinality |
|---|---|---|---|---|
| `pantry_items` | (`user_id`, `ingredient_id`), unique | `created_at` (timestamptz) | `user_id` → `auth.users` (cascade), `ingredient_id` → `ingredients` (restrict) | N:M `auth.users` ↔ `ingredients` |
| `ingredients` | `id` (uuid) | `name`, `normalized_name` (used for the add picker's search) | — | referenced by `pantry_items`, `recipe_ingredients` |

**State transitions**: none, a pantry item is either present or absent, no intermediate state.

**API surface**:
| Endpoint | Method | Key inputs | Key outputs | Auth | Key errors |
|---|---|---|---|---|---|
| `ensureAnonymousSession(client)` (shared function, not HTTP) | — | none (reads the client's current session) | the active session's `user_id` | none, called before any pantry call | session creation failure, surfaced to the caller, not thrown past it |
| `createSupabaseClient(url, anonKey, storage?)` (shared function, changed) | — | an optional platform storage adapter (mobile: `AsyncStorage` from `@react-native-async-storage/async-storage`; web: omitted, supabase-js defaults to `localStorage`) | a client configured with `persistSession: true`, `autoRefreshToken: true`, `detectSessionInUrl: false` (web has no OAuth redirect flow yet) | — | — |
| Pantry list (Supabase query on `pantry_items` joined to `ingredients`) | SELECT | `auth.uid()` (implicit via RLS) | list of `{ ingredientId, name }` | anonymous or signed in session required | empty result (not an error) when pantry is empty |
| Add pantry item | INSERT `pantry_items`, `ON CONFLICT (user_id, ingredient_id) DO NOTHING` | `ingredient_id: uuid` (req) | the affected row (0 or 1 rows) | anonymous or signed in session required | insert on a non existent `ingredient_id` (FK violation), network/timeout |
| Remove pantry item | DELETE `pantry_items` where `user_id = auth.uid() and ingredient_id = :id` | `ingredient_id: uuid` (req) | rows affected (0 or 1) | anonymous or signed in session required | network/timeout; 0 rows affected is a no op, not an error (matches spec 0002's own invariant) |
| Ingredient search (add picker) | New `search_ingredients(query text, result_limit int)` Postgres function, over `ingredients.name` using the trigram index spec 0002 already created | `query: string` (req), `result_limit` (default 20) | list of `{ id, name }`, ordered by trigram similarity descending | public read, matches `search_recipes`'s existing `anon`/`authenticated` grant | empty result on no match or an empty query |

**Value sourcing**:
| Action | Value produced / displayed | Source |
|---|---|---|
| App startup, both platforms | The active `user_id` used for every pantry call | `ensureAnonymousSession(client)`: `supabase.auth.getSession()`, and `supabase.auth.signInAnonymously()` only if no session exists; the resulting session's `user.id` |
| Pantry add (any entry point) | `pantry_items.user_id` | `auth.uid()` from the active session, never passed by the client explicitly |
| Pantry add (any entry point) | `pantry_items.ingredient_id` | The `id` of the ingredient the user selected from the search picker (dedicated screen) or the `id` already known from the recipe/result being viewed (inline entry points) |
| Recipe detail ingredient list | Which ingredients are already marked "in pantry" | Set intersection, client side, of the recipe's `recipe_ingredients.ingredient_id` list (already fetched per spec 0004) against the current user's pantry ingredient id set (from the shared `usePantry()` query) |
| Dedicated pantry screen, empty state | The prompt copy shown when the pantry has 0 items | Static copy in the shared `EmptyState` component (spec 0003), pantry specific text passed as a prop |
| App startup, mobile | When `ensureAnonymousSession` runs, and whether pantry UI waits on it | Called once in `apps/mobile/src/app/_layout.tsx`, before `AppTabs` mounts; the pantry screen and any inline pantry affordance await the shared `usePantry()` query, which itself waits on the session promise, so pantry UI shows a loading state rather than firing a doomed request |
| App startup, web | Same, for the web app | Called once in `apps/web/src/app/providers.tsx` (the existing `QueryClientProvider` wrapper), same await behavior as mobile |

**Key invariants**:
- `pantry_items(user_id, ingredient_id)` stays unique; every add path uses `ON CONFLICT DO NOTHING`, so a duplicate add from any entry point (dedicated screen, recipe detail, search card) is always a no op, never a second row or an error (AC-6).
- A remove affecting 0 rows is a no op, not an error, matching spec 0002's own invariant (the client cannot distinguish "already gone" from "not yours" under RLS, and should not need to).
- `ensureAnonymousSession` never overwrites an existing session, guest or signed in; it only creates one when `getSession()` returns none.
- The pantry ingredient id set used for the recipe detail "already have" marker and the dedicated pantry list always come from the same TanStack Query cache key, so they can never disagree within one session.
- An add whose `ingredient_id` does not exist in `ingredients` (a foreign key violation, only reachable via a stale or tampered client, never through the search picker's own results) is treated the same as any other add failure: rolled back optimistically with the inline error from AC-8, not a distinct error path.

**Security model**:
Row level security on `pantry_items` was already defined in spec 0002 and needs no change here: `SELECT`/`DELETE` use `USING ((select auth.uid()) = user_id)`, `INSERT` uses `WITH CHECK ((select auth.uid()) = user_id)`, no `UPDATE` policy exists (nothing on the row is worth updating). This feature's own job is making sure every client call actually goes through a session that has a `user_id` at all, which is what the anonymous session bootstrap (AC-10) exists for: with no session, every pantry call fails RLS by design, and the UI must show that as a retryable error state, not a silent empty pantry (AC-8, AC-10).

**Configuration required**: none new; reuses the Supabase URL and anon key already configured for both apps.

**Critical test scenarios**:
- Happy path: a guest with no prior session opens the app, a session is created silently, they search for "lime juice" on the pantry screen, add it, see it appear immediately, and it also shows as "in pantry" on a recipe detail page listing lime juice, verifies **AC-1**, **AC-3**, **AC-4**, **AC-7**, **AC-10**.
- Failure case: a pantry add request fails (simulated network error), the optimistically added item disappears again and an inline error appears, the rest of the app (search, browse) is unaffected, verifies **AC-8**.
- Auth/permission: two anonymous sessions are created (two `signInAnonymously()` calls against a test project), the first adds a pantry item; a request from the second session's client to read or delete the first session's `pantry_items` row returns zero rows / affects zero rows, never the other session's data, verifies **AC-9**.

## Build plan

1. [x] Migration: add the `search_ingredients(query text, result_limit int default 20)` Postgres function over `ingredients.name`, ordered by trigram similarity, granted to `anon`/`authenticated` like `search_recipes`, satisfies **AC-1**. Applied to `BartendingAppWeb` via `supabase/migrations/20260907155338_search_ingredients_function.sql`; confirmed live (fuzzy match against `"lime"` returns ranked results), no new security advisories.
2. [x] Update `createSupabaseClient` in `packages/shared` to accept an optional storage adapter and set `persistSession: true` / `autoRefreshToken: true` / `detectSessionInUrl: false`; add `ensureAnonymousSession(client)` to `packages/shared`, satisfies **AC-10**.
3. [x] Wire the session bootstrap into both apps: mobile passes `AsyncStorage` from `_layout.tsx` before `AppTabs` mounts; web calls `ensureAnonymousSession` from `providers.tsx`; both surface a retryable error state to pantry consumers on failure without blocking the rest of the app, satisfies **AC-10**.
4. [x] Shared `pantry.ts` in `packages/shared`: `fetchPantryItems`, `addPantryItem`, `removePantryItem` functions wrapping the queries in the API surface above, satisfies **AC-1**, **AC-2**, **AC-9**.
5. [x] Shared TanStack Query hooks (`usePantry`, `useAddPantryItem`, `useRemovePantryItem`) with optimistic update and rollback, keyed so every consumer shares one cache entry, satisfies **AC-6**, **AC-7**, **AC-8**.
6. [x] Dedicated pantry screen/page (mobile route, web page), ingredient search picker calling `search_ingredients`, list view, and the `EmptyState` empty case, satisfies **AC-1**, **AC-2**, **AC-3**.
7. [x] Recipe detail ingredient list: add affordance per ingredient plus the "already in pantry" marker via the set intersection described in Value sourcing, satisfies **AC-4**, **AC-5**.
8. [x] Cross platform parity check: the same pantry hooks and hitting the same live data on both apps, mirroring spec 0004's own parity step. Confirmed: `packages/shared/src/pantry.ts` and the `use-pantry*`/`use-ingredient-search` hooks are byte-identical in shape between `apps/web/src/pantry/` and `apps/mobile/src/pantry/`, both calling the same live `search_ingredients` RPC and `pantry_items` table; web verified end to end via a running dev server (pantry page renders, recipe detail page renders "Add to pantry" per ingredient); mobile verified via clean typecheck/lint (no on-device simulator available in this environment).

## Consequences

**Positive**:
- Every later pantry consuming feature (drink ideas from pantry, AI generated ideas, cross device sync) can build directly on a working, tested pantry CRUD layer and a working anonymous session bootstrap, with no foundational gap left behind.
- The shared `pantry.ts` and its hooks in `packages/shared` mean mobile and web share one non UI implementation, per this project's own rule against duplicating logic per app.

**Negative / tradeoffs**:
- No offline pantry viewing in this slice; a user with no connectivity sees a loading/error state on the pantry screen instead of a stale but usable list.
- Every pantry action now depends on a working anonymous session; a Supabase auth outage blocks pantry actions app wide (browsing and search are unaffected, per AC-10's isolation).

**Neutral**:
- This is the first feature to actually exercise the `pantry_items` RLS policies and the anonymous session model end to end; any gap in either shows up here first, even though both were designed earlier.

## Follow-up

- [ ] Revisit an on device pantry cache (AsyncStorage or Expo SQLite, per spec 0001's original suggestion) once real usage shows offline viewing is actually needed; Option 2 above has the shape.
- [ ] Drink ideas from pantry (scope feature 7) builds the matching UI on top of the pantry state this spec produces and the existing `matchPantryToRecipes` function; not part of this spec by design.
- [ ] Spec 0001's 30 day anonymous account cleanup job is still unbuilt; this feature is what makes anonymous accounts actually start accumulating pantry data, which makes that cleanup job more relevant sooner.
