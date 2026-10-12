# Verify: Empty states, UX polish, and accessibility · spec 0038 · updated 2026-10-12
_Steps derived from spec 0038 acceptance criteria. `/check verify` runs these; `/test` locks the durable ones._

Before you start: run `supabase/migrations/20261012130000_popularity_columns_and_fame_order.sql` in the Supabase SQL editor on `BartendingAppWeb`. The steps marked "after tagging" also need `pnpm --filter @bartendingapp/shared tag-regions`, a review of `packages/shared/scripts/tagging/popular-by-region-proposals.json` (top 50 by fame, plus anything odd), then `pnpm --filter @bartendingapp/shared apply-regions`.

## Commands
- [ ] SQL: `select pg_get_functiondef('public.classic_recipes(int,text)'::regprocedure)` returns the function, and `select has_function_privilege('anon','public.apply_region_proposals(jsonb)','execute')` is false → AC-1, AC-4
- [ ] SQL (before tagging): `select * from classic_recipes(10,'en')` returns no rows, and `search_recipes('', null, 20, 0, 'en')` is still A to Z → AC-2, AC-4
- [ ] SQL (after tagging): `select count(*) from recipes where deleted_at is null and fame_score is null` is 0; some rows have `fame_score` with `region` null; `popularity_rank` is null wherever `region` is null → AC-1
- [ ] SQL (after tagging): `search_recipes('', null, 20, 0, 'en')` starts with the highest fame drinks; pages at offsets 0, 20, 40 share no id → AC-2
- [ ] SQL (after tagging): `search_recipes('margarita', …)` still puts "Margarita" first (match rank leads, fame only breaks ties) → AC-2
- [ ] Apply validation: a proposals file entry with `"fame_score": null` makes `apply-regions` stop with "fame_score is missing" and write nothing → AC-1
- [ ] `pnpm --filter web lint` passes with jsx-a11y recommended on → AC-14
- [ ] `pnpm test` passes (includes `regionProposals.test.ts`, `ratings.test.ts`, `navigation-history.test.ts`) → AC-1, AC-7, AC-8

## UI / manual
- [ ] Web and mobile, no regions tagged: `/popular` and the Popular tab show "No popular drinks yet" with "Browse all recipes", which opens `/search` (web) or the Search tab (mobile) → AC-3
- [ ] Web and mobile, after tagging: Popular shows region chips and ranked drinks; an empty region page shows "Browse all recipes" → AC-3
- [ ] Home as a fresh guest (no favorites, ratings, or recently viewed), after tagging: "Classics to start with" shows 10 cards in place of "Recommended for you"; no classics flash while recommendations load → AC-4
- [ ] Home, before tagging: neither row shows and no error appears → AC-4
- [ ] Home after favoriting a few drinks: recommendations show and the classics row is gone → AC-4
- [ ] Home with the recommendations request blocked: no classics row, and the network log has no `classic_recipes` call → AC-4
- [ ] Drink ideas with an empty pantry: heading plus "Add a few ingredients to get ideas"; "Add ingredients" opens the pantry; the network log has no `match_recipes_to_pantry` call → AC-5
- [ ] Drink ideas with the pantry request blocked: the error state with Retry; Retry recovers once unblocked → AC-5
- [ ] Drink ideas with ingredients but no matches: the old "No drink ideas yet" state still shows → AC-5
- [ ] Service (web and mobile) with the profile request blocked: error and Retry appear within about a second; Retry recovers once unblocked → AC-6
- [ ] Service as a linked user with the `my-bars` request blocked: the bar error and Retry show in the bar section (not the solo panel) → AC-6
- [ ] Service with bartender mode off: still redirects home (a spinner shows briefly, never a blank page) → AC-6
- [ ] Recipe with zero ratings: no stars, only "No ratings yet. Be the first to rate it." → AC-7
- [ ] Recipe with one rating in `/es`: stars plus "5,0 (1 calificación)"; the screen reader reads one sentence, "Calificación de 5,0 de 5 según 1 calificación" → AC-7
- [ ] Recipe with three ratings on mobile: VoiceOver or TalkBack reads one element "Rated 4.2 out of 5 from 3 ratings" → AC-7
- [ ] Open `/es/recipes/negroni-<id>` in a new tab, press Back: lands on `/es/search` (replace, so Back again goes home) → AC-8
- [ ] Open `/search`, type a query, click a recipe, press Back twice: back on the search page, then home (never off site, even after typing in search) → AC-8
- [ ] Direct landing on `/learn/<category>/<slug>` → Back goes to `/learn/<category>`; on `/recipes/<slug>/more-like-this` → `/recipes/<slug>`; on `/popular/<region>` → `/` → AC-8
- [ ] Mobile: deep link into a Bartender build screen, tap "Back to search": goes home instead of nowhere → AC-8
- [ ] Recipe hero image: screen reader announces the localized recipe name (web alt, mobile label); card images are not announced → AC-9
- [ ] Recipe card: one link with the recipe name plus "Favorite Negroni, toggle button, not pressed"; toggling flips only the pressed or checked state, never the name; clicking anywhere else on the card opens the recipe → AC-10
- [ ] Recipe card keyboard focus: the focus ring outlines the whole card; Tab next lands on the favorite toggle → AC-10
- [ ] Web nav: open each dropdown with the keyboard; every highlighted item shows the green focus ring; mouse hover shows the background only → AC-11
- [ ] Web, any page: the first Tab press reveals "Skip to content"; Enter moves focus past the nav to the page content → AC-12
- [ ] Mobile: Learn categories, Learn articles, Popular region chips, and Quizzes rows are announced as buttons with their title, each at least 44 points tall → AC-13
- [ ] Switch to Spanish on web and mobile and revisit each new string above: all of them show in Spanish → AC-15

