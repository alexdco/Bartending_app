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

## Milestone 4: mobile parity

Run on a dev client build. Answering "No" lives in memory, so force quit the app to start over.

### UI / manual
- [ ] Fresh launch, answer No → the blocked screen shows "Continue with mocktails only" under the blocked text, plus the privacy link; no control asks the age question again → AC-1
- [ ] Tap Continue → the overlay closes, the Home screen shows the "Mocktails only" pill at the top, readable in light and dark → AC-1, AC-15
- [ ] Force quit and reopen → the age question shows again → AC-2
- [ ] Answer Yes once, force quit, reopen → full app, no question, no pill (confirmed wins) → AC-3
- [ ] In the mode, Search: no status chips; typing "margarita" shows `search.mocktailsEmpty`; every result is a mocktail; scrolling loads more pages of mocktails → AC-5
- [ ] In the mode, Home: classics, recommendations, ideas carousel, recently viewed, and the popular region row hold only mocktails → AC-5
- [ ] In the mode, Popular: only regions with a mocktail, only mocktails in each, no "Take the quiz" card → AC-5, AC-10
- [ ] In the mode, Favorites (with an alcoholic favorite saved earlier as an adult): only mocktail favorites show → AC-5
- [ ] In the mode, Pantry search for "vodka" → no result; a vodka row added as an adult is not shown; the Shopping list hides it the same way → AC-7
- [ ] In the mode, Drink ideas: matches are mocktails only; "Generate a new idea" returns a non alcoholic drink built from visible pantry items → AC-5, AC-8
- [ ] In the mode, reach the AI ideas daily limit → the message has no sign in link → AC-12
- [ ] In the mode, deep link to an alcoholic recipe (`cocktailist://recipe/<margarita id>`) → only a spinner, then the notice; no name, image, ingredients, rating, or comments at any moment; screen reader focus lands on the notice title → AC-6, AC-18
- [ ] In the mode, its "More like this" route → spinner, then the notice → AC-6
- [ ] In the mode, a mocktail recipe: rating summary and other people's comments show; no composer, sign in prompt, rating stars, Report, Block, photo report, or edit and delete on own comments → AC-12
- [ ] In the mode, Learn: only Tools and Other tiles, no "Take a quiz" card; Tools has no quiz card; deep links to `learn/spirits`, `learn/wine`, `learn/beer`, and an article under each → the notice → AC-9, AC-10
- [ ] In the mode, deep links to `quizzes`, a quiz, `service`, `bartender-search`, `bartender-build/recipe/<id>`, `bar-invite`, `bar-invite-accept`, `bar-recipe-form`, `account`, and `auth/reset-password` → the notice → AC-10, AC-11, AC-12
- [ ] In the mode, the header has no sign in or account badge, and there is no Service tab even for a signed in bartender → AC-11, AC-12
- [ ] In the mode, no request reaches the PostHog host (proxy or network inspector) → AC-13
- [ ] As an adult, every screen above looks exactly as before → AC-17

### Commands
- [ ] `pnpm --filter mobile typecheck`, `pnpm --filter mobile lint`, and `pnpm test` pass (the locale parity test covers the six new keys in all nine mobile locales) → AC-18

### Value sourcing
- [ ] Mode on or off: in memory `mocktails` in `use-age-gate`, passed to `MocktailsOnlyProvider`; a force quit clears it → Value sourcing row 1
- [ ] Recipe notice: `RecipeDetail.mocktailSafe` from `fetch_recipe_detail`; check a recipe marked `non_alcoholic` but holding a spirit (Fancy White Russian before its fix) shows the notice → Value sourcing row 4
- [ ] Learn notice: `isMocktailsHiddenLearnCategory` on the route's `category` → Value sourcing row 5

### Acceptance criteria coverage (milestone 4)
- AC-1 overlay button · AC-2 memory only · AC-3 resolver precedence · AC-5 every list hook passes the flag and keys on it · AC-6 recipe and more like this notice after a loading only state · AC-7 pantry, shopping list, ingredient search · AC-8 AI ideas flag · AC-9 Learn grid and routes · AC-10 quiz links and routes · AC-11 service tab and bar screens · AC-12 account badge, account screens, comments, rating, limit message · AC-13 analytics wait for `confirmed` (no change) · AC-15 Home pill · AC-16 nothing stored, so nothing can throw · AC-19 lists wait for the provider's known state

