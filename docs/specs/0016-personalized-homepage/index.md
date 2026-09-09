# 0016. Personalized homepage

**Date**: 2026-09-09
**Status**: In Progress

## Summary

This replaces the current search first landing page with a browsable homepage: a short hero, a row of region shortcuts, and four scrollable carousels (drink ideas from your pantry, recommended drinks, recently viewed, and popular by region). It reuses ranking and matching logic that already exists from earlier features, adding only one small lookup helper (turning a list of recipe ids into full recipe cards). Search moves to its own page on web (mobile already has a dedicated Search tab). A new user with no activity yet still sees a useful page, just with fewer sections.

## Requirements

**User stories**:
- As a returning user with pantry and viewing activity, I want to land on a homepage that immediately shows me relevant drinks, so I don't have to go hunting through tabs.
- As a new or guest user with no activity yet, I want the homepage to still be useful (a stable default), so the app doesn't feel broken on first use.
- As any user, I want to still reach full text search easily, so personalization never gets in the way of finding a specific drink.

**Acceptance criteria**:
- **AC-1**: Web's `/` route and mobile's Home tab both render the homepage: a hero, a region shortcut row (when region data exists), and up to four carousels, in this order: drink ideas from pantry, recommended drinks, recently viewed, popular by region.
- **AC-2**: Each carousel shows at most `HOMEPAGE_CAROUSEL_LIMIT` (10) items in a single horizontally scrollable row, taken as the first 10 of that feature's existing data function's normal result (never a changed page size param), and reflects the current pantry, session, and recent view state exactly as its dedicated page would.
- **AC-3**: The drink ideas and popular by region carousels each have a "see more" action navigating to that feature's existing full page (Drink Ideas page/tab; Popular page/tab at the region shown, via its real route). The recommended drinks and recently viewed carousels have no "see more" action; neither has a recipe agnostic full list page today.
- **AC-4**: When recently viewed has no items (new user, cleared history, or the bulk recipe fetch for those ids returns nothing), that carousel and its heading are omitted entirely; the page does not show an empty state for it.
- **AC-5**: When the drink ideas query settles successfully with zero matches, the drink ideas carousel is replaced by a single call to action card prompting the user to add pantry items, linking to the Pantry page/tab. An in flight or errored query is handled per AC-9, not this rule.
- **AC-6**: When no region has popularity data yet (`listPopularRegions` returns empty), both the region shortcut row and the popular by region carousel are omitted entirely.
- **AC-7**: The region shortcut row renders one pill per region returned by `listPopularRegions`, in the order it returns them (already alphabetical, and distinct, so no tie break is needed). Tapping a region pill navigates to the Popular page/tab for that region; it does not change the homepage's own popular by region carousel, which stays fixed to the first region and is headed with that region's name (e.g. "Popular in American") so it never reads as the pill row's filtered output.
- **AC-8**: The hero renders a static tagline and a search entry point (a button or input) that navigates to the dedicated search route (web `/search`, mobile's existing Search tab); the hero needs no per-user data and never fails.
- **AC-9**: Each carousel loads and fails independently. While pending, it reserves its final height with a skeleton row (never a layout shift when it resolves). A source that settles successfully but empty is handled by that source's own rule (AC-4, AC-6) or is simply omitted (recommendations, on a genuinely empty result). A source that errors with anything other than a missing/invalid session is reported to Sentry and the section is omitted. A source that errors because the anonymous or signed in session is missing or invalid (drink ideas' or recommendations' `28000`) is NOT silently omitted: the page shows one dismissible, page level retry banner ("Something went wrong loading your homepage. Retry."), since this looks identical to "new user, no activity" otherwise and that ambiguity is what spec 0006's own error handling was written to avoid.
- **AC-10**: Web's new `/search` route carries the search experience currently at `/` (query, filters, results, the same server rendered `initialResults` and query aware title/OG behavior spec 0011 built), and is unconditionally `noindex, follow`. Web's `/` becomes the homepage with a static, non personalized title, description, and `canonical: "/"`, and stays indexable. A request to `/?q=<non-empty>` issues a 307 redirect to `/search?q=<same value>`, so existing indexed or bookmarked search links keep working; a bare `/` renders the homepage.
- **AC-11**: Mobile's unused `explore` tab (still the unmodified Expo starter screen, per `apps/mobile/src/app/explore.tsx`) is removed, its route file deleted, and its `NativeTabs.Trigger` entry dropped from `app-tabs.tsx`. `index` (now the real homepage) remains the first/default tab; the existing Search tab is unchanged in behavior and position.
- **AC-12**: The homepage requires no sign in; guest and signed in users both see it, each carousel scoped to their own existing session exactly as today.
- **AC-13**: Mobile's Popular screen accepts an optional `region` route param (via `useLocalSearchParams`) that seeds its selected region on mount, so a link from the homepage's "see more" or region pill can open it preset to a specific region.

## Decision

**Chosen option**: Option 3 for recommendations and popular by region (their dedicated page hooks are shaped for a different screen or carry no shared benefit); Option 1 for drink ideas specifically, since `useDrinkIdeas`'s query key carries no page specific state and the shared cache entry is also invalidated by the existing pantry mutation hooks (spec 0006), a real benefit worth keeping. See `rationale.md` for the options considered and why.

## Feature design

**Data model sketch**:

No new tables, columns, or migrations. This feature composes existing read paths, plus one new shared function needed to render the recently viewed carousel:
- `fetchDrinkIdeaMatches` (spec 0006) via pantry contents and session
- `fetchRecipeRecommendations` (spec 0009) via pantry contents, recently viewed, and session
- **`fetchRecipesByIds` (new, `packages/shared/src/recipes.ts`)**: `(client, ids: string[]) => Promise<RecipeSearchResult[]>`, a single `select ... where id in (...) and deleted_at is null`, re-sorted in application code back into the caller's `ids` order (Postgres `in` does not preserve order). Needed because the existing recently viewed storage (spec 0009, `recentlyViewed.ts` plus each app's storage adapter) holds only an array of recipe id strings, and no bulk lookup by id exists today; `fetchRecipeDetail` is single id and heavier (ingredients, instructions) than a card needs.
- `fetchPopularByRegion` and `listPopularRegions` (spec 0010) via region

