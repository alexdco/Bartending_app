# Verify: Mocktails only mode · spec 0063 · updated 2026-11-22
_Steps derived from spec 0063 acceptance criteria. `/check verify` runs these; `/test` locks the durable ones._

## Milestone 1: thin thread on web

### UI / manual
- [ ] In a fresh tab, open `/en`, answer "No" → the blocked screen shows "Continue with mocktails only" under the blocked text, and nothing asks the age question again → AC-1
- [ ] Tap "Continue with mocktails only" → the gate closes, `#app-content` loses `inert`, Tab moves freely, `html[data-age]` is `mocktails`, and the header shows the "Mocktails only" badge in light and dark themes → AC-1, AC-15
- [ ] DevTools → Application → Session Storage → `age-mocktails` is `"1"`; nothing in Local Storage changed; no request goes to the PostHog host and no consent banner shows → AC-2, AC-13
- [ ] Reload the tab → still in the mode, no gate, no flash of the full catalog → AC-2, AC-14
- [ ] Duplicate the tab → still in the mode. Open a fresh tab (not a duplicate) on `/en` → the age question shows again → AC-2
- [ ] In a tab that already answered "Yes" (`age-confirmed` = `1`), set `sessionStorage['age-mocktails'] = '1'` and reload → the full app, no badge (confirmed wins) → AC-3
- [ ] In the mode, open `/en/privacy` → it renders normally, the badge stays, `html[data-age]` stays `mocktails`; navigate back to `/en/search` → still `mocktails` → AC-3, AC-14
- [ ] In the mode, `/en/search` → no status chips, only mocktail safe drinks (39 today), scrolling loads more until the list ends → AC-5
- [ ] In the mode, `/en/search?status=alcoholic` and typing "vodka" → no chips, only mocktail safe results; a query with no mocktail match shows "No mocktails match your search." → AC-5
- [ ] In the mode, with the network throttled to Slow 3G and JavaScript disabled, load `/en/search` → the server rendered results are never visible → AC-14, AC-19
- [ ] In the mode, open `/en/recipes/fancy-white-russian-9cc015b9-0e31-46d8-8550-1b8bce459068` (also with JavaScript disabled) → only the notice ("Not available in mocktails only mode", body, "Browse mocktails" link) shows, never the name, image, ingredients, rating, or comments; once loaded the tab title is the notice title and focus is on the heading → AC-6, AC-14, AC-18
- [ ] Same for `/en/recipes/fancy-white-russian-9cc015b9-0e31-46d8-8550-1b8bce459068/more-like-this` → the notice only → AC-6
- [ ] In the mode, open `/en/recipes/pineapple-gingerale-smoothie-e01e1242-82bf-4a0c-bba6-d62ab2866530` → the full recipe shows, no notice → AC-6
- [ ] As an adult (answered "Yes"), open the Fancy White Russian page and `/en/search` → everything shows as before, no notice, no badge, status chips present → AC-3, AC-17
- [ ] In a private window with storage blocked, answer "No" then "Continue" → the mode works for this page load without errors; a reload asks again → AC-16
- [ ] Switch the locale to `es` in the mode → badge "Solo mocktails", notice "No disponible en el modo solo mocktails", button "Continuar solo con mocktails" → AC-18

### Commands
- [ ] Paste `supabase/tests/mocktails_only_check.sql` into the Supabase SQL editor → every line reads PASS (defaults unchanged for both functions, mocktail_safe matches the view, Fancy White Russian alcoholic, spirit/unknown/optional never safe, full flagged page of 20, staples without spirits, anon grants) → AC-4, AC-5, AC-6, AC-7, AC-17
- [ ] `npx vitest run packages/shared/src/ageGate.test.ts` → every precedence pair passes, including confirmed over mocktails and exempt in the mode → AC-3
- [ ] `npx vitest run apps/web/src/i18n` → message key parity passes for all nine web locales → AC-18

### Value sourcing
- [ ] Mode on/off: toggle `sessionStorage['age-mocktails']` between `"1"` and absent, reload → `html[data-age]` flips between `mocktails` and the gate; the store and head script agree → Value sourcing row 1
- [ ] Allowed recipes: change one recipe's ingredient to a `spirit` in a rolled back transaction and run `select * from public.search_recipes('', null, 50, 0, 'en', 'az', true)` → it drops out → Value sourcing row 2
- [ ] Recipe detail notice: `select mocktail_safe from public.fetch_recipe_detail(<id>, 'en')` for a safe and an unsafe recipe → true and false, matching the page → Value sourcing row 4
- [ ] Tab title on a notice: in the mode, the hidden recipe's tab reads `mocktails.unavailableTitle` in `en` and `es` → Value sourcing row 8
- [ ] Badge: text comes from `mocktails.badge` in each locale → Value sourcing row 9

### Acceptance criteria coverage (milestone 1)
- AC-1 gate button and release · AC-2 lifetime and storage · AC-3 precedence, exempt routes · AC-4 SQL check · AC-5 search only (other lists in milestone 2) · AC-6 recipe and more like this notice · AC-14 CSS before paint · AC-15 web badge · AC-16 storage fallback · AC-17 SQL default checks for the two functions · AC-18 web locales (mobile in milestone 4/5) · AC-19 no early fetch on search

## Milestone 2: every other list on web, plus the AI ideas flag