## Milestone 5: seven more locales, accessibility, and the full manual pass

The six new keys were already translated in pt, fr, ru, hi, ja, ko, and zh on both apps, with identical wording on web and mobile. None of them inserts a value, so nothing new goes on the reviewed placeholder lists (`placeholderMessages.ts`, the list spec 0062 used).

### UI / manual: locales
- [ ] In the mode, switch the web locale through `pt`, `fr`, `ru`, `hi`, `ja`, `ko`, `zh` on the header and on the Fancy White Russian page → the badge and notice title read: pt "Só mocktails" / "Indisponível no modo só mocktails"; fr "Mocktails uniquement" / "Indisponible en mode mocktails uniquement"; ru "Только моктейли" / "Недоступно в режиме «только моктейли»"; hi "सिर्फ़ मॉकटेल" / "सिर्फ़ मॉकटेल मोड में उपलब्ध नहीं"; ja "モクテルのみ" / "モクテルのみモードでは利用できません"; ko "목테일 전용" / "목테일 전용 모드에서는 이용할 수 없습니다"; zh "仅限无酒精饮品" / "仅限无酒精饮品模式下不可用"; no English text left in the notice, badge, or empty search message → AC-18
- [ ] In a fresh tab on `/ja` and `/hi`, answer "No" → the button reads "モクテルのみで続ける" and "सिर्फ़ मॉकटेल के साथ आगे बढ़ें", and the text fits the blocked screen at phone width without clipping → AC-1, AC-18
- [ ] On mobile, set the device language to one of the seven, force quit, answer No → the overlay button, the Home pill, and a recipe notice show the same strings as web → AC-18

### UI / manual: accessibility of the notice and badge
- [ ] Web, in the mode, open the Fancy White Russian page with a screen reader (NVDA or VoiceOver) → the notice title is announced as heading level 1 and gets focus; Tab reaches "Browse mocktails" next and it is announced as a link → AC-18
- [ ] Web, the header badge is plain text: Tab skips it, the screen reader reads "Mocktails only" in reading order, and its contrast holds in light and dark → AC-15, AC-18
- [ ] Mobile, with TalkBack or VoiceOver, deep link to an alcoholic recipe → focus lands on the title, announced as a heading; the next swipe reaches the body, then "Browse mocktails" announced as a link → AC-18
- [ ] Optional now, required once feature 61 lands: run the axe suite (`pnpm --filter web test:a11y`) with the notice page and the header badge in the fixture list → no serious or critical violation → AC-18

### UI / manual: one full pass, start to finish
- [ ] Web, fresh tab: age gate No → Continue → walk Home, Search, a mocktail recipe, an alcoholic recipe, More like this, Popular, Drink ideas (plus Generate), Favorites, Pantry, Shopping list, Learn, a quiz URL, Service, Account → only mocktails anywhere, the notice everywhere else → AC-1, AC-5 to AC-12
- [ ] Open a new tab (not a duplicate) → the age question again; duplicate the original tab → still in the mode → AC-2
- [ ] Private window with site data blocked: No → Continue → the mode works for that page load; reload asks again → AC-16

### Commands
- [ ] `npx vitest run apps/web/src/i18n apps/mobile/src/i18n` → all pass (key parity in all nine locales on both apps, the Chinese and Korean string checks, the placeholder lists) → AC-18
- [ ] `pnpm --filter web exec eslint src/mocktails src/components/site-nav.tsx src/age-gate` and `pnpm --filter mobile exec eslint src/mocktails src/age-gate` → no errors (web includes `jsx-a11y`) → AC-18

### Acceptance criteria coverage (milestone 5)
- AC-18 every new key in all nine locales on both apps (parity test plus the per locale manual step), notice heading, link, and focus (screen reader steps), automated checks (the `jsx-a11y` lint today; the axe scan once feature 61 ships). The full pass rechecks AC-1, AC-2, AC-5 to AC-12, and AC-16 end to end.
