# 0023. Bartender Mode

**Date**: 2026-09-15
**Status**: In Progress

## Summary

Bartender Mode is a new, separate part of the app built for working bartenders during a shift, not for guests browsing recipes at home. It adds a shared "bar" (a venue or team) that staff can join, so house recipes, the current menu, and an out of stock ("86'd") ingredient list all stay in sync across everyone working there. The goal stated by the product owner is that a bartender can find the right recipe in about 2 to 3 seconds, so the whole design favors speed, large readable text, and as few taps as possible over discovery or education content. This spec is an umbrella: it ties together three focused child specs and holds the parts they all share. Originally mobile only; this revision extends full parity to `apps/web` (bar management, search, and Quick Build Mode all get a web equivalent), for a bar owner working at a desk or a shared back-bar terminal running a browser.

## Structure

This feature splits into three buildable parts, each its own child spec:

- [0023-bar-data-model.md](0023-bar-data-model.md): the shared bar (venue/team) data model, roles, invites, house recipes, the current menu, and the 86 (out of stock) list. Every other child depends on this.
- [0023-search-and-shorthand.md](0023-search-and-shorthand.md): the ranked search that powers the Service screen, including bartender shorthand ("old f" for Old Fashioned) and ingredient list queries ("gin campari vermouth" for Negroni).
- [0023-quick-build-mode.md](0023-quick-build-mode.md): the distraction free, high contrast single recipe screen a bartender opens to build a drink, including the oz / ml / parts toggle and keep screen awake option.

## Cross child contract

These rules are shared by all three child specs and must not be re-decided differently in any of them.

- **Platform**: `apps/mobile` (Expo Router, TanStack Query) and `apps/web` (Next.js App Router), full parity. Every capability (bar management, house recipes, menu, 86 list, search, Quick Build Mode) gets a build on both platforms; neither platform is the "lesser" version. Data model and RLS are already platform agnostic (Postgres, read by both apps through the same `packages/shared/src/bar.ts` functions), so this extension is additive: new `apps/web` routes and components reading the same tables and RPCs, with two platform specific decisions (keep-awake, offline persistence) resolved separately per platform below since neither has a native equivalent on web.
- **Entry point**: mobile keeps its existing bottom tab bar entry (`apps/mobile/src/components/app-tabs.tsx`, labeled "Service"). Web adds a new top level nav item, also labeled "Service", alongside the existing Search / Pantry / Drink Ideas / Popular / Favorites links in `apps/web/src/components/site-nav.tsx`, routed under the existing `[locale]` segment every other web route uses (`apps/web/src/app/[locale]/service/`, not a bare `apps/web/src/app/service/`), landing on the same bar switcher / no-bar-joined shell as mobile, localized the same way as the rest of the site.
- **Reused, not rebuilt**: `packages/shared/src/units.ts` (`parseMeasure`, `convertAmount`, `formatOunces`) for the oz/ml conversion in Quick Build Mode; `packages/shared/src/recentlyViewed.ts`'s list pattern (cap, append), extended with a `kind` field (see the Quick Build child spec's migration note) for the client side recently viewed list; the existing `search_recipes` Postgres RPC as one input to the new ranked search, not replaced by it. One genuinely new piece of shared logic is needed: the "parts" ratio calculation, since `units.ts` has no proportional/ratio mode today; it is added alongside `units.ts`, not a rebuild of it. All of `packages/shared/src/bar.ts` (the `bar_*` query/mutation layer) is reused as is by both platforms with no changes; only each platform's own screen/route layer and local storage adapters are net new for web.
- **Auth**: bar membership, and every read or write to any `bar_*` table, requires a real, linked Supabase Auth account (not a bare anonymous session) at every access, not only when joining. This is enforced on the `SELECT` policy itself, not just on how a `bar_members` row gets created, so an anonymous session is denied even in a hypothetical case where it held a membership row; this holds identically on web, since it is enforced server side by RLS regardless of client. Personal data (pinned cocktails, the client side recently viewed list) works the same for anonymous or linked users on either platform, unchanged from today's `pantry_items` / `favorites` pattern.
- **Soft delete convention**: `bar_recipes` uses `deleted_at`, matching the existing `recipes` table's soft delete pattern already in production. This is a deliberate consistency choice with the established schema, not a default; a new project without that precedent should prefer an explicit `archived_at` pattern instead.
- **RLS shape**: every `bar_*` table scopes reads to `bar_members` rows for the requesting user (`auth.uid()`); write rules differ per table and are detailed in the data model child spec.
- **Keep-awake (web)**: Quick Build Mode's keep-awake toggle uses the browser Screen Wake Lock API (`navigator.wakeLock`) where supported, requested on the same user gesture that turns the toggle on (the API requires an active user gesture, not silent activation on page load). Where unsupported (notably older Safari/iOS versions), the toggle renders visibly disabled with a one line note ("not supported in this browser") rather than silently doing nothing; this is decided here once, not re-decided per child spec.
- **Offline persistence (web)**: Quick Build Mode's offline-after-restart guarantee (AC-6 in that child spec) extends to web via the same `@tanstack/query-async-storage-persister` pattern mobile uses, backed by a dedicated `localStorage` adapter module (not raw `window.localStorage`, since the persister expects a promise-compatible `getItem`/`setItem`/`removeItem` interface and `localStorage`'s methods are synchronous; see the Quick Build child spec's value sourcing table) instead of `AsyncStorage`. Same query key prefixes, same 24 hour `maxAge`, same version-tied buster key. A closed browser tab reopened with no signal renders a previously viewed recipe from the persisted cache, matching the mobile guarantee exactly.
- **Shared-terminal cache safety (web only)**: because a shared back-bar browser terminal is a named web use case (unlike mobile, one phone per person), the entire persisted cache is cleared on sign-out and whenever the signed-in user changes, so a departing bartender's bar data is never rehydrated for the next person who signs in on the same browser. This has no mobile equivalent and is decided once here, applied in the Quick Build child spec's build plan.

