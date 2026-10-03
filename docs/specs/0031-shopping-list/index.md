# 0031. Shopping list

**Date**: 2026-10-02
**Status**: In Progress

## Summary

This spec adds a shopping list: a tab next to Pantry where a user keeps track of ingredients they want to buy. A new button on the recipe detail page, next to the existing "add to pantry" button, lets a user add a missing ingredient straight to their shopping list. Buying an item moves it from the shopping list into the pantry in one action. The whole feature reuses the architecture spec 0005 already built for the pantry (anonymous sessions, row level security, shared TanStack Query hooks), so there is very little new ground here.

## Requirements

**User stories**:
- As a guest or signed in user, I want to add an ingredient to my shopping list so I remember to buy it.
- As a guest or signed in user, I want to remove an ingredient from my shopping list if I changed my mind or added it by mistake.
- As a guest or signed in user, I want to see my full shopping list in one place, in a tab next to my pantry.
- As a user viewing a recipe, I want to add a missing ingredient straight to my shopping list without leaving the page.
- As a user, I want marking an item as bought to move it into my pantry automatically, so I do not have to add it twice.

**Acceptance criteria**:
- **AC-1**: A user can search the ingredient catalog and add a matching ingredient to their shopping list from a dedicated shopping list tab/page, using the same ingredient search picker the pantry tab already uses.
- **AC-2**: A user can remove an ingredient from their shopping list from the dedicated shopping list tab/page.
- **AC-3**: The dedicated shopping list tab/page lists every ingredient currently on the user's shopping list, and shows a prompt to search and add when the list is empty (same `EmptyState` component and pattern as the pantry tab).
- **AC-4**: A user can mark a shopping list item as bought from the dedicated tab/page; this removes it from the shopping list and adds it to the pantry in one action, atomically (never a state where it is in both or in neither after the action completes).
- **AC-5**: On the recipe detail page, each ingredient not already in the pantry shows an "add to shopping list" button next to the existing "add to pantry" button; clicking it adds that ingredient to the shopping list.
- **AC-6**: Once an ingredient is on the shopping list, its "add to shopping list" button on the recipe detail page reflects that state (e.g. a checked/disabled "on list" state), the same way the "add to pantry" button already reflects pantry membership.
- **AC-7**: Adding an ingredient already on the shopping list, from any entry point (dedicated tab or recipe detail), is a no op that leaves the list unchanged and reflects the item as already added, never an error.
- **AC-8**: Adding an ingredient to the shopping list from the dedicated tab's own search picker is independent of pantry membership: an ingredient already in the pantry can still be added to the shopping list from that picker with no warning or block (only the recipe detail page's button, AC-5, is pantry aware).
- **AC-9**: A shopping list change made from any entry point (dedicated tab, recipe detail, the buy action) is reflected in every other open view of the shopping list and pantry within the same session, with no manual refresh.
- **AC-10**: If a shopping list add, remove, or buy request fails, the UI rolls back the optimistic change and shows an inline error; the rest of the app keeps working.
- **AC-11**: A user's shopping list is private: no client can read or write another user's `shopping_list_items` rows.

## Decision

**Chosen option**: Option 1: New `shopping_list_items` table, live queried the same way as `pantry_items`

The shopping list is a new table, `shopping_list_items`, with the same shape, security model, and client side query pattern as `pantry_items`, plus one new Postgres function, `buy_shopping_list_item`, for the atomic move from list to pantry.

**Implementation skills**: `supabase-postgres-best-practices` (`supabase/agent-skills`, `.agents/skills/supabase-postgres-best-practices/`)

Full decision rationale: [rationale.md](rationale.md).

## Feature design

**Data model sketch**:

| Entity | Primary key | Fields | Foreign keys | Cardinality |
|---|---|---|---|---|
| `shopping_list_items` | (`user_id`, `ingredient_id`), unique | `created_at` (timestamptz) | `user_id` → `auth.users` (cascade), `ingredient_id` → `ingredients` (restrict) | N:M `auth.users` ↔ `ingredients` |
| `ingredients` | `id` (uuid) | `name`, `normalized_name` | — | referenced by `shopping_list_items`, `pantry_items`, `recipe_ingredients` (unchanged, no new columns) |

No new columns on `ingredients` or `pantry_items`; `shopping_list_items` is additive only.

