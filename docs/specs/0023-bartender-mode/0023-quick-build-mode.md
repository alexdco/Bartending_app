# 0023. Quick Build Mode

## Summary

Quick Build Mode is the single recipe screen a bartender opens mid shift: large text, high contrast, nothing but what's needed to build the drink correctly. It shows the measurements, the method as one bold line ("SHAKE then DOUBLE STRAIN"), the glass, ice, and garnish, with a toggle between ounces, milliliters, and proportional "parts", and an option to keep the screen from locking while it's open. No photos, no history, no extra taps beyond what building the drink requires. Because a bar's own wifi is often unreliable, this screen also persists what a bartender has already opened to the device's storage, so it keeps working after the app is fully closed and reopened with no signal. Originally mobile only; this revision adds a web equivalent with the same requirements, using the browser Screen Wake Lock API in place of `expo-keep-awake` and a `localStorage` backed persister in place of `AsyncStorage`, since web has no native equivalent to either.

## Requirements

**User stories**:
- As a bartender, I want to open a recipe and immediately see only the measurements and method in large text, so I can read it at a glance in a dark, busy bar.
- As a bartender, I want to switch between oz, ml, and parts without leaving the screen, so I can match whatever unit I'm already measuring in.
- As a bartender, I want the screen to stay on while I'm mid pour, so it doesn't lock and force me to unlock one handed with sticky hands.
- As a bartender, I want to get back to search in one motion, so moving to the next order costs no time.

**Acceptance criteria**:
- **AC-1**: Opening a recipe (catalog or house) from search or the menu opens Quick Build Mode directly, showing name, each ingredient's amount and name in large type, the method/straining line, glass, ice, and garnish, with no photo, history, or educational content on screen.
- **AC-2**: A unit toggle (oz / ml / parts) is always visible and switches every ingredient's displayed amount immediately, with no page reload or re-navigation. The default unit shown on open is the user's last chosen unit for Quick Build Mode (persisted locally, defaulting to `oz` the first time), not tied to any particular recipe.
- **AC-3**: A keep-awake toggle, when on, prevents the device screen from auto locking for as long as Quick Build Mode stays open, and has no effect on any other screen. On web, where the underlying browser API (Screen Wake Lock) is not universally supported, the toggle renders visibly disabled with a one line note in place of silently doing nothing on a browser that lacks it.
- **AC-4**: A back control (header back button, reachable one handed, plus the native edge swipe gesture) returns to the previous search or list state, preserving whatever the bartender had typed or scrolled to. On web, browser back is the equivalent of the edge swipe gesture (no additional gesture is built); the search query is kept in the URL (e.g. `/service/search?q=`) specifically so browser back restores it, matching the "preserving whatever was typed" half of this requirement, not just navigating back to a blank page.
- **AC-5**: Opening a recipe in Quick Build Mode appends it to the viewing user's client side recently viewed list (used for the "recently made" section and the search recency tier), with no separate action required.
- **AC-6**: Quick Build Mode renders correctly from persisted local storage with no network connection, for any recipe or house recipe the user has already loaded at least once, including after the app has been fully closed and reopened (not just within the same session). A recipe never opened before, with no connection, shows a clear "no connection, not available offline" state rather than an infinite loading spinner. On web this means the browser tab, once closed and reopened with no connection, still renders a previously viewed recipe from `localStorage` backed persisted data, the same guarantee mobile gets from `AsyncStorage`.
- **AC-7**: A house recipe missing a `method`/`straining` value (an older row, or one the bartender left blank) shows no broken or empty bold line; it omits that line rather than displaying blank text.
- **AC-8**: An ingredient whose amount cannot be parsed into a numeric value and unit (e.g. "2 dashes", "a splash") displays its original recipe text unchanged in every unit mode, including "parts"; it is excluded from the parts ratio calculation rather than breaking it.
- **AC-9**: When a bartender is removed from a bar (or leaves), that bar's persisted offline data (house recipes, menu) is cleared from their device on next app foreground with connectivity (mobile) or window focus / a periodic check (web), and the bar no longer appears in their switcher. On web, the entire persisted cache (not just the removed bar's data) is also cleared on sign-out and whenever the signed-in user changes, so a shared back-bar terminal never restores a previous user's bar data for the next person who signs in.

