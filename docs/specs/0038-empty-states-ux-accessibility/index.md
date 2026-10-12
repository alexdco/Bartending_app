# 0038. Empty states, UX polish, and accessibility

**Date**: 2026-10-12
**Status**: In Progress

## Summary

New visitors land on thin or blank pages, and a few controls are hard to use with a keyboard or screen reader. This spec fills the empty pages with a clear next step. It loads the missing "fame" data (how well known each drink is) so Popular, search, and a new home row of classics have something real to show. It also fixes the specific accessibility gaps found in the code. Nothing new is added to the stack. The work is one small migration, one run of an existing tagging script, and targeted fixes on web and mobile.

## Requirements

**User stories**:
- As a first time visitor, I want every page to show me something useful or tell me what to do next, so the app never feels broken or empty.
- As someone browsing without a search term, I want well known drinks first, so I see Margarita and Negroni before "A. J." and "A1".
- As someone who opened a shared recipe link, I want Back to take me somewhere sensible, not out of the site.
- As a keyboard or screen reader user, I want every control to be reachable, visible when focused, and announced once with the right name and state.

**Acceptance criteria**:
- **AC-1**: Every live recipe (`deleted_at is null`) has a `fame_score` from 0 to 100 after the tagging run. `region` stays optional; a recipe with no region still has a fame score. Popular by region keeps its spec 0010 behavior (recipes with a region, ranked by `popularity_rank`).
- **AC-2**: `search_recipes` with an empty query returns recipes ordered by `fame_score` descending (unscored last), then localized name, then id. With a text query, match bucket and match rank still lead; fame breaks ties before name. Paging through results never repeats or skips a recipe.
- **AC-3**: When at least one region is tagged, `/popular` (web) and the Popular tab (mobile) show regions. When none is tagged, the empty state says so and offers a "Browse all recipes" action that opens search (`/search` on web, the Search tab on mobile). An empty single region page offers the same action.
- **AC-4**: On home (web and mobile), when the recommendations list is empty, a "Classics to start with" row shows the 10 highest fame recipes as recipe cards, in place of the recommendations row. When recommendations exist, the classics row does not render. The classics row renders only after the recommendations query has succeeded with zero results: not while it is pending (no flash of classics before recommendations arrive) and not when it failed. When no recipe has a fame score, or the classics fetch fails, the classics row does not render (no error shown; it is an optional row).
- **AC-5**: On Drink ideas (web and mobile), when the pantry query has succeeded with zero items, no match query is sent. The page shows an empty state titled "Add a few ingredients to get ideas" with a button that opens the pantry (`/pantry` on web, the pantry screen on mobile). While the pantry is loading, a spinner shows; if it fails, the page's existing error state shows. The page heading still renders; the AI generate section stays hidden (it already needs two or more items).
- **AC-6**: The Service page (web and mobile) is never blank. While the profile or the current bar is loading it shows a spinner with an accessible label. If either load fails, it shows an error message and a Retry button that refetches whichever query failed. Both queries use `retry: 1` on this page, so the error appears within about a second instead of after three backoff retries. On web the `service/layout.tsx` owns the profile loading and error state, and `service-page-client.tsx` owns the current bar loading and error state. The redirect for users with bartender mode turned off is unchanged.
- **AC-7**: When a recipe has zero ratings, the rating summary shows no display stars, only the text "No ratings yet. Be the first to rate it." When it has one or more, it shows the stars and "4.2 (3 ratings)". On both platforms the display stars are announced once as a single summary ("Rated 4.2 out of 5 from 3 ratings", singular "from 1 rating"), not star by star: on web a container with `role="img"` and `aria-label`, individual stars `aria-hidden`; on mobile one `View` with `accessible` and `accessibilityLabel`, children hidden. The average shows one decimal, formatted with the locale's number format (`useFormatter().number` from next-intl on web, `Intl.NumberFormat` with the i18next language on mobile). The interactive rate control is unchanged.
- **AC-8**: On web, Back goes to the previous page when there is an in app page behind the current one. When there is none (they landed here from a shared link, search engine, new tab, or full reload, or they have already gone back to the page they landed on), Back replaces the current page with that page's logical parent from the fallback table below; home when no fallback is set. The locale prefix is kept. On mobile, the one raw `router.back()` in `bartender-build/[kind]/[id].tsx` uses the same can go back check and fallback as `BackButton`.
- **AC-9**: The recipe page hero image has alt text equal to the localized recipe name (web) or an `accessibilityLabel` with that name (mobile). Recipe card images stay decorative: `alt=""` on web, not separately focusable on mobile, since the card already names the recipe.
- **AC-10**: The favorite control has a fixed accessible name that includes the recipe ("Favorite Negroni") and carries its state separately: `aria-pressed` on web, `accessibilityRole="togglebutton"` with `accessibilityState={{ checked }}` on mobile. The name does not flip between add and remove. On recipe cards the favorite control is a sibling of the card link (web) or card pressable (mobile), never nested inside it, and the rest of the card stays fully clickable.
- **AC-11**: Every item in the web site nav dropdown menus shows a visible focus indicator (`color.focus`) when highlighted by keyboard, matching the global `:focus-visible` style.
- **AC-12**: On every web page, the first Tab press reveals a "Skip to content" link. Activating it moves focus to the start of the page content, past the nav. It is hidden until focused.
- **AC-13**: On mobile, the rows on Learn (index and category), the Popular region picker, and Quizzes are announced as buttons with the row's title as their label and have at least a 44 by 44 point touch target.
- **AC-14**: The web ESLint config enables `eslint-plugin-jsx-a11y`'s recommended rule set, and `pnpm --filter web lint` passes with it.
- **AC-15**: Every string this feature adds or rewords exists in English and Spanish: in `apps/web/messages/{en,es}.json` on web and in `apps/mobile/src/i18n/locales/{en,es}.json` through i18next on mobile.