## Value sourcing checks
- [ ] Browse order source: change one recipe's `fame_score` by hand in SQL and confirm it moves in `search_recipes('')` without a deploy → AC-2
- [ ] Tie order: two recipes with the same fame score sort by localized name in `es` (`recipe_translations.name`), then id → AC-2
- [ ] Classics size: exactly `CLASSICS_ROW_SIZE` (10) cards, localized names in `es` → AC-4
- [ ] Classics render rule: recommendations pending → skeleton only; failed → nothing; succeeded empty and classics empty → nothing → AC-4
- [ ] Popular empty source: `list_popular_regions()` empty ⇔ the empty state shows → AC-3
- [ ] Drink ideas empty source: the pantry query, not the match query, decides the empty pantry state (remove the last pantry item and revisit) → AC-5
- [ ] Service sources: web profile errors render from `service/layout.tsx`, bar errors from `service-page-client.tsx`; a linked user with no bar sees the solo panel, not an error → AC-6
- [ ] Rating label: the average is formatted in the active locale (`4.2` en, `4,2` es) on both platforms → AC-7
- [ ] Web Back depth: real history pushes count, replace navigations (search typing, locale switch) do not; a full reload resets to a direct landing → AC-8
- [ ] Web Back fallback keeps the locale prefix and drops query strings → AC-8
- [ ] Hero label source: the localized `recipe.name` (check in `es` on a translated recipe) → AC-9
- [ ] Favorite name source: "Favorite {name}" uses the name each call site holds (card, detail header, favorites list) → AC-10
- [ ] Skip link target: focus lands on `#main-content`, which wraps only the page (not the nav or footer) → AC-12
- [ ] Mobile row labels come from each row's title (category label, article title, region, quiz title) → AC-13

## Acceptance-criteria coverage
- AC-1 … Commands 1, 3, 6, 8 · AC-2 … Commands 2, 4, 5 and the browse order checks · AC-3 … UI 1, 2 · AC-4 … UI 3 to 6, Commands 1, 2 · AC-5 … UI 7 to 9 · AC-6 … UI 10 to 12 · AC-7 … UI 13 to 15, Commands 8 · AC-8 … UI 16 to 19, Commands 8 · AC-9 … UI 20 · AC-10 … UI 21, 22 · AC-11 … UI 23 · AC-12 … UI 24 · AC-13 … UI 25 · AC-14 … Commands 7 · AC-15 … UI 26
