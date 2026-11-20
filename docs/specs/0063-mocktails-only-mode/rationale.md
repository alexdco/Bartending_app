# 0063. Mocktails only mode: rationale

## Context

Spec 0037 added an age gate to both apps. A "No" shows a polite blocked screen for the rest of the tab or app session, and nothing about the answer leaves the device. Its own rationale listed a mocktails only mode as the friendlier option and set it aside as far larger, with a follow-up to revisit it if the gate's drop off proved costly. Scope feature 67 picks that up: someone who fails the gate should be able to choose mocktails only and never see an alcoholic recipe in search, detail, ideas, Learn, or recommendations.

The forces are these. The catalog has 424 alcoholic, 40 non alcoholic, and 11 `unknown` recipes, and none `optional`, so the mode serves under a tenth of the catalog. Every surface that lists recipes calls its own Postgres function (search, pantry matching, recommendations, popular, classics, favorites, recently viewed), several with fixed page sizes. Recipe status is not reliable on its own: "Fancy White Russian" is marked non alcoholic but contains vodka and coffee liqueur, and all 11 `unknown` recipes are actually alcoholic. Ingredient categories exist only for batch math (`spirit`, `liqueur`, `citrus`, `other`), and beer, lager, and wine sit in `other`. The web app server renders search's first page, popular region lists, recipe detail, and Learn, and caches them for every visitor, before the device's answer can be known. Learn has no recipes, but three of its five categories teach spirits, wine, and beer, and quizzes draw on those and on recipe groupings.

Privacy carries real weight. The people in this mode are likely minors. 0037 made sure nothing is tracked for a "No", and the consent banner and PostHog already wait for a confirmed answer. Guests already get anonymous sessions for pantry and favorites, which hold no identity and are deleted by the idle cleanup job.

Leaving this undecided keeps the hard block, and building it piecemeal would scatter several slightly different "is this alcoholic" checks across two apps.

## Options considered

### Option 1: Server filter through shared views, device held mode (chosen)

A `mocktails` gate state on the device, a `mocktails_only` flag on every catalog function, and two views that define "mocktail safe" recipes and "mocktail visible" ingredients once. On web, CSS keyed on `html[data-age]` hides server rendered content before paint.

**Pros**:
- Limits and paging stay correct, and alcoholic rows never reach the device.
- One rule in one place, which also catches mislabeled recipes through their ingredients.
- Keeps 0037's model: the answer lives on the device, and cached pages stay shared.

**Cons**:
- Twelve functions are dropped and created again, so there is real risk of a copy slip in adult results.
- Hidden content still sits in the web HTML.

### Option 2: Client side filter in the shared fetchers

Filter `alcoholicStatus` in `packages/shared` after each call. No migration.

**Pros**:
- No database change, and quick to ship.

**Cons**:
- Fixed size lists come back short or empty (top 10 recommendations are mostly alcoholic), and paging breaks.
- Alcoholic rows still arrive on the device.
- Status alone lets Fancy White Russian through, and an ingredient check on the client needs every recipe's ingredients fetched.

### Option 3: Separate mocktail functions per surface

New functions for the mode beside the existing ones.

**Pros**:
- Adult paths are left completely untouched.

**Cons**:
- Doubles the function surface; every later change to search or recommendations must be made twice, and the two drift.

### Option 4: Server knows the mode through a cookie

Store the choice in a cookie so server components render filtered HTML.

**Pros**:
- The HTML itself is correct, and nothing is hidden by CSS.

**Cons**:
- Pages become per visitor, losing the shared cache.
- The answer travels on every request, against 0037's device only stance.

## Rationale

Option 1 follows from the fixed size lists and the unreliable status data. Filtering after the fact (Option 2) cannot fill a page of 20 or a top 10 when nine in ten recipes are alcoholic, so the filter must run where the limit runs, in SQL. Putting the rule in one view, rather than in each function or in TypeScript, gives a single place to reason about "mocktail safe". It also turns the ingredient check against `spirit` and `liqueur` into a fail closed backstop for status mistakes like Fancy White Russian. Ingredient visibility is derived from the same view ("used in at least one mocktail safe recipe") because the category column cannot tell wine or beer apart from juice. A new `is_alcoholic` column would be more precise, but it needs a backfill and upkeep this feature does not justify yet.

The device side reuses 0037 directly. The mode lasts as long as a denial, has no exit, and loses to a confirmed answer. So an adult who mis-taps recovers by opening a new tab or restarting the app, and an under age visitor gets no visible "I'm of age" switch. The web server cannot know the mode without a cookie (Option 4). The same before paint attribute that hides the gate also hides server rendered alcoholic content, then the client refetches with the flag. The cost, content present in page source, is the same one 0037 already accepted.

Keeping these visitors as guests with analytics off follows from who they likely are. The anonymous session is kept because pantry, favorites, and AI ideas depend on it, and it carries no identity. Sign in, posting, and photos are cut because they would collect personal data and user generated content from minors. Bar features are cut entirely because they exist for working bar staff.

Several smaller calls were made in writing, not asked:
- **Param naming** follows each function's existing style (`p_` prefix where the function already uses it), not one new style.
- **Hidden Learn categories** live as a constant in `learnArticles.ts`, not a column. Runner up: a per article flag, which is too heavy for five fixed categories.
- **Fancy White Russian** is fixed by a data update in migration 1, because it is an admin recipe the import job never touches. Runner up: the catalog overrides file, which only covers TheCocktailDB ids.
- **Two migrations, not one or twelve**: the first is enough for the thin thread, and the second covers the rest, keeping SQL editor runs few.
- **Mobile tabs stay**, since every tab is filtered, not hidden.

## Evidence

**Catalog counts (live, 2026-11-19)**: alcoholic 424, non_alcoholic 40, unknown 11, optional 0. Unknowns: Egg Nog - Healthy, Egg Nog #4, Egg-Nog - Classic Cooked, GG, Gingerbread Shot, Gluehwein, Liquid Apple Pie, Pink Petals Shot, Storm Warning Shot, Vanilla Pear, Wine Cooler.

**Non alcoholic recipes using a spirit or liqueur**: only Fancy White Russian (Vodka 2 oz, Coffee Liquer 1 oz), `source = 'admin'`.

**Ingredient categories with alcohol outside spirit and liqueur**: `other` holds Beer, Lager, Red Wine, Wine, Cider (and nonalcoholic Ginger Ale, Ginger Beer, Root Beer, Apple Cider). `liqueur` holds the bitters and vermouths; `spirit` holds Champagne, Prosecco, Guinness Stout.

**Learn tools and other articles (kept)**: Boston Shaker vs. Cobbler Shaker; Strainers, Explained; The Muddler, Explained; What Is a Bar Spoon For?; What Is a Jigger?; Simple Syrup and Other Bar Syrups, Explained; What Are Bitters?; What Are Non-Alcoholic Spirits?