## Decision

**Chosen option**: Option 1: Fix in place, backed by the fame score.

Fix each gap where it lives, and use one new data signal (an LLM judged fame score for every recipe, loaded once through the existing spec 0010 tagging pipeline) to power Popular, the default search order, and the home classics row.

**Implementation skills**: `supabase-postgres-best-practices` (`supabase/agent-skills`, `.agents/skills/supabase-postgres-best-practices/`) · `nextjs-app-router-patterns` (`wshobson/agents`, `.agents/skills/nextjs-app-router-patterns/`) · `react-native-best-practices` (`callstackincubator/agent-skills`, `.agents/skills/react-native-best-practices/`) · `i18next-localization` (`i18next/i18next-cli`, `.agents/skills/i18next-localization/`)

## Rationale

Reasoning and options: see [rationale.md](rationale.md).

## Feature design

**Data model sketch**:

No new tables. The `recipes` popularity columns already exist live but no migration in the repo creates them (drift from spec 0010). One migration codifies them and changes one rule:

| Table | Column | Type | Rule |
|---|---|---|---|
| `recipes` | `region` | text, nullable | unchanged (one of spec 0010's fixed regions, or null) |
| `recipes` | `fame_score` | smallint, nullable | `check (fame_score between 0 and 100)`. **Changed**: may be set when `region` is null. Null only means "not tagged yet". |
| `recipes` | `popularity_rank` | integer, nullable | unchanged: computed from `fame_score` within a region; null when `region` is null. Partial unique index on `(region, popularity_rank)` where both are not null. |

No new index: at 432 rows a sort is trivial, and the browse order sorts a union of CTEs that an index on `recipes` would not serve anyway. Revisit only if the catalog grows by an order of magnitude.

The migration uses `add column if not exists`, `create unique index if not exists`, and guards the check constraint with a `pg_constraint` lookup, so it is a no op on the live columns and creates them on a fresh database.

**API surface** (Postgres functions called through `packages/shared`; no Edge Function changes):

| Function | Change | Key inputs | Key outputs | Auth | Key errors |
|---|---|---|---|---|---|
| `search_recipes` | `create or replace` (signature and return table unchanged, so no drop). All four CTEs (`name_matches`, `name_trgm_matches`, `ingredient_matches`, `browse_all`) also select `r.fame_score` so the `union all` lines up; final `order by match_bucket asc, rank desc, fame_score desc nulls last, name asc, id asc`. Return columns unchanged. With a text query, `rank` is a float and rarely ties, so fame mostly affects the empty query browse order; that is accepted. Bartender search functions keep their own order. | `query`, `status_filter`, `page_limit`, `page_offset`, `locale` (unchanged) | `id, name, image_url, alcoholic_status` (unchanged) | anon and authenticated (unchanged) | none new |
| `classic_recipes` (new) | `security invoker`, `stable`. Live recipes with `fame_score is not null`, localized name like `search_recipes`, `order by fame_score desc, name asc, id asc`, `limit least(greatest(page_limit,1),50)`. | `page_limit int default 10`, `locale text default 'en'` | `id, name, image_url, alcoholic_status` | anon and authenticated | none; empty set when nothing is tagged |
| `apply_region_proposals` | Committed to the repo from its live definition (`pg_get_functiondef`; live it is `security definer`, `set search_path = ''`, returns void, and its only caller is `apply-regions.ts` with the service role key), then amended with `create or replace` keeping that signature: accept `fame_score` with null `region`; recompute `popularity_rank` only over rows with a region. `revoke execute ... from public, anon, authenticated; grant ... to service_role`. | `proposals jsonb` | void | service role only | raises on out of range score |
| `fetchClassicRecipes` (new, `packages/shared/src/homepage.ts`) | Wraps `classic_recipes`; returns `RecipeSummary[]`, explicit error return like its neighbors | `client`, `locale`, `limit = CLASSICS_ROW_SIZE` | `RecipeSummary[]` | n/a | Supabase error |

Script changes (`packages/shared/scripts/`):
- `tag-regions.ts`: prompt asks for a fame score for every recipe ("use null only if region is null" removed); schema keeps `fame_score` 0 to 100 but no longer nullable.
- `apply-regions.ts`: drop the "fame_score is set but region is null" error; add "fame_score is missing" as an error.

**Web back fallback table** (`fallbackHref` passed to `BackButton`; route params filled from the page):

| Page | Fallback |
|---|---|
| `recipes/[slug]` | `/search` |
| `recipes/[slug]/more-like-this` (its page client passes the slug it already reads) | `/recipes/[slug]` |
| `learn` | `/` |
| `learn/[category]` | `/learn` |
| `learn/[category]/[slug]` | `/learn/[category]` |
| `quizzes` | `/learn` |
| `quizzes/[slug]` | `/quizzes` |
| `popular`, `popular/[region]` | `/` (not `/popular`, which redirects back to a region) |
| `account/reset-password` | `/account` |
| service pages (`bar-invite`, `bar-invite-accept`, `bar-recipe-form`, `bartender-search`, `quick-build`) | `/service` |
| everything else (`privacy`, `search`, `pantry`, `shopping-list`, `drink-ideas`, `favorites`, `account`) | `/` (default) |

**Value sourcing**:

| Action | Value produced / displayed | Source |
|---|---|---|
| Browse order (AC-2) | fame order | `recipes.fame_score`, written by `apply-regions.ts` from the reviewed `tag-regions.ts` proposals |
| Browse order (AC-2) | tie order | localized name (`recipe_translations.name` else `recipes.name`), then `recipes.id` |
| Classics row (AC-4) | the 10 recipes | `classic_recipes(page_limit => CLASSICS_ROW_SIZE)`; `CLASSICS_ROW_SIZE = 10` exported from `packages/shared/src/homepage.ts` |
| Classics row (AC-4) | whether to render | recommendations query `isSuccess` with zero rows AND the classics query `isSuccess` with at least one row. The classics query is `enabled` only once recommendations succeeded empty; query key `["classic-recipes", locale]`, `staleTime` 10 minutes (fame changes only on a tagging run) |
| Popular empty (AC-3) | whether any region exists | `list_popular_regions()` (unchanged) |
| Drink ideas empty (AC-5) | pantry is empty | pantry query `isSuccess && data.length === 0`; the match query is `enabled: pantry.isSuccess && pantry.data.length > 0` (plus the existing session condition); spec 0036 deletes staples from pantries and hides their add actions, so no staple filter is needed |
| Service loading and error (AC-6) | loading, failed, retry | web: `useProfile` (in `service/layout.tsx`) and the current bar query from `use-my-bars.ts` (in `service-page-client.tsx`); mobile: `use-bartender-mode-guard.ts`'s profile query and the current bar query in `app/service.tsx`. `isError` wins over `isPending`; Retry calls that query's `refetch`. A linked user with no bar is a valid state (solo panel), not an error |
| Rating summary (AC-7) | average, count | `recipe_rating_summary` via `fetchRatingSummary` (unchanged); `count === 0` hides stars |
| Rating summary label (AC-7) | "Rated {average} out of 5 from {count} ratings" | the same summary, average formatted to one decimal with the locale's number format |
| Web Back (AC-8) | is there an in app page behind this one | `NavigationHistoryProvider` (new, `apps/web/src/components/`): React context holding an in app depth, 0 on mount. Each change of `pathname + search` (from `usePathname` and `useSearchParams`) that was not caused by a `popstate` event adds 1; each `popstate` (browser or `router.back()`) subtracts 1, floored at 0. `BackButton` calls `router.back()` when depth > 0, else the fallback. A full page load resets depth to 0, which is correct (treated as a direct landing). The choice is a pure function `chooseBack(depth, fallbackHref)` in the same folder, unit tested |
| Web Back (AC-8) | where to go otherwise | `fallbackHref` prop, default `"/"`, from the table above, built from the params each page already has; navigation via `router.replace` (not `push`, so a second Back does not bounce) from `@/i18n/navigation` so the locale is kept. Query strings are not carried into the fallback |
| Mobile Back (AC-8) | fallback | `apps/mobile/src/components/back-button.tsx` exports its existing `canGoBack ? back : replace("/")` logic as `goBackOrHome(router)`; `bartender-build/[kind]/[id].tsx` calls it |
| Hero alt (AC-9) | recipe name | the localized `recipe.name` already passed to `recipe-detail-header` (web and mobile). Mobile `RecipeImage` gains an optional `accessibilityLabel` prop: when set the image is `accessible` with that label (hero), when absent it is not accessible (cards) |
| Favorite name (AC-10) | "Favorite {name}" | `favorites.toggleLabel` with a `{name}` argument; the recipe name passed as a new required `recipeName` prop on `FavoriteToggle` at every call site (cards, detail header, favorites list), from the recipe summary or detail each call site already holds |
| Stretched card (AC-10) | layering and focus | web card root `relative`; the link's `::after` covers the card (`absolute inset-0`); the toggle is `relative z-10` (and any other interactive child added later must be too); the focus ring is drawn on the link's `::after` via `focus-visible`, so it outlines the whole card. Toggle keeps its 44 by 44 size. Mobile: the toggle is `position: absolute` in the card's top right corner over an outer `View`, 44 by 44 |
| Skip link target (AC-12) | content start | new `<div id="main-content" tabIndex={-1} className="outline-none">` wrapping only `{children}` (not `SiteNav` or `SiteFooter`) in `app/[locale]/layout.tsx`. Pages already render their own `<main>`, so the target can't be a second `main`. The outline is suppressed on this non interactive target only; it receives focus programmatically, never by Tab. The link itself is the first child inside `#app-content`, before `SiteNav`, `sr-only` until `focus-visible` |
| Mobile rows (AC-13) | role and label | `accessibilityRole="button"`, `accessibilityLabel` = the row's title (plus its subtitle after a comma when the row shows one), `minHeight: 44`. Rows: each category row in `learn/index.tsx`, each article row in `learn/[category]/index.tsx`, each region option in `popular.tsx`, each quiz row in `quizzes/index.tsx` |

**Copy** (English wording is final; Spanish is written at build time with the same meaning. Web keys live in `apps/web/messages/{en,es}.json`. Mobile uses the same namespace and key names in `apps/mobile/src/i18n/locales/{en,es}.json`, creating the namespace where it does not exist yet. Plurals use ICU `{count, plural, one {…} other {…}}` on web and i18next `_one`/`_other` suffixes on mobile):

| Key | English | Note |
|---|---|---|
| `home.classicsTitle` | Classics to start with | new |
| `popular.emptyTitle` | No popular drinks yet | existing key, wording kept |
| `popular.emptyDescription` | We're still picking the favorites for each region. In the meantime, browse every recipe. | reworded |
| `popular.regionEmptyDescription` | No drinks for this region yet. Browse every recipe instead. | reworded |
| `popular.browseAll` | Browse all recipes | new |
| `drinkIdeas.emptyPantryTitle` | Add a few ingredients to get ideas | new; shown only for an empty pantry |
| `drinkIdeas.emptyPantryDescription` | Tell us what's in your bar and we'll show you what you can make. | new |
| `drinkIdeas.addIngredients` | Add ingredients | new; the pantry button |
| `drinkIdeas.emptyTitle` / `emptyDescription` | existing | kept for a non empty pantry with no matches |
| `service.loading` | Loading Service | new; spinner label |
| `service.loadFailed` | We couldn't load Service. Check your connection and try again. | new; profile failure. Bar failure reuses `service.loadBarFailed` |
| `common.retry` | Retry | existing |
| `ratings.none` | No ratings yet. Be the first to rate it. | reworded |
| `ratings.summary` | {average} ({count, plural, one {# rating} other {# ratings}}) | made plural |
| `ratings.starsLabel` | Rated {average} out of 5 from {count, plural, one {# rating} other {# ratings}} | new |
| `favorites.toggleLabel` | Favorite {name} | new; replaces the flipping `add`/`remove` labels on the toggle |
| `common.skipToContent` | Skip to content | new; web only |

**Key invariants**:
- `fame_score` is only written by the reviewed apply step (or a direct admin fix); no client path writes it.
- `popularity_rank` is non null only when `region` is non null.
- Search order is total (ends in `id`), so paging is stable.
- The favorite control is never a descendant of an `<a>` or a pressable on any card.
- No component removes a focus outline without supplying `color.focus` in its place.

**Security model**: Unchanged read access: `search_recipes` and `classic_recipes` are readable by anon and authenticated, like the rest of the public catalog, and only expose already public columns. `apply_region_proposals` is service role only (it was never locked down in a migration; this spec does it). The tagging script runs locally with `ANTHROPIC_API_KEY` and `SUPABASE_SERVICE_ROLE_KEY`, never in a client. No personal data is touched.

**Configuration required**: none new. The tagging run reuses `ANTHROPIC_API_KEY`, `SUPABASE_URL`, and `SUPABASE_SERVICE_ROLE_KEY` from the developer's local environment.

**Critical test scenarios**:
- Happy path: after tagging, `search_recipes('')` on page 1 starts with the highest fame recipes, and pages 1 through 3 contain no repeated id, verifies **AC-1**, **AC-2**.
- Classics fallback: a guest with no favorites or ratings sees "Classics to start with" with 10 cards; after favoriting a few drinks the row is replaced by recommendations, verifies **AC-4**.
- No data: on a database with no fame scores, `classic_recipes` returns nothing, the classics row is absent, and Popular shows the "Browse all recipes" empty state, verifies **AC-3**, **AC-4**.
- Empty pantry: on Drink ideas with an empty pantry, the network log shows no `match_recipes_to_pantry` call and the next step button opens the pantry, verifies **AC-5**.
- Service failure: block the profile request; Service shows the error and Retry, and Retry recovers once unblocked, verifies **AC-6**.
- Direct landing: open `/es/recipes/negroni` in a new tab, press Back, land on `/es/search`; open search, click a recipe, press Back, return to the same search page, verifies **AC-8**.
- Screen reader: VoiceOver (iOS) or TalkBack (Android) and VoiceOver or NVDA on web read a recipe card as one link plus one "Favorite Negroni, toggle button, not pressed", and read the rating as one sentence, verifies **AC-7**, **AC-9**, **AC-10**, **AC-13**.
- Keyboard: Tab from page load shows the skip link first; opening a nav dropdown with the keyboard shows a focus ring on each item, verifies **AC-11**, **AC-12**.
- Unit (vitest): `apply-regions.ts` validation accepts a score with null region and rejects a missing score; the web back fallback chooser (pure function: `hasInAppHistory`, `fallbackHref` → `back` or `replace(href)`); the rating label formatter for 0, 1, and many ratings, verifies **AC-1**, **AC-7**, **AC-8**.

## Build plan

Ordered as a Tracer Bullet: the first slice runs one real thread from the database through the shared package to both apps (fame score → search order → classics row), then each later slice thickens one area.

1. **Thin thread: fame data to the screen.** Migration `supabase/migrations/<ts>_popularity_columns_and_fame_order.sql`: codify the popularity columns, the check, and the partial unique index; commit `apply_region_proposals` from its live definition, amended per the API table, with the revoke and grant; recreate `search_recipes` with the fame tiebreak; add `classic_recipes`. Regenerate `database.types.ts`. Change `tag-regions.ts` and `apply-regions.ts` (fame for every recipe) with vitest cases for the validation. Add `fetchClassicRecipes` and `CLASSICS_ROW_SIZE`. Web home: render the classics row when recommendations are empty. Then run tagging, spot check the top 50 by fame plus anything odd (fix a wrong pick by editing that entry in the proposals JSON by hand), and apply. Tagging and apply are manual steps, so AC-1 through AC-4 are checked in `/check verify`, not CI. Satisfies **AC-1**, **AC-2**, **AC-4**.
2. **Classics on mobile and Popular empty states.** Mobile home classics row (same rule). Popular empty state with "Browse all recipes" on web and mobile (mobile copy through i18next). Satisfies **AC-3**, **AC-4**, **AC-15**.
3. **Page empty and loading states.** Drink ideas: gate the match query on a loaded, non empty pantry and show the new empty state with the pantry button, web and mobile. Service: spinner and error with Retry in place of `return null` in the web layout (profile), the web linked branch (bar), and the mobile screen and guard, with `retry: 1` on those queries. Satisfies **AC-5**, **AC-6**, **AC-15**.
4. **Ratings display.** Hide display stars at zero ratings, new zero copy, single summary label for display stars, web and mobile, with the label formatter test. Satisfies **AC-7**, **AC-15**.
5. **Back that always goes somewhere.** `NavigationHistoryProvider` (depth counter) in web providers, `BackButton` `fallbackHref` prop with the pure `chooseBack` and its test, pass fallbacks from the table at each of the 22 call sites. Mobile exports `goBackOrHome` and `bartender-build/[kind]/[id].tsx` uses it. Satisfies **AC-8**.
6. **Labels and card structure.** Recipe hero alt text (web and mobile). Favorite control: fixed name plus state, `recipeName` prop, moved beside the card link (web: stretched link pattern, `relative` card with the link's `::after` covering it and the toggle above it; mobile: outer `View` holding the card `Pressable` and the toggle as siblings). Mobile Learn, Popular region, and Quizzes rows get role, label, and 44 point targets. Satisfies **AC-9**, **AC-10**, **AC-13**, **AC-15**.
7. **Keyboard and lint.** Skip link plus `#main-content` wrapper. `data-[highlighted]` focus styles on every `site-nav.tsx` dropdown item. Add `eslint-plugin-jsx-a11y` recommended to `apps/web/eslint.config.mjs` for all of `apps/web/src`, and fix what it flags. No rule is turned off globally; any `eslint-disable` for one of its rules needs an inline reason. Satisfies **AC-11**, **AC-12**, **AC-14**, **AC-15**.

## Consequences

**Positive**:
- First visits show real content: Popular regions, famous drinks first in search, and a classics row on home.
- One signal (fame) serves three surfaces, with no new service or table.
- The repo finally matches the live schema for the popularity columns, so a fresh database or branch works.
- Lint catches the most common accessibility regressions on web from now on.

**Negative / tradeoffs**:
- Fame is an LLM judgment, not measured behavior. It can be wrong for obscure drinks, and it does not change as people use the app. The spot check only covers the top 50.
- Search order changes for everyone: alphabetical browsing is gone unless a sort control is added later.
- Every new recipe (catalog import, admin add) arrives with no fame score and sorts last until someone reruns tagging.
- Mobile has no lint equivalent of jsx-a11y, so mobile accessibility stays guarded only by the manual pass.
- Web Back treats a full reload mid session as a direct landing and uses the fallback.

**Neutral**:
- The hero "Surprise me" picks from the first search page, so it now picks among the 20 most famous drinks (less variety, more recognizable).
- AC-5 relies on spec 0036 keeping staples out of pantries (its migration is live on `BartendingAppWeb`).
- Spec 0010's rule "fame is null when region is null" is amended by this spec.
- Mobile gains i18next keys for the strings this feature touches; the rest of those screens stay English until feature 41.

## Migration plan

**Strategy**: no migration of live data beyond the reviewed apply; schema changes are additive and idempotent.
**Phases**:
1. Run the migration in the Supabase SQL editor on `BartendingAppWeb` (MCP writes are declined on this project). Columns already exist, so only the new index, the new function, the recreated `search_recipes`, and the amended `apply_region_proposals` take effect. Search order is unchanged until scores exist.
2. Deploy web and mobile code. With no scores, the classics row and Popular stay hidden or empty, and search stays A to Z.
3. Run `pnpm tag-regions`, review, run `pnpm apply-regions`. Search, Popular, and classics change at that moment, with no deploy.
**Rollback**: before any later rerun of apply, save the current `id, region, fame_score, popularity_rank` (a select exported as CSV) so hand fixes are not lost. To undo the first run, set `fame_score`, `region`, and `popularity_rank` back to null to return to today's behavior; restore the previous `search_recipes` from `20261010140000_search_recipes_rank_fix.sql` if the order itself needs reverting.
**Risks**: the live `apply_region_proposals` definition differs from what spec 0010 describes, so it must be read from the database, not rewritten from the spec. A bad top 50 pick shows in search immediately; fix it with a direct update and rerun the rank recompute.

## Follow-up

- [ ] Add a step to the catalog import and admin recipe save that flags recipes with no fame score, or schedule a periodic `tag-regions` run for untagged recipes.
- [ ] Add a "Sort: Popular / A to Z" control to search if people ask for alphabetical browsing.
- [x] Note in spec 0010's data model that spec 0038 allows a fame score without a region (done at design time).
- [ ] Consider automated axe checks (Playwright plus `@axe-core/playwright`) once feature 2's CI exists.
- [ ] Mobile has no accessibility lint; revisit if a maintained React Native a11y ESLint plugin fits Expo's config.