### UI / manual
- [ ] In the mode, add vodka, lime juice, and soda water to the pantry as a guest, then open `/drink-ideas` → only mocktail safe matches, and missing counts ignore vodka → AC-5, AC-7
- [ ] In the mode, open `/pantry` with vodka stored → vodka is not listed; leave the mode (fresh tab, answer Yes) → vodka is still there → AC-7
- [ ] In the mode, type "vodka" in the pantry ingredient search → no results; "lime" → results → AC-7
- [ ] In the mode, add an ingredient to the shopping list, then check that a stored spirit row is hidden and untouched for adults → AC-7
- [ ] In the mode, open a safe recipe's more like this and the homepage recommendations → every card is mocktail safe → AC-5
- [ ] In the mode, homepage classics, recently viewed (after viewing an alcoholic recipe as an adult in the same tab history), and the popular carousel hold only safe recipes → AC-5
- [ ] In the mode, `/popular/<region>` → the server list and picker are hidden before paint; the client list shows only regions with a safe recipe and only safe recipes → AC-5, AC-14
- [ ] In the mode, favorite an alcoholic recipe as an adult first, then open `/favorites` in the mode → it is not shown, and paging still fills pages → AC-5
- [ ] In the mode, generate an AI idea with a pantry of vodka, lime juice, and soda water → the idea uses no vodka and reads as a non alcoholic drink; with only vodka and one other spirit → the "pantry too small" message → AC-8
- [ ] Network panel in the mode: every list request carries `mocktails_only: true` (or `p_mocktails_only`); as an adult, no request carries the flag → AC-5, AC-17
- [ ] No filtered list request is sent before the gate state is known → AC-19

### Commands
- [ ] Paste `supabase/tests/mocktails_only_lists_check.sql` into the SQL editor → every line in the raised report reads PASS → AC-5, AC-7, AC-17
- [ ] `select count(*) from public.search_ingredients('vodka', 20, 'en', false, true)` → 0; without the flag → more than 0 → AC-7
- [ ] `select count(*) from public.mocktail_visible_ingredients v join public.ingredients i on i.id = v.id where i.category in ('spirit','liqueur')` → 0 → AC-7
- [ ] `pnpm test` → idea-checks tests pass (parseMocktailsOnly, visibleIngredientNames, prompt wording) → AC-8
- [ ] The deployed `generate-drink-idea` imports `idea-checks.ts` and reads `mocktailsOnly` (check its source in the dashboard) → AC-8

### Value sourcing
- [ ] Ingredient lists: pantry, ingredient search, and shopping list come from `mocktail_visible_ingredients` (staples included, no spirit or liqueur) → Value sourcing row 3
- [ ] AI idea: allowed pantry names come from pantry rows joined to `mocktail_visible_ingredients` server side, flag from the request body → Value sourcing row 7
- [ ] Popular region list comes from `list_popular_regions(mocktails_only => true)` → Value sourcing row 8

### Acceptance criteria coverage (milestone 2)
- AC-5 drink ideas, recommendations, more like this, popular, homepage, favorites, recently viewed · AC-7 pantry, ingredient search, shopping list, visible view · AC-8 AI ideas flag, filtered pantry, prompt · AC-17 SQL default checks for the ten functions · AC-19 `enabled` waits for the gate state on every list

## Milestone 3: hidden areas on web

### UI / manual
- [ ] In the mode, open `/learn` → tiles for Tools and Other only; no Spirits, Wine, or Beer tile and no quiz link, before hydration too (throttle JavaScript) → AC-9, AC-10, AC-14
- [ ] In the mode, open `/learn/spirits`, `/learn/wine`, `/learn/beer`, and an article under each → the notice, focus on its heading, tab title `mocktails.unavailableTitle` → AC-9, AC-18
- [ ] In the mode, `/learn/tools` and an article under it render normally, with no quiz link → AC-9, AC-10
- [ ] In the mode, `/quizzes` and a quiz page → the notice; no Quizzes entry in the Learn dropdown or the mobile drawer → AC-10
- [ ] In the mode, `/service` and each `/service/*` route (invite accept too) → the notice; no Service link in the header or drawer, before hydration too → AC-11, AC-14
- [ ] In the mode, the account menu (header and drawer) has no Sign in, Account, or Bartender Mode entry; Favorites, Theme, and Language stay → AC-11, AC-12
- [ ] In the mode, `/account` and `/account/reset-password` → the notice → AC-12
- [ ] In the mode, signed in as an admin, `/admin/recipes`, `/admin/comments`, and `/admin/ingredients` → the notice → AC-12
- [ ] In the mode, on a mocktail safe recipe: the rating summary and other people's comments (names, text, screened photos) show; no composer, no sign in prompt, no rating stars to tap, no Report or Block button, no report action in the photo viewer, no edit or delete on own comments → AC-12
- [ ] In the mode, reach the AI ideas daily limit → the message has no sign in offer → AC-12
- [ ] In the mode, no consent banner and no request to the PostHog host on any page → AC-13
- [ ] As an adult, every page above looks exactly as before (no notice, every link and control present) → AC-17

### Commands
- [ ] `pnpm --filter web typecheck` and `pnpm test` pass → AC-9 to AC-12
- [ ] `curl` the server HTML of `/en/learn/spirits`, `/en/quizzes`, `/en/account`, `/en/service` → each holds a `data-mocktails="hide"` wrapper and a `data-mocktails="notice"` block → AC-14

### Value sourcing
- [ ] Learn notice: hidden categories come from `MOCKTAILS_HIDDEN_LEARN_CATEGORIES` (`spirits`, `wine`, `beer`) checked against the route's `category`; `tools` and `other` stay → Value sourcing row 5
- [ ] Quiz, service, account, admin notices: the route itself, through each area's layout → Value sourcing row 6

### Acceptance criteria coverage (milestone 3)
- AC-9 Learn tiles, category and article routes · AC-10 quiz links, nav entry, quiz routes · AC-11 Service link, Bartender Mode toggle, service routes · AC-12 account and admin routes, sign in entries, composer, report, block, photo report, rating control, limit message · AC-13 no change needed (providers wait for `confirmed`) · AC-14 server rendered markers on every hidden area
