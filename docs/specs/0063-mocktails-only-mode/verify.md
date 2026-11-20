# Verify: Mocktails only mode · spec 0063 · updated 2026-11-19
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
