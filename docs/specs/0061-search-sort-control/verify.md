# Verify: Search sort control · spec 0061 · updated 2026-11-18
_Steps derived from spec 0061 acceptance criteria. `/check verify` runs these; `/test` locks the durable ones._

Before you start: `supabase/migrations/20261118120000_search_sort_order.sql` is live on `BartendingAppWeb` (applied 2026-11-18). The steps marked "after tagging" also need `pnpm --filter @bartendingapp/shared tag-regions`, a spot check of the proposals file (top 50 by fame, plus anything odd), then `pnpm --filter @bartendingapp/shared apply-regions` (AC-15). Until then Popular and A to Z browse look identical, because every `fame_score` is null.

## Commands
- [ ] Paste `supabase/tests/search_sort_check.sql` into the SQL editor → the report (raised as an error, everything rolled back) shows PASS on every line → AC-3, AC-4, AC-5, AC-6, AC-7, AC-14
- [ ] SQL: `select p.oid::regprocedure, p.proacl from pg_proc p where p.proname = 'search_recipes'` → one row, six arguments, execute for anon, authenticated, service_role, no public entry → AC-14, Risks
- [ ] SQL (after tagging): `select count(*) from recipes where deleted_at is null and fame_score is null` is 0 → AC-15
- [ ] SQL (after tagging): first 20 names of `search_recipes('', null, 20, 0, 'en')` differ from `search_recipes('', null, 20, 0, 'en', 'az')` → AC-15
- [ ] `pnpm test` passes, including `packages/shared/src/recipes.test.ts`, `analytics.test.ts`, `apps/web/src/recipes/search-url.test.ts`, and the locale key tests on both apps → AC-8, AC-9, AC-11, AC-13, AC-14

## UI / manual: web
- [ ] Visit `/search` → a "Sort" control sits on its own row under the status chips, Popular selected → AC-1
- [ ] Click Popular while it is selected → it stays selected, nothing reloads → AC-1
- [ ] Tab to the control, use the arrow keys → selection moves between options with a visible focus ring; a screen reader announces "Sort, radio group" and each option as a radio with its checked state → AC-12
- [ ] Load `/search?sort=az` directly with JavaScript throttled or view source → the first server HTML is already in A to Z, the URL keeps `sort=az` after hydration, no reorder → AC-8
- [ ] Load `/search?sort=zzz` → Popular is selected and the order is Popular → AC-8
- [ ] On `/search?sort=az`, type "lime" → URL becomes `/search?q=lime&sort=az` (no new history entry per keystroke) → AC-8
- [ ] With "lime" typed in A to Z → drinks named with lime come first, A to Z, then drinks that only contain lime, A to Z → AC-5
- [ ] Scroll down a few pages, then click Popular → URL becomes `/search?q=lime`, the list is back at the top from the first page → AC-7, AC-8
- [ ] Press browser back → URL returns to `sort=az` and the list is A to Z again → AC-8
- [ ] In A to Z with no query, scroll to the end → no recipe appears twice, the list ends → AC-7
- [ ] Switch the site to `ru`, choose A to Z → names follow the Cyrillic alphabet; switch to `ja` → untranslated (Latin) names come before kana names → AC-6
- [ ] Switch through all nine locales → the three labels are translated, and in ru, hi, ja, ko, zh the A to Z label is the "by name" wording, not Latin letters → AC-11
- [ ] Choose A to Z, go to the home page, click Search in the nav → the list ends up in A to Z and the URL gains `sort=az` → AC-9
- [ ] Open `/search` in a new tab → Popular → AC-9
- [ ] In a private window with storage blocked, change the sort → it still works, no console error → AC-9
- [ ] PostHog live events: changing the sort sends one `search_sort_changed` with `from`, `to`, `has_query`; the restore in the nav step sends none → AC-9, AC-13
- [ ] With "lime" typed, switch the sort → `search_performed` fires again with the new `sort` → AC-13
- [ ] The web home hero ("surprise me") and the admin recipe list still load results → AC-14

## UI / manual: mobile
- [ ] Open search → the "Sort" control sits in the fixed header under the status chips, Popular selected; tapping Popular again does nothing → AC-2
- [ ] Choose A to Z after scrolling → the list returns to the top in A to Z → AC-2, AC-7
- [ ] Choose A to Z, go back, reopen search → still A to Z → AC-10
- [ ] Kill and relaunch the app → Popular → AC-10
- [ ] With VoiceOver or TalkBack → the control reads as a radio group named "Sort", each option a radio with its checked state; each option is at least 44 by 44 points → AC-12
- [ ] Change the app language → the labels follow it in all nine locales → AC-11
- [ ] PostHog: changing the sort sends `search_sort_changed`; with a query typed, `search_performed` fires again with `sort` → AC-13
- [ ] A release build from before this change still searches with no error (five argument call) → AC-14

## Value sourcing
- [ ] Which order: call `search_recipes` with `sort_order` `'az'`, `'popular'`, `'AZ'`, and omitted → only `'az'` changes the order → AC-3, AC-14
- [ ] Displayed name compared: in `es`, a recipe whose Spanish name sorts differently from its English name is placed by the Spanish name → AC-4
- [ ] Which alphabet: same data in `ru` and `en` A to Z gives each locale's own order; English uses `en-x-icu` ("Éclair" among E) → AC-6
- [ ] Match group: "lime" in A to Z keeps bucket 0 before 1 before 2 → AC-5
- [ ] Server initial sort: `/search?sort=az` server HTML is A to Z; `/search` server HTML is Popular → AC-8
- [ ] Client current sort comes from the URL only: edit the URL by hand to add or remove `sort=az` → the control follows it → AC-8
- [ ] URL on change: typing never drops `sort`, a sort change never drops `q` → AC-8
- [ ] Tab memory: `sessionStorage["search.sort"]` is written only on a user change (check DevTools after a restore: unchanged) → AC-9
- [ ] initialData only when it matches: load `/search?sort=az` with no query → no flash of Popular results; load `/search` after choosing A to Z in the tab → Popular first page, then a spinner, then A to Z (accepted tradeoff) → AC-8, AC-9
- [ ] Scroll on change (web `window.scrollTo`, mobile `scrollToOffset`) → list top on both apps → AC-7
- [ ] Mobile current sort from the root context: leaving and reopening search keeps it; nothing appears in AsyncStorage → AC-10
- [ ] Mobile control position: in the fixed header, it does not scroll away with the list → AC-2
- [ ] Dedupe key: same query, same sort, re-render → no second `search_performed` → AC-13
- [ ] Query key: switching sort and back shows the cached first sort instantly (key includes `sort`) → AC-7
- [ ] Labels: every locale file on both apps has `search.sortLabel`, `search.sortPopular`, `search.sortAz` → AC-11
- [ ] Analytics `from`, `to`, `has_query`: values match the change made and whether a query was typed → AC-13
- [ ] `sort` on `search_performed`: equals the sort of the page reported → AC-13
- [ ] Fame order (after tagging): Popular browse opens with famous drinks (Margarita, Mojito and similar), not "A. J." → AC-15

## Acceptance-criteria coverage
- AC-1: web control steps · AC-2: mobile control steps · AC-3: SQL check, Value sourcing "which order" · AC-4: SQL check, displayed name step · AC-5: SQL check, "lime" web step · AC-6: SQL check, locale steps · AC-7: paging and scroll steps · AC-8: URL steps · AC-9: tab memory steps · AC-10: mobile memory steps · AC-11: label steps and locale tests · AC-12: accessibility steps · AC-13: PostHog steps · AC-14: SQL grants, old build, home hero and admin · AC-15: after tagging steps