**State transitions**: not applicable, this feature adds no new entity or lifecycle.

**API surface**:

One new function in `packages/shared` (`fetchRecipesByIds`, above); everything else is an existing Postgres function or shared fetch called directly (Option 3) or via its existing hook (Option 1, drink ideas only):

| Source | Function | Key inputs | Key outputs | Auth | Key errors |
|---|---|---|---|---|---|
| Drink ideas | `fetchDrinkIdeaMatches` via existing `useDrinkIdeas` hook | session, pantry contents | ranked matches, missing ingredients | session required | no session (28000) |
| Recommendations | `fetchRecipeRecommendations` (existing shared function, called directly under a homepage query key, `currentRecipeId: undefined`) | session, pantry, recent view ids | ranked recipes | session required | no session |
| Recently viewed | `fetchRecipesByIds` (new) fed by the existing local storage read | device local storage ids, then a DB lookup | up to 20 recent recipes, in view order | none (device local ids; DB read is unauthenticated like search) | storage unavailable (treated as empty) or a resulting id no longer exists (dropped, not an error) |
| Popular by region | `fetchPopularByRegion`, `listPopularRegions` (existing shared functions, called directly under a homepage query key) | region | ranked recipes per region | none | no regions tagged yet |

**Value sourcing**:

| Action | Value produced / displayed | Source |
|---|---|---|
| Render drink ideas carousel | ranked matches, missing ingredient labels | `fetchDrinkIdeaMatches` via `useDrinkIdeas`, first page sliced to 10; unchanged logic from spec 0006 |
| Render drink ideas call to action | whether the drink ideas query settled with zero matches | `useDrinkIdeas`'s own `isPending`/`isSuccess`/`data` state, per AC-5; no separate pantry size check |
| Render recommended drinks carousel | ranked recipes | `fetchRecipeRecommendations` called directly with `currentRecipeId: undefined`, `recentRecipeIds` from the existing recently viewed read, under query key `['home', 'recommendations']` |
| Render recently viewed carousel | recipe cards (id, name, image, alcoholic status) in view order | recipe ids from the existing per app recently viewed storage read, then `fetchRecipesByIds(ids)` (new), re-sorted into that id order |
| Render region shortcut row | list of regions | `listPopularRegions`, unchanged from spec 0010, called under query key `['home', 'popularRegions']` |
| Render popular by region carousel | ranked recipes for the first region | `fetchPopularByRegion(firstRegion)` where `firstRegion = listPopularRegions()[0]` (already alphabetically ordered and distinct per spec 0010's `order by ... asc`, so no tie break needed); the carousel heading names this region |
| Hero search entry point | none (static) | no data dependency, navigates to `/search` (web) or the Search tab (mobile) |
| "See more" targets | destination route | drink ideas → existing Drink Ideas route; popular by region → `/popular/${slugify(firstRegion, "region")}` (web) or the Popular tab with `region: firstRegion` as a route param (mobile, AC-13); recommendations and recently viewed have no "see more" (AC-3) |
| Region pill target | destination route | web: `/popular/${slugify(region, "region")}`; mobile: the Popular tab with `region` as a route param (AC-13) |
| `/?q=` redirect | destination URL | the incoming `q` search param, forwarded verbatim to `/search?q=<value>` (AC-10) |

No remaining undecided inputs: the three gaps the cross check found (recently viewed's missing bulk fetch, recommendations' recipe scoped hook, and the popular by region routes) are resolved above, each with a named source.

**Key invariants**:
- The homepage never invents new ranking, filtering, or matching logic; every ordering decision (drink idea ranking, recommendation scoring, popularity rank) stays exactly as its owning feature defined it. The one new function this feature adds (`fetchRecipesByIds`) does no ranking, it only looks up by id.
- A carousel never changes a source's page size parameter to fetch fewer rows; it always requests the source's normal page and slices to `HOMEPAGE_CAROUSEL_LIMIT` (10) client side, so no dedicated page's cached query is ever poisoned by a homepage originated smaller page.
- A carousel with zero items (settled successfully, no error) is omitted, never rendered as an empty shell with a heading and nothing under it, except the drink ideas call to action card (AC-5, replaces rather than omits) and a session error (AC-9, a page level banner rather than a silent omission).
- Every carousel slot reserves its final rendered height (a skeleton row) while its query is pending, so a later resolving carousel never shifts content already on screen.
- The homepage carries no server side redirect or gate based on sign in state, except the `/?q=` to `/search?q=` redirect (AC-10), which is unconditional and independent of session state.

**Security model**: No new authorization surface. Each underlying function keeps its existing session scoping and RLS enforcement (drink ideas and recommendations require an active session, already anonymous or signed in per spec 0005/0008; popular by region and recently viewed need no session). The homepage adds no new read or write path.

**Configuration required**: None. No new environment variables, secrets, or credentials.

**Critical test scenarios**:
- Happy path: a signed in user with pantry items, recent views, and a real region assigned sees all four carousels populated (recently viewed via the new `fetchRecipesByIds`) and can tap into any card to reach its recipe detail page, verifies **AC-1**, **AC-2**
- Failure case: drink ideas and recommendations both error with a missing session (`28000`) while popular by region succeeds; a page level retry banner appears (not a silent "no activity" look alike), popular by region still renders, verifies **AC-9**
- Auth/permission: a brand new guest with an empty pantry and no view history sees the hero, the drink ideas call to action card (its query settled with zero matches), and the recommendations cold start fallback, with recently viewed omitted, verifies **AC-4**, **AC-5**, **AC-12**

## Build plan

Ordered as one thin end to end slice first (Tracer Bullet, the project default), then thickened section by section, per platform pair so each carousel ships working on both apps before the next begins.

1. Build the shared horizontal carousel UI pattern on both platforms (web: CSS overflow-x flex row with scroll snap; mobile: horizontal `FlatList`), using existing `RecipeCard`, `Text`, and spacing tokens, a fixed card width and gap (`Spacing.three`), and a skeleton row placeholder for the pending state; no new dependency, satisfies **AC-2**, **AC-9**
2. Add web's `/search` route carrying the current `SearchPageClient`, its server rendered `initialResults`, and its query aware title/OG behavior, now unconditionally `noindex, follow`; rewrite web's `/` to a minimal shell (hero only) with a static title/description and `canonical: "/"`; add the `/?q=<value>` to `/search?q=<value>` redirect, satisfies **AC-8**, **AC-10**
3. Remove mobile's unused `explore` tab and its route file; confirm `index` (the real homepage) is first/default and the existing Search tab is otherwise untouched, satisfies **AC-11**
4. Build the hero (tagline plus search entry point) on both platforms and wire web's `/` and mobile's Home tab to render it, satisfies **AC-8**
5. Add the drink ideas from pantry carousel (existing `fetchDrinkIdeaMatches`/`useDrinkIdeas` hook, first page sliced to 10) plus its zero match call to action card and the shared session error retry banner, on both platforms, satisfies **AC-1**, **AC-2**, **AC-3**, **AC-5**, **AC-9**
6. Add `fetchRecipesByIds` to `packages/shared/src/recipes.ts` (id list in, matching non deleted recipes out, re-sorted to the input order), then the recently viewed carousel (existing per app recently viewed id storage feeding the new function), including the omit when empty rule, on both platforms, satisfies **AC-1**, **AC-2**, **AC-4**, **AC-9**
7. Add the recommended drinks carousel, calling `fetchRecipeRecommendations` directly under a homepage owned query key (`currentRecipeId: undefined`, no "see more" link per AC-3), on both platforms, satisfies **AC-1**, **AC-2**, **AC-3**, **AC-9**
8. Add the region shortcut row and the popular by region carousel, calling `listPopularRegions`/`fetchPopularByRegion` directly under homepage owned query keys; add mobile's `region` route param support to the Popular screen (AC-13); wire web's region links to `/popular/${slugify(region, "region")}`; include the omit when no regions rule, on both platforms, satisfies **AC-1**, **AC-2**, **AC-3**, **AC-6**, **AC-7**, **AC-9**, **AC-13**
9. Confirm guest and signed in parity end to end on both platforms (all four carousels correctly scoped, no sign in gate anywhere on the page except the `/?q=` redirect), satisfies **AC-12**
10. Cross platform parity check: same carousel order, same 10 item cap, same "see more" targets, same omit and error handling rules on both apps

## Consequences

**Positive**:
- Four already built personalization features become visible on first load instead of requiring a user to already know a tab exists.
- No new backend surface or migration; a single new lookup function (`fetchRecipesByIds`) is the only addition to `packages/shared`, everything else composes shipped, already tested read paths.
- Search gets its own dedicated, indexable-or-not-by-design route on web, matching the SEO precedent set in spec 0011 (personalized/query pages stay `noindex`, the canonical brand root stays indexable); the `/?q=` redirect keeps existing indexed links and bookmarks working.

**Negative / tradeoffs**:
- The homepage introduces the app's first horizontal scrolling list pattern; it has no precedent to build on and needs its own accessibility pass (keyboard scroll on web, screen reader swipe behavior on mobile) that no other feature has needed yet.
- A user with an empty pantry, no view history, and no tagged region sees a homepage with only a hero and a drink ideas call to action card; this is a deliberately sparse "stable default," not a failure, but it is a visibly thinner first impression than a curated fallback would be.
- Recommendations and popular by region no longer share a query cache entry with their dedicated pages (Option 3): visiting the homepage then that dedicated page triggers one extra fetch it would not have under a fully shared cache. Judged an acceptable cost against forcing an ill fitting shared hook shape onto both screens.
- Spec 0011's AC-4 (query aware `noindex` behavior tied to `/`) and its sitemap assumptions about `/` being the search page are superseded by this spec; its `verify.md` should be re-run once this feature ships.

**Neutral**:
- Every carousel keeps its own independent query and failure boundary, so the homepage's total number of in flight requests on first load is roughly four times what any single dedicated page needed; each is small and capped to one page, so this is a request count increase, not a payload size increase.

## Follow-up

- [ ] Re-run spec 0011's `verify.md` once this ships; its AC-4 and sitemap assumptions about `/` being the search page are superseded here (see Consequences).
- [ ] Feature 16 (idle anonymous account cleanup job) remains undesigned; unrelated to this feature but still open in the scope.
- [ ] AC-9's "reported to Sentry" requirement can't be implemented yet: Sentry isn't installed in this codebase (scope feature 14, still `planned`). The recently viewed and homepage error paths log via `console.error` with a `TODO` marker instead; swap to `Sentry.captureException` once feature 14 lands.
