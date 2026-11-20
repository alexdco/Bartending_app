# 0063. Mocktails only mode for visitors under the legal drinking age

**Date**: 2026-11-19
**Status**: In Progress

## Summary

Today a visitor who answers "No" at the age gate (spec 0037) is turned away. This spec adds a "Continue with mocktails only" button to that blocked screen. It opens a smaller version of the app where every recipe, ingredient, Learn page, and AI idea that involves alcohol is hidden. The database does the filtering, so lists keep their normal size and alcoholic rows never reach the device. The choice lives only on the device, lasts for that browser tab or app session, is never tracked, and sign in, posting, and bar features stay off.

## Requirements

**User stories**:
- As someone under the legal drinking age, I can still browse and make mocktails instead of being turned away.
- As that visitor, I never see an alcoholic recipe, a spirit in my pantry search, or an article about spirits, wine, or beer.
- As the product owner, I keep 0037's promise: nothing about the age answer, or this choice, is recorded or tracked.
- As an adult who already confirmed my age, nothing changes for me.

**Acceptance criteria**:

- **AC-1**: On web and mobile, the blocked screen (after "No") shows a "Continue with mocktails only" button (`ageGate.mocktailsButton`) under the existing blocked text. Tapping it closes the gate and enters mocktails only mode. The blocked screen keeps no control that asks the age question again.
- **AC-2**: The choice lasts as long as a denial does in 0037. On web it is stored in `sessionStorage` key `age-mocktails` = `"1"` for that tab, so a newly opened tab asks the age question again. On mobile it is held in memory until the app process restarts. No database write or analytics event records it, and app code stores and logs no request that carries it.
- **AC-3**: There is no in app control to leave the mode. If `age-confirmed` already holds the current `AGE_GATE_VERSION` on the device, the full app shows as today (confirmed wins over mocktails). Exempt routes (`/privacy`, `/auth/callback`) render normally in the mode.
- **AC-4**: A recipe is **mocktail safe** only when its `alcoholic_status` is `non_alcoholic` **and** none of its ingredients has `category` `spirit` or `liqueur`. Recipes that are `alcoholic`, `optional`, or `unknown` are never mocktail safe. Fancy White Russian (admin recipe `9cc015b9-0e31-46d8-8550-1b8bce459068`, marked `non_alcoholic` but made with vodka and coffee liqueur) is corrected to `alcoholic`.
- **AC-5**: In the mode, every recipe list shows only mocktail safe recipes, and page sizes and paging still work (a page of 20 holds up to 20 mocktail safe recipes, not 20 rows filtered on the device). This covers search (the alcoholic status filter chips are hidden), drink ideas from the pantry, recommendations, more like this, popular (regions with no mocktail safe recipe are left out of the region list), the homepage sections (classics, recommendations, ideas carousel, recently viewed), and favorites. Query cache keys include the mode, so a cached full list is never shown in the mode. (Both apps persist only the bar query keys, which this mode hides, so no eviction is needed.) In the mode, search removes the status filter chips and ignores any status value from the URL or component state. When a query returns nothing it shows `search.mocktailsEmpty`. Any count or "has more" that a list shows is computed after the filter.
- **AC-6**: Opening a recipe that is not mocktail safe (a direct link, deep link, search engine result, old favorite, or its more like this page) shows a notice instead (`mocktails.unavailableTitle`, `mocktails.unavailableBody`, and a link to search). The recipe's name, image, ingredients, instructions, rating, and comments are not visible at any moment, including before hydration on web and while the detail is loading on mobile (the mobile screen renders only a loading state until `mocktailSafe` is known). On web, once the page loads, the tab title becomes the notice title. Before that, the server rendered title and metadata still name the recipe, an accepted part of the page source tradeoff (see Consequences).
- **AC-7**: In the mode, ingredient search, the pantry list, and the shopping list show only **mocktail visible** ingredients: those used in at least one mocktail safe recipe, plus staples (`is_staple`). Pantry and shopping list rows for other ingredients stay stored, but they are not shown and pantry matching ignores them.
- **AC-8**: In the mode, AI drink ideas send `mocktailsOnly: true` to `generate-drink-idea`. The function keeps only the pantry's mocktail visible ingredients (plus staples) and asks the model for a non alcoholic drink only. The existing pantry check rejects any idea that uses an ingredient outside that list. If too few mocktail visible ingredients remain, the visitor gets the existing "pantry too small" response. Quota rules are unchanged.
- **AC-9**: In the mode, Learn hides the `spirits`, `wine`, and `beer` categories from the Learn grid and any article list. Their category and article routes show the notice (`mocktails.unavailableTitle`). `tools` and `other` are unchanged.
- **AC-10**: In the mode, quizzes are hidden everywhere: the nav entry, links from Learn categories and recipe groupings, and the Quizzes index. Quiz routes show the notice.
- **AC-11**: In the mode, Bartender Mode and bar features are hidden: the Bartender Mode toggle, every web `/service/*` route, and the mobile `service`, `bartender-search`, `bartender-build/*`, `bar-invite`, `bar-invite-accept`, and `bar-recipe-form` screens. Their routes show the notice.
- **AC-12**: In the mode, the visitor stays a guest. Sign in, account creation, the account page, the comment composer, report and block controls, comment photo upload, and the rating control are hidden. Account routes (`/account/reset-password` too) and every `/admin/*` route show the notice. On mocktail safe recipes, the rating summary and other people's comments (text, display names, and screened photos, spec 0062) stay visible, as for any public visitor. Anonymous guest features (pantry, favorites, shopping list, AI ideas) keep working as for any guest. An existing signed in session on the device is not signed out. Its account surfaces are hidden, and its own pantry and favorites rows are used, filtered. This is an accepted rare case.
- **AC-13**: In the mode, there is no cookie consent banner, no PostHog init, and no `identify`, on web and mobile (the gate state is never `confirmed`).
- **AC-14**: On web, the head script sets `html[data-age="mocktails"]` before paint. CSS then hides every server rendered element marked for the mode (search's initial results, popular region lists, recipe and Learn content that is not mocktail safe, hidden nav entries) and shows the matching notices, so nothing alcoholic is visible even before hydration. After hydration, client lists refetch with the mode flag and ignore server `initialData`.
- **AC-15**: In the mode, a "Mocktails only" badge (`mocktails.badge`) shows in the web header and at the top of the mobile Home screen. It is plain text, not a control, and readable in light and dark themes.
- **AC-16**: If storage is blocked or throws, the mode falls back to memory for the current page load (web) or app session (mobile), never crashes, and never leaves the page stuck.
- **AC-17**: The mode flag defaults to `false` on every changed database function, and the results for everyone else are exactly as before. Tests compare default calls against fixtures captured from the live functions before each migration is applied.
- **AC-19**: On the client, no filtered list renders or fetches until the gate state is known. While it is `unknown`, filtered queries are disabled (`enabled: state !== "unknown"`) and lists render nothing, so a list fetched without the flag can never paint in the mode.
- **AC-18**: Every new message key exists in all nine locale files on both apps. The notice is an `h1`/heading plus a link, focus moves to the heading when it replaces content, and it passes the existing automated accessibility checks (spec 0058).

## Decision

**Chosen option**: A new `mocktails` gate state held on the device, enforced by a `mocktails_only` parameter on each catalog database function that reads two shared views, with CSS before paint hiding of server rendered content on web.

Reuse 0037's device only gate to hold the choice, filter in Postgres through one definition of "mocktail safe" so limits and paging stay correct, and hide on web whatever the server rendered before it could know the mode, the same way the gate itself avoids a flash.

**Implementation skills**: `supabase-postgres-best-practices` (`supabase/agent-skills`, `.agents/skills/supabase-postgres-best-practices/`) · `nextjs-app-router-patterns` (`wshobson/agents`, `.agents/skills/nextjs-app-router-patterns/`) · `react-native-best-practices` (`callstackincubator/agent-skills`, `.agents/skills/react-native-best-practices/`) · `vitest` (`antfu/skills`, `.agents/skills/vitest/`)

## Feature design

### Gate state (shared, `packages/shared/src/ageGate.ts`)

- New constant `AGE_MOCKTAILS_KEY = "age-mocktails"`.
- `AgeGateState` gains `"mocktails"`. `AgeGateInput` gains `readonly mocktails: boolean`.
- `resolveAgeGateState` precedence: `exempt` → `confirmed` → `mocktails` → `denied` → `ask`.
- New pure helpers: `isMocktailsOnly(state): boolean` (true only for `"mocktails"`).
- Transitions (extends 0037): `denied` → (tap "Continue with mocktails only") → `mocktails`; `mocktails` → (tab closed / app restart) → `ask`; `mocktails` → (another tab confirms, then this tab reloads) → `confirmed`. No transition from `mocktails` back to `ask` or `confirmed` inside the session.

### Data model sketch

No new tables or columns. Two views and one data fix, in the migrations below:

| Object | Shape | Definition |
|---|---|---|
| `public.mocktail_safe_recipes` (view, `security_invoker = true`) | `id uuid` | recipes `r` where `r.deleted_at is null`, `r.alcoholic_status = 'non_alcoholic'`, and no `recipe_ingredients` row for `r` joins an `ingredients` row with `category in ('spirit','liqueur')` |
| `public.mocktail_visible_ingredients` (view, `security_invoker = true`) | `id uuid` | distinct `ingredient_id` from `recipe_ingredients` joined to `mocktail_safe_recipes`, union `ingredients.id` where `is_staple and coalesce(category,'') not in ('spirit','liqueur')` (a SQL test asserts no row of the view has either category) |
| data fix | `recipes` row `9cc015b9-0e31-46d8-8550-1b8bce459068` | `alcoholic_status = 'alcoholic'` |

Both views get `grant select` to `anon` and `authenticated`. They read only public catalog tables, so `security_invoker` keeps the base tables' RLS in force. Migration 1 first confirms that `anon` can read `recipes`, `recipe_ingredients`, and `ingredients` under RLS, since the views return nothing otherwise. At 475 recipes, the views run inline; no materialization or index is needed.

### API surface (database functions)

Every function below is dropped and created again with the new trailing parameter (a `create or replace` with a new argument list would add an overload and make PostgREST calls ambiguous). Each body is copied from its latest migration, adding `and (not <flag> or r.id in (select id from public.mocktail_safe_recipes))` for recipes, or `... ingredient_id in (select id from public.mocktail_visible_ingredients)` for ingredients. Existing grants are reapplied.

| Function (latest migration) | New arg | Filter applied when true | Callers |
|---|---|---|---|
| `search_recipes` (`20261118120000`) | `mocktails_only boolean default false` | recipes | `searchRecipes` |
| `match_recipes_to_pantry` (`20261111130000`) | `mocktails_only boolean default false` | recipes, and pantry rows limited to visible ingredients before matching | `drinkIdeas.ts` |
| `recommend_recipes` (`20261111130000`) | `mocktails_only boolean default false` | recipes (recommendations and more like this) | `recommendations.ts` |
| `classic_recipes` (`20261111130000`) | `mocktails_only boolean default false` | recipes | `homepage.ts` |
| `popular_recipes_by_region` (`20261111130000`) | `mocktails_only boolean default false` | recipes | `popularByRegion.ts` |
| `list_popular_regions` (`20260913150000`) | `mocktails_only boolean default false` | only regions with at least one mocktail safe recipe | `popularByRegion.ts` |
| `fetch_favorite_recipes` (`20261111130000`) | `p_mocktails_only boolean default false` | recipes | `favorites.ts` |
| `fetch_recipes_by_ids` (`20261111130000`) | `p_mocktails_only boolean default false` | recipes (recently viewed) | `recipes.ts` |
| `fetch_recipe_detail` (`20261114130000`) | none | adds output column `mocktail_safe boolean` | `recipes.ts`, `bar.ts` |
| `search_ingredients` (`20261111150000`) | `mocktails_only boolean default false` | ingredients | `pantry.ts` |
| `fetch_pantry_items` (`20261031140000`) | `p_mocktails_only boolean default false` | ingredients | `pantry.ts` |
| `fetch_shopping_list_items` (`20261031140000`) | `p_mocktails_only boolean default false` | ingredients | `shoppingList.ts` |

**Drop procedure**: before each drop, list dependent functions and views (`pg_depend`) and drop without `cascade`. If a dependent exists, recreate it in the same migration. End each migration with `notify pgrst, 'reload schema'`.

**Per function filter rules**:
- `match_recipes_to_pantry`: in the mode, the pantry set is first limited to visible ingredients, and the missing counts and ratio are computed from that limited set. Then the recipes are filtered.
- `recommend_recipes`: candidates are filtered even when `current_recipe_id` or `recent_recipe_ids` point at a recipe that is not safe. Scores are computed as today over the filtered candidates.
- `list_popular_regions`: same ordering as today, just fewer regions.
- Any count, total, or "has more" a caller derives comes from the filtered rows.
- Unchanged: `resolve_recipe_redirect` (returns an id; the destination gets the AC-6 notice), `recipe_rating_summary`, the comments read, and `fetchFavoriteIds` (a heart state on a visible recipe is harmless).

Untouched on purpose: `search_bartender`, `search_recipes_by_ingredients`, `fetch_bar_*` (bar features are hidden, AC-11), the sitemap's direct `recipes` read (crawlers), and quiz and Learn reads (hidden by category or route, AC-9, AC-10).

**Shared fetchers** (`packages/shared`): each wrapper above gains an optional `mocktailsOnly?: boolean` (default `false`) and passes it through. `RecipeDetail` gains `mocktailSafe: boolean`.

**Edge Function `generate-drink-idea`**: the request body accepts `mocktailsOnly?: boolean` (anything else reads as `false`). When true, the function reads the id list from `mocktail_visible_ingredients` in a separate query (views carry no foreign key metadata for PostgREST embedding) and keeps only pantry rows and staples whose `ingredient_id` is in it. The staples read is filtered as well. The prompt line "Invent one original cocktail or mocktail recipe" becomes "Invent one original non alcoholic drink (a mocktail) …", plus "Do not use or mention any alcoholic ingredient." `checkIdea` stays the guard: every ingredient must be in the filtered pantry or staples. The idea's name and steps are steered only by the prompt. This is accepted because the steps can only use the filtered ingredients, and an alcohol word list across nine languages would be brittle.

### Web surfaces (`apps/web`)

| File / area | Change |
|---|---|
| `src/age-gate/age-gate-storage.ts` | `readMocktails` / `writeMocktails` on `sessionStorage` `age-mocktails`, try wrapped, with a memory fallback (AC-16) |
| `src/age-gate/age-gate-store.ts` | `Answer` gains `mocktails`; `chooseMocktails()`; `DATA_AGE.mocktails = "mocktails"` (so `useAgeGateDomSync` writes it on every client navigation); `isAgeGateOpen` is false for `mocktails`, so `inert` is removed and the gate's focus trap released; new `useMocktailsState()` returning `"unknown" \| boolean`, used for `enabled` on filtered queries (AC-19), and `useMocktailsOnly()` (true only when known and on) |
| `src/age-gate/age-gate.tsx` | blocked panel gains the `mocktailsButton` button calling `chooseMocktails` |
| `src/app/[locale]/layout.tsx` `ageGateInitScript` | after the exempt and confirmed checks, reads `age-mocktails` inside the same `try` and sets `data-age="mocktails"`; a throw yields `ask`. The key comes from `AGE_MOCKTAILS_KEY` through `JSON.stringify`, like the existing keys |
| `src/app/globals.css` | `html[data-age="mocktails"] [data-mocktails="hide"] { display: none }`; `[data-mocktails="notice"]` hidden by default and shown only under `html[data-age="mocktails"]` |
| server rendered recipe lists (search initial results, `popular/[region]`) | wrapper marked `data-mocktails="hide"`; the client component, when `useMocktailsOnly()`, ignores `initialData` and renders its own refetched list outside that wrapper |
| `recipes/[slug]/page.tsx`, `more-like-this/page.tsx` | when `!detail.mocktailSafe`, wrap the visible recipe body (including rating and comments) in `data-mocktails="hide"` and render `<MocktailsUnavailable />` marked `data-mocktails="notice"`; the client notice sets `document.title` (AC-6) |
| `learn/page.tsx`, `learn/[category]/*` | tiles and pages for `spirits`, `wine`, `beer` marked hide, plus a notice on their routes |
| `quizzes/*`, `service/*`, `account/*`, `admin/*` | page content marked hide plus a notice |
| every link into a hidden route (Learn tiles, quiz links on Learn and recipe groupings, Bartender Mode and service links, account and sign in links) | marked hide, or not rendered when `useMocktailsOnly()` in client components |
| `src/components/site-nav.tsx` | Quizzes, Bartender Mode toggle, sign in, account menu entries marked hide; the `mocktails.badge` pill marked notice |
| search page client | status filter chips hidden in the mode; queries pass `mocktailsOnly` |
| comments, ratings | composer, report, block, photo upload, and rating control not rendered when `useMocktailsOnly()` |
| `providers.tsx` | no change: consent banner and analytics already wait for `confirmed` |
| new `src/mocktails/mocktails-unavailable.tsx` | the notice: heading, body, link to `/search`. It focuses the heading and sets `document.title` only when `useMocktailsOnly()` is true, because adults receive the same cached HTML with the notice hidden by default |

Every client hook that calls a filtered fetcher adds `mocktailsOnly` to its query key (AC-5).

### Mobile surfaces (`apps/mobile`)

| File / area | Change |
|---|---|
| `src/age-gate/use-age-gate.ts` | `mocktails` in memory state, `chooseMocktails` |
| `src/age-gate/age-gate-overlay.tsx` | blocked panel gains the button; overlay hidden for `mocktails` |
| new `src/mocktails/mocktails-context.tsx` | `MocktailsOnlyProvider` in `_layout.tsx` plus a `useMocktailsOnly()` hook |
| new `src/mocktails/mocktails-unavailable.tsx` | notice screen content, `AccessibilityInfo.setAccessibilityFocus` on the title |
| `src/components/app-tabs.tsx` | tabs unchanged (home, search, pantry, shopping list, drink ideas are all filtered, not hidden) |
| every hook calling a filtered fetcher | passes `mocktailsOnly`, adds it to the query key |
| recipe, more like this, learn category and article, quizzes, service, bartender, bar, account screens | render the notice per AC-6, AC-9 to AC-12; the recipe screens render only their loading state until `mocktailSafe` is known (deep links included) |
| every link into a hidden route (Home, Learn, Account, recipe groupings) | not rendered when `useMocktailsOnly()` |
| filtered hooks | `enabled` only once the gate state is known (AC-19) |
| home screen | the badge at top |
| account and comments UI | hidden per AC-12 |
| `_layout.tsx` | `identify` and `initAnalytics` already wait for `confirmed` (AC-13) |

### Copy (new keys; web `mocktails` and `ageGate` namespaces, mobile the same keys)

| Key | en | es |
|---|---|---|
| `ageGate.mocktailsButton` | Continue with mocktails only | Continuar solo con mocktails |
| `mocktails.badge` | Mocktails only | Solo mocktails |
| `mocktails.unavailableTitle` | Not available in mocktails only mode | No disponible en el modo solo mocktails |
| `mocktails.unavailableBody` | This page is only for people of legal drinking age. Browse mocktails instead. | Esta página es solo para personas con la edad legal para beber. Explora los mocktails. |
| `mocktails.browseLink` | Browse mocktails | Explorar mocktails |
| `search.mocktailsEmpty` | No mocktails match your search. | Ningún mocktail coincide con tu búsqueda. |

pt, fr, ru, hi, ja, ko, and zh get translations in the build, added to each locale's reviewed list the same way spec 0062's new keys were.

### Value sourcing

| Action | Value produced / displayed | Source |
|---|---|---|
| Show mode anywhere | mode on/off | web: `sessionStorage[age-mocktails]` via `age-gate-store`, and `html[data-age]` before hydration; mobile: in memory state in `use-age-gate` via context |
| Any filtered list | which recipes are allowed | `public.mocktail_safe_recipes` view |
| Any ingredient list | which ingredients are allowed | `public.mocktail_visible_ingredients` view |
| Recipe detail notice | whether this recipe is safe | `fetch_recipe_detail.mocktail_safe` (derived from the view) |
| Learn notice | whether a category is hidden | constant `MOCKTAILS_HIDDEN_LEARN_CATEGORIES = ["spirits","wine","beer"]` in `packages/shared/src/learnArticles.ts`, checked against the route's `category` |
| Quiz, service, account, bar notices | whether the route is hidden | the route itself (fixed list in this spec) |
| AI idea in the mode | allowed pantry names | pantry rows joined to `mocktail_visible_ingredients`, server side; flag from the request body `mocktailsOnly` |
| Popular region list | regions shown | `list_popular_regions(mocktails_only)` |
| Tab title on a notice | text | `mocktails.unavailableTitle` |
| Badge | text | `mocktails.badge` |

### Key invariants

- One definition of "mocktail safe" (the view). No client filters on `alcoholicStatus`, and no second copy of the rule in TypeScript.
- Flag default `false` everywhere; adults' calls are byte for byte the same SQL path as before.
- `confirmed` always wins over `mocktails`.
- The mode is never sent to analytics, never written to a table, and never logged by app code.
- In the mode, no element that renders alcoholic recipe or Learn content is visible at any moment on web, before or after hydration.

### Security model

The mode is a visibility filter for a self declared answer, not an access control. The flag is client controlled, exactly like 0037's gate, and anyone can bypass it by answering "Yes". RLS is unchanged: the catalog stays public read. The flag widens nothing (it only removes rows). The compliance aim is data minimisation for likely minors: no analytics, no consent prompt, no account, no user generated content, only anonymous guest rows that the idle cleanup job deletes (spec 0017).

### Failure and edge cases

- Storage throws: memory fallback (AC-16). The head script can't see memory, so the next load reads `ask` and shows the gate again.
- The mode flips from `denied` to `mocktails` in one session: nothing was fetched under the gate, and every filtered key includes the flag, so no unflagged entry is reused.
- A tab duplicated or opened with `target=_blank` copies `sessionStorage`, so it stays in the mode. Only a fresh tab asks again.
- Slow or missing JavaScript on web: CSS before paint keeps hidden content hidden. If the head script itself fails, the state is `ask` and the gate covers the page (0037 behavior).
- Another tab confirms age: this tab keeps the mode until reload, then is `confirmed`.
- The mode is on and the visible pantry is too small for ideas: the existing too small message.
- A search query names an alcoholic drink: the empty state reads `search.mocktailsEmpty`.
- Favorites or recently viewed hold alcoholic recipes from before (a shared device): filtered out by the server, and stored rows are untouched.
- A new import adds a mislabeled recipe: the ingredient check in the view hides it if it uses a spirit or liqueur. A mislabel that uses only beer, wine, or cider classed as `other` is not caught (see Consequences).

### Critical test scenarios

- Happy path: answer No, tap Continue, search shows only mocktail safe recipes and the badge, popular regions and the homepage hold only mocktail safe recipes. Verifies **AC-1**, **AC-5**, **AC-15**
- Fail closed rule: SQL test where a `non_alcoholic` recipe with a `spirit` ingredient, and `unknown` and `optional` recipes, are absent from `mocktail_safe_recipes`; Fancy White Russian is `alcoholic`. Verifies **AC-4**
- Paging: `search_recipes(mocktails_only => true, page_limit => 20)` returns 20 safe rows when 20 or more exist. Verifies **AC-5**
- Default unchanged: every changed function called without the flag returns the same rows as before the migration. Verifies **AC-17**
- Direct link: in the mode, load `/recipes/margarita-<id>` with JavaScript throttled and assert the recipe body is never visible and the notice is. Verifies **AC-6**, **AC-14**
- Ingredients: vodka is absent from `search_ingredients` and `fetch_pantry_items` in the mode, present without it. Verifies **AC-7**
- AI ideas: function unit test with a pantry of vodka, lime, and soda in the mode sends only lime and soda (plus staples) to the prompt; a model reply naming vodka fails `checkIdea`. Verifies **AC-8**
- Hidden areas: Learn spirits route, `/quizzes`, `/service`, `/account` show the notice. Verifies **AC-9**, **AC-10**, **AC-11**, **AC-12**
- No tracking: in the mode, no request to the PostHog host and no consent banner. Verifies **AC-13**
- Lifetime: a fresh tab (not a duplicate) asks again; storage that throws falls back to memory. Verifies **AC-2**, **AC-3**, **AC-16**
- Gate release: after Continue, `#app-content` loses `inert`, Tab moves freely, and `html[data-age]` stays `mocktails` across client navigation into and out of `/privacy`. Verifies **AC-1**, **AC-14**
- No early fetch: with the store `unknown`, no filtered request is sent (network assertion), then one flagged request follows. Verifies **AC-19**
- Stale parameter: `/search?status=alcoholic` in the mode shows only mocktail safe results and no chips. Verifies **AC-5**
- Admin: `/admin/recipes` in the mode shows the notice. Verifies **AC-12**
- Staples: no row of `mocktail_visible_ingredients` has category spirit or liqueur. Verifies **AC-7**
- Resolver: unit tests for every precedence pair in `resolveAgeGateState`. Verifies **AC-3**
- Locales and accessibility: the key parity test passes for all nine locales; the axe checks pass on the notice and the badge. Verifies **AC-18**

## Build plan

Tracer Bullet: the first slice runs one real thread through every layer (gate state, migration, shared fetcher, web search, detail notice). Later slices widen it surface by surface, then add mobile. Migrations are applied by you in the Supabase SQL editor, then `database.types.ts` is generated again.

1. **Thin thread (web, search and detail).** Shared `ageGate.ts` state, key, precedence, and tests. Migration 1: both views, the Fancy White Russian fix, `search_recipes` with `mocktails_only`, and `fetch_recipe_detail` with `mocktail_safe`, plus SQL tests. `searchRecipes` and `fetchRecipeDetail` changes. Web storage, store, head script, CSS rules, and the blocked screen button. Search page refetch with chips hidden, recipe detail and more like this notice, header badge, `en`/`es` keys. Satisfies **AC-1**, **AC-2**, **AC-3**, **AC-4**, **AC-6**, **AC-14**, **AC-15**, **AC-16**, **AC-17** (for those two functions), **AC-19**
2. **Every other catalog list (web).** Migration 2: the remaining ten functions with the flag, plus default unchanged tests. Shared fetchers, web hooks and query keys for drink ideas, recommendations, more like this, popular (index and region), homepage, favorites, recently viewed, pantry, ingredient search, shopping list. Satisfies **AC-5**, **AC-7**, **AC-17**
3. **AI ideas.** `generate-drink-idea` reads `mocktailsOnly`, filters the pantry, swaps the prompt line; Deno tests; web client sends the flag. Satisfies **AC-8**
4. **Hidden areas (web).** Learn category hiding with `MOCKTAILS_HIDDEN_LEARN_CATEGORIES`, quizzes, service, account, nav entries, comment and rating controls, notices on each route. Satisfies **AC-9**, **AC-10**, **AC-11**, **AC-12**, **AC-13**
5. **Mobile parity.** `use-age-gate`, overlay button, `MocktailsOnlyProvider`, every filtered hook, query key, and `enabled` guard, notice screens for recipe, Learn, quizzes, service, bartender, bar, account; hidden comment, rating, and account controls; badge on Home; AI ideas flag. Satisfies **AC-1** to **AC-16** and **AC-19** on mobile
6. **Locales and verify.** Keys for pt, fr, ru, hi, ja, ko, zh on both apps, added to the reviewed lists; accessibility checks; `verify.md` with the manual steps (age gate No, Continue, every surface, new tab, private window). Satisfies **AC-18**

## Migration plan

**Strategy**: no feature flag. The new parameters are additive with a `false` default, and the mode can't be reached until the blocked screen button ships.
**Phases**:
1. Migration 1 (views, Fancy White Russian fix, `search_recipes`, `fetch_recipe_detail`), applied in the SQL editor before the slice 1 code deploys. Old clients keep working, because omitted arguments take the defaults.
2. Migration 2 (the other ten functions), applied before the slice 2 code deploys.
3. Each later slice deploys code only.

**Rollback**: each migration ships with a down script that recreates the previous function bodies from their source migrations and drops the views. The data fix is reverted by setting the row back to `non_alcoholic` (not recommended). Reverting the web or mobile code alone is safe, since the defaults keep adult behavior.
**Risks**: a function body copied with a slip changes adult results (caught by the default unchanged tests). A PostgREST schema cache that is stale right after a drop and recreate can return a "function not found" error for a few seconds (run `notify pgrst, 'reload schema'` at the end of each migration). Mobile builds already in stores never send the flag, which is fine because they never show the button.

## Consequences

**Positive**:
- Under age visitors get a real, on brand app (40 mocktails, about 39 after the fix) instead of a dead end, which also softens the drop off 0037 flagged.
- One SQL definition of "mocktail safe" drives every surface, so new list functions only need the one `and` clause.
- The view's ingredient check also catches mislabeled imports in the future.

**Negative / tradeoffs**:
- Twelve functions are dropped and created again in two migrations, each copied from its latest body. A copy slip could change adult results, which is why the default unchanged tests are required.
- On web, hidden content is still in the HTML (view source shows it), and a hidden recipe's server rendered tab title and metadata name the drink until the page loads. "Never sees" holds for the rendered page, not the page source or the tab title during load, the same tradeoff 0037 made for the gate.
- An AI idea's name and steps are steered by the prompt, not checked.
- The ingredient rule hides harmless ingredients that appear only in cocktails, and the recipe rule cannot catch a mislabeled recipe whose only alcohol is beer, wine, or cider classed as `other`.
- Every future catalog function and every new page must remember the flag and the hide markers; nothing enforces it automatically.
- Seven locales need new strings before launch in those languages.

**Neutral**:
- `fetch_recipe_detail` gains a column, which Bartender Mode's reader ignores.
- The age gate gains a fifth state, and 0037's state list in its spec is extended by this one.

## Follow-up

- [ ] Add a guard to the admin recipe form: warn when status is `non_alcoholic` but a spirit or liqueur ingredient is present.
- [ ] Consider an `ingredients.is_alcoholic` flag if a beer, wine, or cider mislabel ever slips through the view.
- [ ] Classify the 11 `unknown` recipes (Gluehwein, Wine Cooler, egg nogs, and others) with their real status.
- [ ] Add a check (lint or test) that every new catalog function taking `locale` also takes the mocktails flag.
- [ ] Note in spec 0037's index that the gate state list is extended by 0063.

## Rationale

Reasoning and options: see [rationale.md](rationale.md).
