# 0023. Bartender Mode

**Date**: 2026-09-15
**Status**: In Progress

## Summary

Bartender Mode is a new, separate part of the mobile app built for working bartenders during a shift, not for guests browsing recipes at home. It adds a shared "bar" (a venue or team) that staff can join, so house recipes, the current menu, and an out of stock ("86'd") ingredient list all stay in sync across everyone working there. The goal stated by the product owner is that a bartender can find the right recipe in about 2 to 3 seconds, so the whole design favors speed, large readable text, and as few taps as possible over discovery or education content. This spec is an umbrella: it ties together three focused child specs and holds the parts they all share.

## Structure

This feature splits into three buildable parts, each its own child spec:

- [0023-bar-data-model.md](0023-bar-data-model.md): the shared bar (venue/team) data model, roles, invites, house recipes, the current menu, and the 86 (out of stock) list. Every other child depends on this.
- [0023-search-and-shorthand.md](0023-search-and-shorthand.md): the ranked search that powers the Service screen, including bartender shorthand ("old f" for Old Fashioned) and ingredient list queries ("gin campari vermouth" for Negroni).
- [0023-quick-build-mode.md](0023-quick-build-mode.md): the distraction free, high contrast single recipe screen a bartender opens to build a drink, including the oz / ml / parts toggle and keep screen awake option.

## Cross child contract

These rules are shared by all three child specs and must not be re-decided differently in any of them.

- **Platform**: `apps/mobile` only (Expo Router, TanStack Query). `apps/web` is not touched by this feature; it keeps the existing consumer facing experience only.
- **Entry point**: a new tab in the existing bottom tab bar (`apps/mobile/src/components/app-tabs.tsx`), labeled "Service", alongside the existing Home / Search / Pantry / Drink Ideas / Popular tabs.
- **Reused, not rebuilt**: `packages/shared/src/units.ts` (`parseMeasure`, `convertAmount`, `formatOunces`) for the oz/ml conversion in Quick Build Mode; `packages/shared/src/recentlyViewed.ts`'s list pattern (cap, append), extended with a `kind` field (see the Quick Build child spec's migration note) for the client side recently viewed list; the existing `search_recipes` Postgres RPC as one input to the new ranked search, not replaced by it. One genuinely new piece of shared logic is needed: the "parts" ratio calculation, since `units.ts` has no proportional/ratio mode today; it is added alongside `units.ts`, not a rebuild of it. Quick Build Mode also adds `@tanstack/query-async-storage-persister`, a new dependency, to make its offline guarantee survive an app restart (see that child spec's Options considered).
- **Auth**: bar membership, and every read or write to any `bar_*` table, requires a real, linked Supabase Auth account (not a bare anonymous session) at every access, not only when joining. This is enforced on the `SELECT` policy itself, not just on how a `bar_members` row gets created, so an anonymous session is denied even in a hypothetical case where it held a membership row. Personal data (pinned cocktails, the client side recently viewed list) works the same for anonymous or linked users, unchanged from today's `pantry_items` / `favorites` pattern.
- **Soft delete convention**: `bar_recipes` uses `deleted_at`, matching the existing `recipes` table's soft delete pattern already in production. This is a deliberate consistency choice with the established schema, not a default; a new project without that precedent should prefer an explicit `archived_at` pattern instead.
- **RLS shape**: every `bar_*` table scopes reads to `bar_members` rows for the requesting user (`auth.uid()`); write rules differ per table and are detailed in the data model child spec.

## Build plan

The three child specs each carry their own build plan. Build them in this order, since each depends on the previous:

1. [0023-bar-data-model.md](0023-bar-data-model.md): the bars/bar_members/bar_recipes/bar_menu_items/bar_ingredient_stock/bar_invites/pinned_recipes schema and RLS, plus the "Service" tab shell and empty/no-bar-joined states.
2. [0023-search-and-shorthand.md](0023-search-and-shorthand.md): the alias table, ingredient overlap RPC, and unified ranked search, built once bar data exists to rank against.
3. [0023-quick-build-mode.md](0023-quick-build-mode.md): the Quick Build screen itself, which reads both the bar data and search result to open a recipe.

## Consequences

**Positive**:
- Bartenders get a purpose built, fast workflow instead of squeezing professional use out of the consumer recipe browser.
- A bar's house recipes, menu, and 86 list become real shared data, useful beyond this feature (e.g. a future POS integration or printed menu export could read the same tables).

**Negative / tradeoffs**:
- Introduces the app's first multi user, multi tenant data model; every `bar_*` table needs its own RLS policy tested, which is meaningfully more security surface than the rest of the app's single owner tables.
- Requires linked (non anonymous) accounts for shared bar data, a new constraint the rest of the app doesn't have.

**Neutral**:
- `apps/web` gets no equivalent; if a back office or POS browser view is wanted later, it is a new follow up feature, not part of this one.

## Follow-up

- [ ] No scope row exists yet for "Bartender Mode" in `docs/scope/scope.md`. Recommend enrolling it as a new feature (or a small set of features, one per child spec) via `/scope` before `/develop` starts building, so status can be tracked per the project's normal workflow.
- [ ] Ingredient substitution suggestions when an ingredient is 86'd, a shared "recently made" shift log visible to all staff, and a training/quiz mode were all raised in the original brief and deliberately deferred; each is a real follow up feature once this ships.
- [ ] Build order note: the umbrella's build order (data model, then search, then Quick Build Mode) puts the riskiest and least reversible work (a new multi tenant schema and its RLS policies) before any evidence that the UI actually meets the stated 2 to 3 second retrieval goal. Consider validating Quick Build Mode and search against catalog recipes only first (no bar dependency required for either to work per their own acceptance criteria, e.g. search AC-4 and Quick Build AC-1 both work with no bar), before investing further in bar management screens, if an early read on the core speed goal is wanted before committing to the full build.
