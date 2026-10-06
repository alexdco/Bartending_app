# Verify: shopping list · spec 0031 · updated 2026-10-02

_Steps derived from spec 0031 acceptance criteria. `/check verify` runs these; `/test` locks the durable ones._

## UI / manual

- [ ] Open the shopping list tab, search for an ingredient not already on the list, click Add → ingredient appears on the list immediately → AC-1
- [ ] On the shopping list tab, search for an ingredient already on the list → the Add button shows "Added" and is disabled, no duplicate row is created → AC-1, AC-7
- [ ] On the shopping list tab, click Remove on an item → it disappears from the list → AC-2
- [ ] With an empty shopping list, the tab shows the `EmptyState` prompt ("Your shopping list is empty... search above") instead of a blank list → AC-3
- [ ] On the shopping list tab, click Bought on an item → it disappears from the shopping list and now appears in the pantry tab, never visible in both or neither after the action settles → AC-4
- [ ] On a recipe detail page, an ingredient not in the pantry shows an "Add to shopping list" button next to "Add to pantry" → clicking it adds the ingredient to the shopping list (confirm on the shopping list tab) → AC-5
- [ ] On a recipe detail page, after adding an ingredient to the shopping list, its button now reads "On list" and is disabled → AC-6
- [ ] On a recipe detail page, an ingredient already in the pantry never shows the "add to shopping list" button at all → AC-5 (value sourcing: set difference against pantry ids)
- [ ] From the dedicated tab's own search picker, add an ingredient that is already in the pantry → it is added to the shopping list with no warning or block → AC-8
- [ ] Add an ingredient to the shopping list from the recipe detail page, then open the dedicated shopping list tab in the same session (or another open tab/screen) without a manual refresh → the new item is visible there → AC-9
- [ ] Mark an item bought from the dedicated tab, then check the pantry tab in the same session without a manual refresh → the item now appears in the pantry → AC-9
- [ ] Simulate a network failure during an add, remove, or buy action (e.g. offline toggle) → the optimistic UI change rolls back and an inline error appears; the rest of the app keeps working → AC-10

## Commands

- [x] `pnpm --filter @bartendingapp/shared typecheck` → passes → build correctness (shared `shoppingList.ts` module)
- [x] `pnpm --filter web typecheck` → passes → build correctness (web hooks, pages, ingredient list)
- [x] `pnpm --filter mobile typecheck` → passes → build correctness (mobile hooks, screen, ingredient list)
- [x] `pnpm lint` → passes with no new errors → style/convention correctness
- [ ] Two anonymous Supabase sessions: session A adds a shopping list item; from session B's client, attempt `select`/`delete` on that row and attempt `buy_shopping_list_item` for A's ingredient → all affect/return zero rows, never A's data → AC-11

## Acceptance-criteria coverage

- AC-1 … covered by the add steps (dedicated tab + search picker) · AC-2 … covered by the remove step · AC-3 … covered by the empty state step · AC-4 … covered by the buy step · AC-5 … covered by the recipe detail button visibility and click steps · AC-6 … covered by the "on list" state step · AC-7 … covered by the duplicate add no-op step · AC-8 … covered by the pantry-independent add step · AC-9 … covered by the cross-view live update steps · AC-10 … covered by the simulated failure step · AC-11 … covered by the two-session RLS command