## Options considered

### Option 1: Reuse the existing recipe detail screen with a "focus mode" view toggle

Add a Bartender Mode flag to the existing `apps/mobile/src/app/recipe/[id]/index.tsx` screen that hides sections (photo, recommendations, history) and enlarges the remaining text, rather than building a new route.

**Pros**:
- Less new code; one screen serves both audiences.

**Cons**:
- The existing screen's data fetching, layout, and state are all built around the consumer experience (`useRecipeDetail`, `RecommendationsSection`, `BatchPanel` conditionally shown); bending it to also serve a fundamentally different, house-recipe-aware, offline-tolerant use case makes both harder to reason about and change independently over time.
- House recipes (`bar_recipes`) are a different shape from catalog `recipes`; a single screen would need to branch its data fetching internally, which is exactly the kind of conditional complexity a "folder by feature" convention is meant to avoid.

### Option 2: A dedicated Quick Build Mode route and component tree

A new route (e.g. `apps/mobile/src/app/bartender/build/[kind]/[id].tsx`, where `kind` is `recipe` or `bar_recipe`) with its own minimal component tree, reading whichever data source `kind` indicates.

**Pros**:
- Purpose built: every requirement (large type, keep awake, offline tolerant, unit toggle) is designed in from the start rather than retrofitted onto a screen built for something else.
- Matches the project's folder by feature convention; Bartender Mode's code stays self contained under its own feature folder rather than spreading conditionals through the consumer recipe feature.

**Cons**:
- Some duplication with the existing recipe detail screen (ingredient list rendering, unit formatting) that Option 1 would have shared directly; mitigated by both pulling from the same `packages/shared` unit conversion functions.

## Decision

**Chosen option**: Option 2: a dedicated Quick Build Mode route and component tree under the Bartender Mode feature folder.

## Rationale

The two screens optimize for opposite things (discovery and richness versus speed and minimalism), and the brief is explicit that Quick Build Mode must remove, not hide behind a flag, the consumer content. A shared screen with a mode branch would accumulate exactly the kind of conditional complexity `AGENTS.md`'s folder-by-feature convention exists to avoid. The real shared logic, unit conversion and formatting, already lives in `packages/shared/src/units.ts` and is reused directly, so the duplication cost of Option 2 is limited to layout and screen composition, not business logic.

### A second, narrower decision: offline persistence across app restarts

The project's TanStack Query client (`apps/mobile/src/app/_layout.tsx`) is configured as a plain in memory `QueryClient` today; its cache does not survive an app restart. AC-6 requires Quick Build Mode to work after the app has been fully closed and reopened with no signal, which an in memory cache cannot deliver on its own.

**Option A: add an AsyncStorage backed query persister (chosen).** Use `@tanstack/query-async-storage-persister` with `PersistQueryClientProvider`, persisting the `fetch_recipe_detail`/`fetch_bar_recipe_detail` query keys (and the bar service data query from the data model spec) to `AsyncStorage`, with an explicit `maxAge` and a buster key tied to the app version. Pro: actually satisfies AC-6 as written, matching the brief's explicit "bar basement with bad signal" scenario, which is exactly when a phone is most likely to have been restarted or backgrounded for hours. Con: a new dependency, and a small amount of cache invalidation logic (evicting a bar's data on membership removal, per AC-9) that a pure in memory cache would not need.

**Option B: narrow AC-6 to the current session only.** Keep the in memory cache as is; offline rendering only works for a recipe already opened earlier in the same app session. Pro: no new dependency, ships faster. Con: fails the exact real world scenario (phone restarted, no signal) the brief calls out; a materially smaller feature than what was asked for.

Option A was chosen because the offline scenario named in the brief is specifically the kind that survives an app restart (a phone left in a bag in a basement, reopened hours later), which Option B cannot address at all.