## Build plan

The three child specs each carry their own build plan. Build them in this order, since each depends on the previous. Mobile was built first (see each child spec's existing build plan); the web build plan items added by this revision follow the same order, per child spec, reusing the now-proven `packages/shared/src/bar.ts` layer with no changes:

1. [0023-bar-data-model.md](0023-bar-data-model.md): the bars/bar_members/bar_recipes/bar_menu_items/bar_ingredient_stock/bar_invites/pinned_recipes schema and RLS (done, mobile and web both read the same tables with no change needed), plus the "Service" shell and empty/no-bar-joined states on both the mobile tab and the new web nav item.
2. [0023-search-and-shorthand.md](0023-search-and-shorthand.md): the alias table, ingredient overlap RPC, and unified ranked search (done, backend is platform agnostic), plus a web search screen alongside the existing mobile one.
3. [0023-quick-build-mode.md](0023-quick-build-mode.md): the Quick Build screen itself on both platforms, including web's Screen Wake Lock keep-awake and `localStorage` backed offline persister (see Cross child contract above).

## Consequences

**Positive**:
- Bartenders get a purpose built, fast workflow instead of squeezing professional use out of the consumer recipe browser.
- A bar's house recipes, menu, and 86 list become real shared data, useful beyond this feature (e.g. a future POS integration or printed menu export could read the same tables).

**Negative / tradeoffs**:
- Introduces the app's first multi user, multi tenant data model; every `bar_*` table needs its own RLS policy tested, which is meaningfully more security surface than the rest of the app's single owner tables.
- Requires linked (non anonymous) accounts for shared bar data, a new constraint the rest of the app doesn't have.
- Full web parity roughly doubles the UI surface to build and keep in sync (every screen exists twice); two of Quick Build Mode's platform hooks (keep-awake, offline persistence) now have two implementations each to maintain, one per platform, rather than one shared implementation.
- The Screen Wake Lock API is not universally supported (notably some Safari/iOS versions); web's keep-awake toggle is honest about that gap rather than silently failing, but it means the feature is not equally reliable on every browser the way the native mobile API is.

**Neutral**:
- No new tables or RLS policies are needed for web parity; the entire data layer (`packages/shared/src/bar.ts`, every `bar_*` RPC) is already platform agnostic and reused unchanged.

## Follow-up

- [ ] No scope row exists yet for "Bartender Mode" in `docs/scope/scope.md`. Recommend enrolling it as a new feature (or a small set of features, one per child spec) via `/scope` before `/develop` starts building, so status can be tracked per the project's normal workflow.
- [ ] Ingredient substitution suggestions when an ingredient is 86'd, a shared "recently made" shift log visible to all staff, and a training/quiz mode were all raised in the original brief and deliberately deferred; each is a real follow up feature once this ships.
- [ ] Build order note: the umbrella's build order (data model, then search, then Quick Build Mode) puts the riskiest and least reversible work (a new multi tenant schema and its RLS policies) before any evidence that the UI actually meets the stated 2 to 3 second retrieval goal. Consider validating Quick Build Mode and search against catalog recipes only first (no bar dependency required for either to work per their own acceptance criteria, e.g. search AC-4 and Quick Build AC-1 both work with no bar), before investing further in bar management screens, if an early read on the core speed goal is wanted before committing to the full build.
- [ ] Web parity (added by this revision): each child spec's build plan now carries its own web build tasks; the scope row for feature 26 needs its milestone rollup updated to reflect that mobile shipped first and web is a new, separate set of milestones, not a rename of the existing ones.
- [ ] Test the Screen Wake Lock fallback (visibly disabled toggle, one line note) on a real unsupported browser before considering the Quick Build Mode web build done; do not assume from documentation alone which current browser versions lack support.