**State transitions**: none directly; a shopping list item is either present or absent, like a pantry item. The one cross entity transition is the buy action: a `shopping_list_items` row is deleted and a `pantry_items` row is inserted (or left as a no op if that ingredient is already in the pantry, matching AC-7's no op rule), both inside one function call.

**API surface**:
| Endpoint | Method | Key inputs | Key outputs | Auth | Key errors |
|---|---|---|---|---|---|
| Shopping list (Supabase query on `shopping_list_items` joined to `ingredients`) | SELECT | `auth.uid()` (implicit via RLS) | list of `{ ingredientId, name }` | anonymous or signed in session required | empty result (not an error) when the list is empty |
| Add shopping list item | INSERT `shopping_list_items`, `ON CONFLICT (user_id, ingredient_id) DO NOTHING` | `ingredient_id: uuid` (req) | the affected row (0 or 1 rows) | anonymous or signed in session required | insert on a non existent `ingredient_id` (FK violation), network/timeout |
| Remove shopping list item | DELETE `shopping_list_items` where `user_id = auth.uid() and ingredient_id = :id` | `ingredient_id: uuid` (req) | rows affected (0 or 1) | anonymous or signed in session required | network/timeout; 0 rows affected is a no op, not an error |
| `buy_shopping_list_item(ingredient_id uuid)` (new Postgres function, `security invoker`) | RPC | `ingredient_id: uuid` (req) | the resulting pantry row | anonymous or signed in session required, `auth.uid()` used for both the delete and insert inside the function | the shopping list row not existing is still treated as success (deletes 0 rows, inserts into pantry with `ON CONFLICT DO NOTHING` same as a normal pantry add); FK violation on a tampered `ingredient_id`; network/timeout |
| Ingredient search (add picker) | existing `search_ingredients(query text, result_limit int)` from spec 0005 | `query: string` (req), `result_limit` (default 20) | list of `{ id, name }` | public read, unchanged | empty result on no match or empty query |

**Value sourcing**:
| Action | Value produced / displayed | Source |
|---|---|---|
| Shopping list add (any entry point) | `shopping_list_items.user_id` | `auth.uid()` from the active session (already bootstrapped by spec 0005's `ensureAnonymousSession`), never passed by the client |
| Shopping list add (any entry point) | `shopping_list_items.ingredient_id` | The `id` of the ingredient selected from the search picker (dedicated tab) or already known from the recipe being viewed (recipe detail button) |
| Recipe detail ingredient list | Which ingredients show the "add to shopping list" button at all | Set difference, client side, of the recipe's `recipe_ingredients.ingredient_id` list against the current user's pantry ingredient id set (the same `usePantry()` cache spec 0005 already reads for the "already in pantry" marker); an ingredient already in the pantry never shows the button, per the original requirement |
| Recipe detail ingredient list | Which "add to shopping list" buttons show the "on list" state | Set intersection, client side, of the recipe's `recipe_ingredients.ingredient_id` list against the current user's shopping list ingredient id set, from the new `useShoppingList()` query |
| Buy action | Which `pantry_items` row gets inserted | The same `ingredient_id` the function is called with; `user_id` from `auth.uid()` inside the function, not passed by the client |
| Dedicated shopping list tab, empty state | The prompt copy shown when the list has 0 items | Static copy in the shared `EmptyState` component (spec 0003), shopping list specific text passed as a prop, same pattern as the pantry tab |

**Key invariants**:
- `shopping_list_items(user_id, ingredient_id)` stays unique; every add path uses `ON CONFLICT DO NOTHING`, so a duplicate add from any entry point is always a no op, never a second row or an error (AC-7).
- A remove affecting 0 rows is a no op, not an error, matching `pantry_items`' own invariant from spec 0005.
- `buy_shopping_list_item` either leaves the database in the state "no longer on the shopping list, now in the pantry" or, on any failure inside the function, leaves it unchanged; a client never observes a half completed buy (removed from the list but not in the pantry, or the reverse), satisfying AC-4.
- An ingredient can be in `pantry_items` and `shopping_list_items` at the same time for the same user (AC-8); the two tables never enforce mutual exclusion against each other, only the recipe detail page's UI chooses which button to show.
- An add whose `ingredient_id` does not exist in `ingredients` (a foreign key violation, only reachable via a stale or tampered client) is treated the same as any other add failure: rolled back optimistically with the inline error from AC-10, not a distinct error path.

**Security model**:
Row level security on `shopping_list_items` mirrors `pantry_items` exactly: `SELECT`/`DELETE` use `USING ((select auth.uid()) = user_id)`, `INSERT` uses `WITH CHECK ((select auth.uid()) = user_id)`, no `UPDATE` policy. `buy_shopping_list_item` is `security invoker`, so it runs as the calling user and is still subject to both tables' RLS policies inside the function body, the same pattern spec 0026's `submit_quiz_attempt` already established for a multi step write. No new auth mechanism; this feature depends entirely on the anonymous session bootstrap spec 0005 already built.

**Configuration required**: none new; reuses the Supabase URL and anon key already configured for both apps, and the existing anonymous session bootstrap.

**Critical test scenarios**:
- Happy path: a user opens a recipe detail page, sees an ingredient they do not have, clicks "add to shopping list," sees it appear on the dedicated shopping list tab, then marks it bought from that tab and sees it move into their pantry and disappear from the shopping list, verifies **AC-1**, **AC-3**, **AC-4**, **AC-5**, **AC-9**.
- Failure case: a shopping list add request fails (simulated network error), the optimistically added item disappears again and an inline error appears, the rest of the app is unaffected, verifies **AC-10**.
- Auth/permission: two anonymous sessions are created, the first adds a shopping list item; a request from the second session's client to read, delete, or buy the first session's `shopping_list_items` row returns zero rows / affects zero rows, never the other session's data, verifies **AC-11**.

## Build plan

1. [x] Migration: create `shopping_list_items` (same shape and RLS as `pantry_items`), plus the `buy_shopping_list_item(ingredient_id uuid)` security invoker function, satisfies **AC-1**, **AC-2**, **AC-4**, **AC-11**.
2. [x] Shared `shoppingList.ts` in `packages/shared`: `fetchShoppingListItems`, `addShoppingListItem`, `removeShoppingListItem`, `buyShoppingListItem` functions, mirroring `pantry.ts`'s shape, satisfies **AC-1**, **AC-2**, **AC-4**, **AC-11**.
3. [x] Shared TanStack Query hooks (`useShoppingList`, `useAddShoppingListItem`, `useRemoveShoppingListItem`, `useBuyShoppingListItem`) with optimistic update and rollback, invalidating both the shopping list and pantry query keys on buy, satisfies **AC-7**, **AC-9**, **AC-10**.
4. [x] Dedicated shopping list tab/page (mobile route, web page) next to the existing pantry tab, reusing the pantry tab's ingredient search picker and list view, plus the `EmptyState` empty case and a "buy" action per item, satisfies **AC-1**, **AC-2**, **AC-3**, **AC-4**, **AC-8**.
5. [x] Recipe detail ingredient list: an "add to shopping list" button next to the existing "add to pantry" button, shown only for ingredients not in the pantry, reflecting "on list" state via the set intersection described in Value sourcing, satisfies **AC-5**, **AC-6**, **AC-7**.
6. [x] Cross platform parity check: confirm the shared shopping list hooks and the same live `shopping_list_items`/`buy_shopping_list_item` calls are used identically by both apps, mirroring spec 0005's own parity step.

## Consequences

**Positive**:
- A user has one coherent place for "what to buy," directly connected to the recipe pages that reveal what they are missing, closing a real gap in the current pantry only experience.
- The buy action removes a manual double entry step (buy, then separately remember to add to pantry) in one atomic action.
- Built entirely on spec 0005's already proven session, RLS, and query hook pattern, so this feature carries no new operational risk.

**Negative / tradeoffs**:
- A second table with the same shape as `pantry_items`, chosen over a single shared table, per the Rationale; this means two tables to keep in RLS and migration sync if the ownership/session model ever changes.
- No offline shopping list viewing, same limitation spec 0005 already accepted for the pantry, for the same reason (small, single writer data, not worth a local cache yet).

**Neutral**:
- This is the first feature to use a `security invoker` Postgres function for a cross table write outside the Learn quizzes area (spec 0026); any gap in that pattern applied to pantry style RLS shows up here first.

## Follow-up

- [ ] Consider a shopping list item count badge on the tab icon, mirroring spec 0018's profile nav badge pattern, if usage shows it is wanted; out of scope for this slice by the engineer's own call.
- [ ] If "I have one, but want more" (AC-8's restocking case) turns out to be a common user need, a later spec could add a quantity or note field to `shopping_list_items`; this spec deliberately kept it a plain checklist.