## Rationale (offline persistence)

The persister's cost, one new small dependency plus explicit eviction rules, is accepted because AC-6 without it would be true only in the easy case (same session) and false in the exact case the brief describes as the reason offline support matters. Eviction on bar removal (AC-9) is not optional once persistence exists across restarts; without it, a removed staff member's device would keep a stale but fully offline-readable copy of a bar's house recipes indefinitely, which the RLS layer alone cannot prevent (RLS only stops new reads, not display of already persisted data).

## Feature design

**Data model sketch**: no new tables; reads `recipes`/`recipe_ingredients` (with the new `method`/`straining` columns from the data model child spec) or `bar_recipes`/`bar_recipe_ingredients` depending on `kind`. No schema change originates in this child spec.

**State transitions**: not applicable (a display screen, no entity lifecycle).

**API surface**:

| Endpoint | Method | Key inputs | Key outputs | Auth | Key errors |
|---|---|---|---|---|---|
| `fetch_recipe_detail` (existing RPC, reused) | RPC | `recipe_id` | full catalog recipe + ingredients | any | 404 not found |
| `fetch_bar_recipe_detail` | RPC (new) | `bar_recipe_id` | full house recipe + ingredients | member of the recipe's `bar_id` | 403 not a member, 404 not found |

**Value sourcing**:

| Action | Value produced / displayed | Source |
|---|---|---|
| Quick Build Mode render | The bold method line ("SHAKE then DOUBLE STRAIN") | `method` + `straining` columns (catalog `recipes` or `bar_recipes`, depending on `kind`); omitted entirely when both are null, per AC-7 |
| Unit toggle | Each ingredient's displayed amount in oz/ml | `packages/shared/src/units.ts` `convertAmount`/`formatOunces`, applied to `amount_value`/`amount_unit`, unchanged from the existing `BatchPanel` usage. Note: this screen's toggle is `oz`/`ml`/`parts` only, deliberately dropping the `cl` option `units.ts`'s `CONVERTIBLE_UNITS` also supports; `cl` is not a unit bartenders measure in during live service, unlike the `BatchPanel`'s prep/batch context where it stays useful |
| Unit toggle | The default unit shown on open (AC-2) | Persisted locally (e.g. `AsyncStorage`, one value, not per recipe) from the last unit the bartender selected in Quick Build Mode; `oz` the first time it's ever opened |
| Unit toggle ("parts") | Each ingredient's displayed amount as a ratio | Computed client side, only over ingredients with a parseable `amount_value`/`amount_unit` (see AC-8 for the rest): convert every parseable ingredient's amount to a common unit (ml) via `convertAmount`, divide each by the minimum ml value among them, round to the nearest quarter, then clamp the result to a minimum displayed value of `0.25` (never displaying `0`) so a very small ingredient relative to a very large one still shows a nonzero part |
| Unit toggle ("parts"), unparseable ingredient | The displayed text for an ingredient like "2 dashes" | The ingredient's original `measure`/free text as stored (not run through the ratio calculation at all), matching how `packages/shared/src/batch.ts` already handles an "unscaled" line in `BatchPanel` |
| Keep-awake toggle (mobile) | Whether the screen stays on | Local component state calling Expo's `activateKeepAwakeAsync`/`deactivateKeepAwake` (`expo-keep-awake`, already part of the Expo SDK) on mount/unmount of the toggle's "on" state; not persisted, resets to off each time Quick Build Mode opens |
| Keep-awake toggle (web) | Whether the browser tab stays awake, and whether the toggle is even usable | `navigator.wakeLock.request('screen')`, requested inside the click handler that turns the toggle on; the returned `WakeLockSentinel` is released on unmount, toggle off, or the tab losing visibility, matching mobile's "no leak to another screen" invariant. Support is checked via `'wakeLock' in navigator`; when false, the toggle renders `disabled` with a one line note, never silently no-oping. Because the Wake Lock API auto releases on `visibilitychange` (tab hidden), a `visibilitychange` listener re-requests the lock when the tab becomes visible again while the toggle is still "on"; without this, switching tabs for a moment and returning would leave the toggle showing "on" while the screen can lock again |
| Recently viewed append | The recipe id added to the list | The opened recipe's `id` (or `bar_recipe_id`) and a new `kind` field, appended via an updated `recentlyViewed.ts` (see Migration note below), cap 20 |
| Offline render (same session) | Cached recipe data shown with no network, same app session | TanStack Query's in memory cache for the `fetch_recipe_detail`/`fetch_bar_recipe_detail` query key, `staleTime` 5 minutes; identical on mobile and web, no platform difference |
| Offline render, across restarts (mobile) | Cached recipe data shown with no network, after the app was fully closed and reopened | `@tanstack/query-async-storage-persister` backed by `AsyncStorage`, persisting the same query keys plus the bar service data query, `maxAge` 24 hours, buster key tied to the app version so a shipped schema change never deserializes stale incompatible data |
| Offline render, across restarts (web) | Cached recipe data shown with no network, after the browser tab was fully closed and reopened | The same `@tanstack/query-async-storage-persister`, backed by a dedicated adapter module (`apps/web/src/service/local-storage-persister.ts`), not raw `window.localStorage` passed in directly: `createAsyncStoragePersister`'s `storage` option expects `getItem`/`setItem`/`removeItem` returning promise-compatible values, while `localStorage`'s methods are synchronous, so the adapter wraps each call to resolve/reject correctly, guards every access against `typeof window === "undefined"` (no `window` exists during Next.js server rendering), and wraps in `try`/`catch` for private-browsing or storage-quota failures (`localStorage` throws rather than silently failing, unlike `AsyncStorage`). Same query keys, same `maxAge`, same buster key convention as mobile |
| No-cache-and-offline render (AC-6) | The "not available offline" state | Client side, identical logic on both platforms: if the query has no cached data (fresh or persisted) and the network request fails, render the explicit empty state rather than an indefinite spinner |
| Bar removal eviction (AC-9) | Which persisted queries to clear | On next successful `fetch_bar_service_data`, a foreground/focus check, or (web) a periodic check: compare the user's current `bar_members` rows against any persisted bar scoped query keys on device, and evict (via the persister's client) any key for a `bar_id` no longer present. Mobile checks on app foreground; web checks on window focus (TanStack Query's existing refetch-on-window-focus default) plus a 5 minute interval fallback, since a browser tab left open and unfocused for a full shift may never fire a focus event |
| Sign-out cache clear (web, shared-terminal safety) | Whether a departing user's persisted cache is visible to the next person on the same browser | On sign-out, and whenever `auth.uid()` changes (a new sign-in on the same browser/tab), the web app clears every `bar-service-data`/`quick-build-recipe` prefixed key from the `localStorage` backed persister before the next query can rehydrate from it; this has no mobile equivalent because a phone is already scoped to one person, but a shared back-bar terminal is a named web use case where the previous user's bar data must never be visible to the next sign-in |

**Key invariants**:
- The unit toggle never changes which ingredients are shown or their order, only the displayed amount and unit label.
- Keep-awake state never leaks to another screen; it is deactivated on unmount unconditionally, including on back navigation and app backgrounding.
- A "parts" ratio is never displayed as `0`; the clamp to a minimum of `0.25` always applies.
- An unparseable ingredient amount is never silently dropped from display in any unit mode; it always shows its original text.
- Persisted offline data for a bar the user is no longer a member of is never displayed once eviction runs; RLS prevents new reads of it, but the persisted copy must be actively cleared, not just left stale, per AC-9.

**Security model**: `fetch_bar_recipe_detail` requires membership in the recipe's `bar_id`, checked server side, matching the data model spec's RLS pattern. `fetch_recipe_detail` is unchanged (public catalog data, no auth required). The `AsyncStorage` backed persister stores data on device only, scoped to the app's own storage sandbox (standard `AsyncStorage` behavior, no shared/external storage used); it is cleared on bar removal per AC-9 and on app uninstall/data clear like any other app storage. No new PII or compliance scope.

**Configuration required**: none; `expo-keep-awake` is part of the existing Expo SDK already in use, `@tanstack/query-async-storage-persister` is a small new dependency (shared by both platforms, backed by `AsyncStorage` on mobile and `localStorage` on web), and the Screen Wake Lock API is a browser built-in with no new dependency at all. None require third party credentials.

**Critical test scenarios**:
- Happy path: opening a house recipe with a full method/straining set renders the bold line, correct ingredient amounts in the default unit, and appends it to recently viewed, verifies **AC-1, AC-5**.
- Happy path: toggling oz to parts recalculates every ingredient's ratio against the smallest amount with no navigation, verifies **AC-2**.
- Failure case: opening a previously viewed recipe, force closing the app entirely, then reopening in airplane mode, still renders full content from the persisted cache, verifies **AC-6**.
- Failure case (web equivalent): opening a previously viewed recipe, fully closing the browser tab, then reopening it with the network disabled, still renders full content from the `localStorage` backed persisted cache, verifies **AC-6**.
- Failure case: opening a recipe never viewed before, in airplane mode (or web: network disabled), shows the explicit "not available offline" state, not an infinite spinner, verifies **AC-6**.
- Edge case: a house recipe with no `method`/`straining` set renders with that line omitted, not blank, verifies **AC-7**.
- Edge case: a recipe with one ingredient measured as "2 dashes" toggled to parts mode shows that ingredient's original text unchanged and computes the other ingredients' ratios normally, verifies **AC-8**.
- Edge case: a recipe with a 0.25 oz ingredient and a 1 cup ingredient toggled to parts mode shows the smaller ingredient as `0.25` parts, never `0`, verifies **AC-8**.
- Edge case: a staff member is removed from a bar while their device holds persisted offline data for it; on next foreground with connectivity (mobile) or window focus (web), that bar's persisted data is cleared and it disappears from their bar switcher, verifies **AC-9**.
- Edge case (web only): the keep-awake toggle on a browser that does not implement `navigator.wakeLock` renders disabled with its note, and never throws or silently no-ops, verifies **AC-3**'s web fallback behavior.
- Auth/permission: a user who is not a member of a house recipe's bar cannot open it in Quick Build Mode (attempting the route directly is denied by `fetch_bar_recipe_detail`'s RLS check), verifies the security model above; identical on web since the RLS check is server side.

## Build plan

1. [x] `packages/shared`: the "parts" ratio calculation function (`packages/shared/src/parts.ts`; handles the unparseable-ingredient pass-through and the 0.25 clamp) and the `fetch_bar_recipe_detail` RPC's typed wrapper (`fetchQuickBuildBarRecipeDetail` in `bar.ts`). Satisfies **AC-2, AC-8**.
2. [x] Migration: `fetch_bar_recipe_detail` RPC. Satisfies **AC-1**. Applied live; also required an unplanned second migration extending the existing `fetch_recipe_detail` RPC to surface `method`/`straining` (`supabase/migrations/20260915200100_bartender_fetch_recipe_detail_method_straining.sql`) — those columns existed on `recipes` from the bar data model spec but were never added to this RPC's return shape, which would have silently left catalog recipes with no method/straining line in Quick Build Mode.
3. [x] **Deviation from the literal plan**: rather than changing `recentlyViewed.ts`'s shared shape (used by the homepage and recommendations features on both apps, which assume every stored id is a catalog recipe id looked up directly in `recipes`), a new, separate module (`packages/shared/src/bartenderRecentlyViewed.ts`, `{ id, kind }` entries) and its own device storage key were added instead. Mixing `bar_recipe` ids into the existing list would have silently broken `fetchRecipeRecommendations`/`fetchRecipesByIds` lookups on both platforms. This was raised to the engineer during the build and chosen over the literal spec text; the existing `recentlyViewed.ts` is untouched. Satisfies **AC-5**.
4. [x] `apps/mobile`: the new Quick Build Mode route and component tree (`apps/mobile/src/app/bartender-build/[kind]/[id].tsx`; large type layout using the existing `display` scale as the largest available token — no new type scale was added, per the engineer's choice during the build — method/straining line with the omit-when-null rule, unit toggle defaulting to the last used unit, glass/ice/garnish). Satisfies **AC-1, AC-2, AC-7**.
5. [x] `apps/mobile`: keep-awake toggle wired to `expo-keep-awake` (newly installed dependency), back button (edge swipe is Expo Router's native default, not additional code) preserving prior search/list state via normal back navigation, recently viewed append on open. Satisfies **AC-3, AC-4, AC-5**.
6. [x] `apps/mobile`: added `@tanstack/query-async-storage-persister` and `@tanstack/react-query-persist-client`, wrapped the existing `QueryClient` in `_layout.tsx` with `PersistQueryClientProvider`, persisting only the `bar-service-data` and `quick-build-recipe` query key prefixes (not the whole cache) with a 24 hour `maxAge` and a manually versioned buster string (`bartender-mode-v1`, bumped when a persisted shape changes, rather than tied to the app's semver which doesn't necessarily change alongside a query shape); the "not available offline" empty state renders when a query errors with no cached data. Satisfies **AC-6**.
7. [x] `apps/mobile`: the bar removal eviction check (`use-bar-removal-eviction.ts`), mounted globally in `_layout.tsx` so it isn't tied to any one screen, running on mount and on every app foreground transition while a linked session exists; compares live `bar_members` (via `fetchMyBars`) against persisted `bar-service-data` query keys and evicts orphaned ones. Satisfies **AC-9**.
8. [x] `apps/web`: the Quick Build Mode route under the existing locale segment (`apps/web/src/app/[locale]/service/build/[kind]/[id]/page.tsx`, matching every other web route's `[locale]` nesting), reusing `packages/shared/src/parts.ts` and the bar/recipe detail fetch wrappers unchanged; large type layout using the existing `display` token (mirroring mobile's choice of reusing `display` rather than adding a new scale step), method/straining omit-when-null rule, unit toggle defaulting to the last used unit (persisted via `localStorage`), glass/ice/garnish. Satisfies **AC-1, AC-2, AC-7**.
9. [x] `apps/web`: keep-awake toggle wired to `navigator.wakeLock` (`apps/web/src/service/quick-build-page-client.tsx`'s `useWakeLock`) with the disabled/unsupported fallback state and a `visibilitychange` re-acquire while the toggle is on, a back control returning to the prior search/list state (browser back, with the search query kept in the URL so it restores on return, per AC-4), recently viewed append on open (`apps/web/src/service/bartender-recently-viewed-storage.ts`, a `localStorage` port of mobile's `AsyncStorage` adapter). Satisfies **AC-3, AC-4, AC-5**.
10. [x] `apps/web`: added `@tanstack/query-async-storage-persister`, `@tanstack/react-query-persist-client`, and `@tanstack/query-persist-client-core` (a transitive peer of the persist-client package, added directly rather than relying on hoisting) to `apps/web`; built the `localStorage` backed adapter module (`apps/web/src/service/local-storage-persister.ts`, SSR-guarded, promise-wrapped, try/catch on quota/private-browsing failures); wrapped the existing `QueryClient` in `apps/web/src/app/[locale]/providers.tsx` with `PersistQueryClientProvider`, the same query key prefixes and `maxAge`/buster convention as mobile's step 6. **Deviation found and fixed during the build**: `PersistQueryClientProvider` does not establish its `QueryClient` context synchronously during Next.js's server-executed static prerender pass, so any descendant calling `useQuery`/`useQueryClient` threw `"No QueryClient set"` and broke `next build`'s static generation for every page in the app, not just Service ones (confirmed by reverting to a plain `QueryClientProvider` and observing the same build succeed). Fixed by rendering a plain `QueryClientProvider` (same `QueryClient` instance) until the client has mounted (`useSyncExternalStore`-based `useHasMounted`, matching the existing `consent-banner.tsx` pattern for this exact SSR/client divergence), then switching to `PersistQueryClientProvider` post-mount; verified with a full `next build` (all 35 routes statically generate cleanly) after the fix. Satisfies **AC-6**.
11. [x] `apps/web`: the bar removal eviction check (`apps/web/src/service/use-bar-removal-eviction.ts`), mirroring mobile's step 7 logic but triggered on window focus plus a 5 minute interval fallback (since a browser tab left open unfocused for a shift may never fire a focus event), mounted in `[locale]/providers.tsx` (the same file the persister wraps in step 10). Satisfies **AC-9**.
12. [x] `apps/web`: clear the entire persisted cache (every `bar-service-data`/`quick-build-recipe` key) on sign-out and whenever the signed-in user's `auth.uid()` changes, so a shared back-bar terminal never rehydrates a previous user's bar data for the next sign-in. Wired into `[locale]/providers.tsx` via a `session.user.id` change effect that clears matching queries from the `QueryClient` cache. Satisfies **AC-9**'s shared-terminal clause.

## Consequences

**Positive**:
- A screen designed entirely around the 2 to 3 second retrieval goal, with no compromise from sharing layout with the consumer detail screen.
- Reuses proven unit conversion logic (`units.ts`), so the oz/ml toggle behaves identically to the existing `BatchPanel` bartenders may already be familiar with.

**Negative / tradeoffs**:
- Some ingredient list rendering logic is duplicated between this screen and the existing recipe detail screen rather than shared, accepted per the Rationale above.
- Cached offline data can go stale (e.g. a menu change made by another staff member won't show until reconnect); acceptable given the alternative (no offline support at all) is worse for the stated real world condition of unreliable bar connectivity.
- A new dependency (`@tanstack/query-async-storage-persister`) and a small amount of eviction logic (AC-9) are added specifically to make the offline guarantee real across app restarts, rather than only within a session.
- `recentlyViewed.ts`'s stored shape changes (flat id list to `{ id, kind }`), requiring a one-time migration of any existing on-device data; a user's very first post-update read must not crash on the old shape.
- Web's keep-awake toggle is not equally reliable across browsers; a bartender on a browser without Screen Wake Lock support gets a disabled toggle instead of the working feature mobile always provides. This is an honest gap, not a silent one, but it is a real difference between platforms that a bar choosing a shared web terminal should know about.
- Two persister storage adapters (`AsyncStorage`, `localStorage`) now exist for the same offline guarantee; a future change to what gets persisted or how eviction works must be applied to both, not just one.

**Neutral**:
- The "parts" unit is a display only computation, never persisted; re-deriving it is cheap enough that no caching of the ratio itself is needed.

## Follow-up

- [ ] If the recently viewed list needs to become a shared "recently made" log visible to all staff on a shift, that requires server persistence and is a distinct follow up feature, out of scope here.
- [ ] No automated or manual verification has been run yet against a real device/simulator for this screen (no simulator available in this environment); typecheck, lint, and the live database calls tested via SQL are all green, but the actual React Native rendering, keep-awake behavior, and offline-after-restart scenario are unverified in the running app. Recommend `/check verify` or manual device testing before considering this done.
- [ ] Web parity (added by this revision): confirm current Screen Wake Lock browser support (MDN or caniuse) at build time rather than trusting this spec's knowledge, since browser API support tables change; the disabled-toggle fallback must be tested against whichever real browser currently lacks it, not assumed from documentation.
- [ ] Web parity: no automated or manual browser verification has been run yet either (this revision is a spec update, not a build); the same `/check verify` recommendation applies once `apps/web`'s build plan tasks (steps 8 to 11) are built.
- [ ] The `classify-method-and-aliases` backfill (see the search child spec's build plan) has not been run against the live catalog, so every catalog recipe's method/straining line is currently omitted (both fields null) until it runs.
