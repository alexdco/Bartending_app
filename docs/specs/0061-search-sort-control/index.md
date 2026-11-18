# 0061. Search sort control (Popular or A to Z)

**Date**: 2026-11-17
**Status**: In Progress

## Summary

Search gets a small two option toggle, Popular or A to Z, on web and mobile. Popular keeps today's order (best match first, then famous drinks). A to Z sorts by the drink name in the reader's own alphabet. When a search is typed, name matches still come before ingredient matches. The choice lives in the URL plus the tab's session on web, and in memory until the app closes on mobile. The database change is one new optional parameter on the existing `search_recipes` function, so older app builds keep working. The build also runs the fame tagging that spec 0038 left undone, because without fame scores the two orders look identical.

Reasoning and options: see [rationale.md](rationale.md).

## Requirements

**User stories**:
- As someone browsing recipes, I want to list them A to Z so that I can scan for a drink by name the way a menu or book index works.
- As someone searching, I want A to Z to still show drinks named like my search before drinks that only contain it as an ingredient, so that alphabetical order does not bury the drink I typed.
- As a reader in Japanese, Russian, or another non Latin locale, I want A to Z to follow my own alphabet so that the list looks ordered to me.
- As a returning visitor in the same session, I want my sort choice remembered so that I do not have to pick it again every time I open search.

**Acceptance criteria**:
- **AC-1**: Web `/search` shows a sort control labelled "Sort" with two options, Popular and A to Z, on its own row under the status chips. Exactly one option is selected at all times (choosing the selected one again does nothing). Popular is the default.
- **AC-2**: The mobile search screen shows the same control, in the same place, with the same rules as AC-1.
- **AC-3**: With Popular selected, results and their order are identical to today's `search_recipes` output for the same query, status filter, and locale (match bucket, relevance rank, `fame_score` descending with nulls last, name, id).
- **AC-4**: With A to Z selected and an empty search box, every live recipe that passes the status filter is listed in order of its displayed name (the locale resolved name, `coalesce(rt.name, r.name)`), compared with the current locale's alphabet, with `id` as the final tiebreak.
- **AC-5**: With A to Z selected and a typed query, the set of results is exactly the Popular set for that query, ordered by `match_bucket` (0, then 1, then 2) and, within each bucket, by displayed name in the locale's alphabet, then `id`. Example: searching "lime" lists a drink named Lime Rickey (bucket 0) before a drink that only contains lime (bucket 2), even if the second name sorts earlier alphabetically.
- **AC-6**: A to Z compares names with the ICU collation of the resolved locale: `en-x-icu` (English, where `resolve_locale` returns null), `es-x-icu`, `pt-x-icu`, `fr-x-icu`, `ru-x-icu`, `hi-x-icu`, `ja-x-icu`, `ko-x-icu`, `zh-Hans-x-icu` (pinyin order). Checks: in `ru`, a name starting with Ё sorts after names starting with Е and before names starting with Ж; in `es` and `fr`, a name starting with an accented capital (for example Á or É) sorts among the A or E names, not after Z. Recipes with no translation in that locale sort by their English name under the same collation, which in `ja`, `ko`, and `zh` places those Latin names before the native script names. Accepted limit: `ja-x-icu` orders kanji by code point, not by reading (Japanese recipe names here are mostly katakana, which sort in kana order).
- **AC-7**: Switching the sort starts the list again from the first page and scrolls back to the top of the results. Scrolling through every page in either order shows each matching recipe exactly once (no duplicates, no gaps), because the order always ends in `id`.
- **AC-8**: On web, choosing A to Z puts `sort=az` in the URL next to any `q`; choosing Popular removes `sort`. A sort change adds a history entry (`router.push`), typing keeps replacing the current one (`router.replace`, as today), and neither ever drops the other's param. Loading `/search?sort=az` with no `q` renders A to Z results in the first server render, with no reorder after load (with a `q`, results load on the client, as today). Browser back after a sort change returns to the previous sort. Any other `sort` value reads as Popular.
- **AC-9**: On web, after choosing a sort, opening `/search` again in the same tab without a `sort` param (for example from the nav) restores the last choice for that tab. A new tab or a new browser session starts at Popular. Restoring a stored choice is not a user change: it sends no analytics event and does not add a history entry (it uses `router.replace`).
- **AC-10**: On mobile, the choice survives leaving search and coming back, for as long as the app process lives. A fresh app launch starts at Popular. Nothing is written to device storage.
- **AC-11**: The words "Sort", "Popular", and "A to Z" come from translation keys in all nine locales on both apps (web `next-intl`, mobile `i18next`), never English literals, using the strings in the **Strings** table below. In locales whose script is not Latin, the A to Z label is the natural "by name" wording for that language, not the Latin letters.
- **AC-12**: The control is accessible. Web: a radio group with an accessible name ("Sort"), each option a radio with its checked state, arrow keys move between options, visible focus ring. Mobile: `accessibilityRole="radiogroup"` with the "Sort" label, each option `accessibilityRole="radio"` with `accessibilityState={{ checked }}`, each at least 44 by 44 points.
- **AC-13**: A user changing the sort sends one `search_sort_changed` analytics event with `from`, `to` (`"popular"` or `"az"`), and `has_query` (boolean). The existing `search_performed` event gains a required `sort` property, and its once per query dedupe is keyed on query plus sort, so changing the sort during a typed search fires `search_performed` again with the new sort. Both apps send both.
- **AC-14**: Callers that do not pass a sort (mobile builds already released, the admin recipe list, the web home hero) keep getting exactly today's Popular order with no error.
- **AC-15**: Before `/check verify` (it does not block merging the code), the live catalog has a `fame_score` on every live recipe (the spec 0038 tagging run is done), so browsing in Popular and A to Z visibly gives different first pages.

## Decision

**Chosen option**: Option 1: One optional `sort_order` parameter on `search_recipes`

Add `sort_order` (`'popular'` default, or `'az'`) to `search_recipes`, order A to Z by match bucket then locale collated name then `id`, and carry the choice in a shared `SearchSort` type through `searchRecipes`, the web URL plus `sessionStorage`, and a mobile in memory context.

**Implementation skills**: `supabase-postgres-best-practices` (`supabase/agent-skills`, `.agents/skills/supabase-postgres-best-practices/`) · `nextjs-app-router-patterns` (`wshobson/agents`, `.agents/skills/nextjs-app-router-patterns/`) · `react-native-best-practices` (`callstackincubator/agent-skills`, `.agents/skills/react-native-best-practices/`) · `vitest` (`antfu/skills`, `.agents/skills/vitest/`) · `posthog-instrumentation` (`posthog/posthog-for-claude`, `.agents/skills/posthog-instrumentation/`)

## Feature design

**Data model sketch**: no table, column, or index changes. The only schema change is the `search_recipes` function signature. Existing columns used: `recipes.name`, `recipes.fame_score`, `recipe_translations.name`, plus the existing `match_bucket` and `rank` computed inside the function.

**State transitions**: the sort is a two value state, `popular` and `az`. Either can move to the other by a tap or click. There is no "none" state (AC-1).

**API surface**:
| Surface | Kind | Key inputs | Key outputs | Auth | Key errors |
|---|---|---|---|---|---|
| `public.search_recipes(query, status_filter, page_limit, page_offset, locale, sort_order)` | Postgres RPC, `language sql stable`, `set search_path = ''` | existing five args unchanged; `sort_order text default 'popular'` | unchanged: `id, name, image_url, alcoholic_status, base_name` | `execute` granted to `anon, authenticated, service_role`; revoked from `public` | none new. Any value other than `'az'` behaves as `'popular'` (a pure SQL function cannot raise cleanly here, and the client type already limits the value) |
| `searchRecipes(client, { ...existing, sort })` in `packages/shared/src/recipes.ts` | shared function | `sort?: SearchSort`, default `"popular"`; always sent as `sort_order` (never omitted) | `RecipeSearchResult[]` unchanged | caller's client | throws the Supabase error as today |
| `SearchSort`, `SEARCH_SORTS`, `DEFAULT_SEARCH_SORT`, `parseSearchSort(raw: unknown): SearchSort` in `packages/shared/src/recipes.ts` | shared type and pure helper | any value (URL param, storage) | `"popular" \| "az"`; anything not exactly `"az"` gives `"popular"` | n/a | none |
| `buildSearchSortChangedEvent({ from, to, has_query })` in `packages/shared/src/analytics.ts`; `ANALYTICS_EVENT_NAMES.searchSortChanged = "search_sort_changed"`; `SearchPerformedProperties.sort: SearchSort` | shared analytics builders | as named | `AnalyticsEvent` | n/a | none |
| Web `/[locale]/search?q=&sort=az` | Next.js page | `q`, `sort` search params | server rendered first page in that sort | public | unknown `sort` reads as Popular |
| Web `SegmentedControl` in `apps/web/src/components/segmented-control.tsx` | UI primitive on `radix-ui` `ToggleGroup` (`type="single"`) | `label`, `options`, `value`, `onValueChange` | radio group | n/a | ignores the empty value Radix emits when the selected item is pressed again (AC-1) |
| Mobile `SegmentedControl` in `apps/mobile/src/components/segmented-control.tsx` | UI primitive, `View` plus `Pressable` per option | same props | radio group | n/a | none |
| Mobile `SearchSortProvider` and `useSearchSort()` in `apps/mobile/src/recipes/search-sort-context.tsx` | React context, mounted in `apps/mobile/src/app/_layout.tsx` above the navigator | none | `[sort, setSort]` | n/a | outside the provider it returns `DEFAULT_SEARCH_SORT` and a no op setter instead of throwing, so existing screen tests keep rendering |

The A to Z `order by`. `resolve_locale` returns a supported non English code, or null for English (and for anything unsupported), so English is matched with `is null`. Add a one row CTE beside the existing ones and cross join it in the final select:

```sql
  sort_key as (
    select (select locale from resolved_locale) as loc,
           sort_order = 'az' as az
  )
  select c.id, c.name, c.image_url, c.alcoholic_status, c.base_name
  from combined c
  cross join sort_key s
  order by
    c.match_bucket asc,
    case when s.az then null else c.rank end desc,
    case when s.az then null else c.fame_score end desc nulls last,
    (case when s.az and s.loc is null then c.name end) collate "en-x-icu",
    (case when s.az and s.loc = 'es' then c.name end) collate "es-x-icu",
    (case when s.az and s.loc = 'pt' then c.name end) collate "pt-x-icu",
    (case when s.az and s.loc = 'fr' then c.name end) collate "fr-x-icu",
    (case when s.az and s.loc = 'ru' then c.name end) collate "ru-x-icu",
    (case when s.az and s.loc = 'hi' then c.name end) collate "hi-x-icu",
    (case when s.az and s.loc = 'ja' then c.name end) collate "ja-x-icu",
    (case when s.az and s.loc = 'ko' then c.name end) collate "ko-x-icu",
    (case when s.az and s.loc = 'zh' then c.name end) collate "zh-Hans-x-icu",
    c.name asc,
    c.id asc
  limit least(greatest(page_limit, 1), 50)
  offset greatest(page_offset, 0);
```

Each locale term is null for every other locale, so only one collation ever applies (one CASE that switched collation per branch would fail with a collation conflict, which is why the terms are separate). In Popular every A to Z term is null for every row, so the remaining terms equal today's order exactly (AC-3). `sort_order` matches exactly: `'AZ'` or `' az'` read as Popular, the same rule as `parseSearchSort`.

**Strings** (key, then en, es, pt, fr, ru, hi, ja, ko, zh). Web keys go in the existing `search` namespace in `apps/web/messages/*.json`. Mobile keys go in a new `search` object in each `apps/mobile/src/i18n/locales/*.json`; those files are already registered as resources in `apps/mobile/src/i18n/index.ts`, so no registration change is needed (confirm while building).

| Key | en | es | pt | fr | ru | hi | ja | ko | zh |
|---|---|---|---|---|---|---|---|---|---|
| `search.sortLabel` | Sort | Ordenar | Ordenar | Trier | Сортировка | क्रम | 並べ替え | 정렬 | 排序 |
| `search.sortPopular` | Popular | Populares | Populares | Populaires | Популярные | लोकप्रिय | 人気順 | 인기순 | 热门 |
| `search.sortAz` | A to Z | A a Z | A a Z | A à Z | По алфавиту | वर्णानुक्रम में | 名前順 | 이름순 | 按名称 |

**Value sourcing**:
| Action | Value produced / displayed | Source |
|---|---|---|
| Search RPC | which order to use | `sort_order` input param, from `searchRecipes({ sort })` |
| Search RPC | displayed name that A to Z compares | `coalesce(rt.name, r.name)`, already computed as `c.name` |
| Search RPC | which alphabet to compare with | resolved locale from `public.resolve_locale(locale)` (existing CTE), mapped to an ICU collation by the fixed table in AC-6 |
| Search RPC | match group | existing `match_bucket` per CTE (0, 1, 2) |
| Web page (server) | initial sort | `searchParams.sort` through `parseSearchSort`; the server still fetches only the empty query first page, now with that sort |
| Web client | current sort | derived from `useSearchParams().get("sort")` through `parseSearchSort` (the URL is the single source of truth, no duplicate state); on mount, if the URL has no `sort` and `sessionStorage["search.sort"]` parses to `"az"`, `router.replace` the URL to add `sort=az` |
| Web client | URL on change | one helper builds `/search` plus `q` (if any) plus `sort=az` (if A to Z); the existing debounced `q` effect uses it with the current sort (so it never strips `sort`), and the sort change handler uses it with `router.push` |
| Web client | remembered sort for the tab | `sessionStorage` key `search.sort`, written only in the user's change handler (Popular writes `"popular"`), never on restore; every read and write wrapped in `try`/`catch` (private mode can throw) |
| Web client | whether server results can seed the query | `initialData` only when `q` is empty, status filter is null, and the client sort equals the sort the server rendered with (passed down as a prop `initialSort`) |
| Web client | scroll on change | `window.scrollTo({ top: 0 })` in the sort change handler |
| Mobile screen | current sort | `useSearchSort()` from the root context, default `DEFAULT_SEARCH_SORT` |
| Mobile screen | control position | inside the existing fixed header `View`, directly under the status chips, not inside the `FlatList` |
| Mobile screen | scroll on change | FlatList ref, `scrollToOffset({ offset: 0, animated: false })` in the change handler |
| Both | `search_performed` dedupe key | `` `${debouncedQuery}:${sort}` `` in `lastFiredQueryRef` |
| Both | TanStack Query key | `["recipes", "search", { query, statusFilter, locale, sort }]` (add `sort` to `recipeSearchQueryKey` in both apps) |
| Both | labels | translation keys `search.sortLabel`, `search.sortPopular`, `search.sortAz` (web `apps/web/messages/*.json`; mobile `apps/mobile/src/i18n/locales/*.json`, new `search` namespace there) |
| Analytics | `from`, `to` | previous and new `SearchSort` values at the change handler |
| Analytics | `has_query` | `debouncedQuery !== ""` at the moment of change |
| Analytics | `sort` on `search_performed` | the sort used for the page that event reports |
| Fame order (AC-15) | `fame_score` per recipe | the spec 0038 tagging run: `pnpm --filter @bartendingapp/shared tag-regions` (Claude Haiku proposals, needs `ANTHROPIC_API_KEY` locally), human spot check, then `pnpm --filter @bartendingapp/shared apply-regions` |

**Key invariants**:
- Popular order is byte for byte today's order; this feature must not change what anyone sees by default.
- A to Z returns the same rows as Popular for the same inputs; only the order differs.
- Every order ends in `c.id`, so paging is stable.
- The sort is never `undefined` or empty in client state; it is always exactly `"popular"` or `"az"`.
- The function keeps `set search_path = ''` and schema qualified names (`extensions.`, `public.`).

**Security model**: unchanged. `search_recipes` stays public read (`anon`, `authenticated`), reading only live public recipe data. `sort_order` is never interpolated into SQL text; it is only compared with a literal, so it adds no injection surface. The recreated function must repeat the `revoke ... from public` and `grant execute ... to anon, authenticated, service_role` lines for the new six argument signature. No PII; the analytics properties are a sort value and a boolean.

**Configuration required**:
- `ANTHROPIC_API_KEY`: already used by `tag-regions`; needed locally once for the AC-15 tagging run. No new variables.

**Critical test scenarios**:
- Popular unchanged: for a fixed seed, `search_recipes` with no `sort_order` and with `'popular'` returns the same rows in the same order as the pre migration function, for an empty query and for "lime", verifies **AC-3**, **AC-14**.
- A to Z browse: empty query, `sort_order => 'az'`, `locale => 'en'` returns names in ascending order; with a status filter only that status, verifies **AC-4**.
- A to Z keeps match groups: seed "Lime Rickey" and "Absinthe Lime Splash" (name match) and "Aviation" with a lime ingredient; query "lime" in A to Z lists both name matches (A then L) before "Aviation", verifies **AC-5**.
- Locale alphabet: `ru` translations "Ёрш", "Ежевика", "Жасмин" come back Ежевика, Ёрш, Жасмин; `es` "Ámbar" sorts before "Bellini"; a `ja` recipe with no translation sorts by its English name, verifies **AC-6**.
- Paging: in A to Z with page size 20, reading every page returns each live recipe id once, verifies **AC-7**.
- English collation: with `locale => 'en'` (resolved to null), A to Z uses `en-x-icu`, so "Éclair" sorts among the E names, verifies **AC-6**.
- Unknown sort: `sort_order => 'zzz'` returns the Popular order; `parseSearchSort("zzz")`, `parseSearchSort(undefined)`, `parseSearchSort(["az"])` all give `"popular"`, `parseSearchSort("az")` gives `"az"`, verifies **AC-8**, **AC-14**.
- Web URL: load `/search?sort=az`, first server HTML is in A to Z and the URL keeps `sort=az` after hydration; type "lime", URL becomes `/search?q=lime&sort=az`; click Popular, URL becomes `/search?q=lime` and the list is back at the top; browser back returns to `sort=az` and A to Z, verifies **AC-7**, **AC-8**.
- Web session: pick A to Z, go to the home page, click Search in the nav, list ends in A to Z and URL gains `sort=az`; open `/search` in a new tab, Popular, verifies **AC-9**.
- Web control: pressing the selected option again leaves it selected; arrow keys move selection; screen reader announces "Sort, radio group", verifies **AC-1**, **AC-12**.
- Mobile: pick A to Z, go back, reopen search, still A to Z; kill and relaunch the app, Popular, verifies **AC-2**, **AC-10**.
- Strings: every locale file on both apps has the three keys (a vitest that loads each locale JSON and asserts the keys exist), verifies **AC-11**.
- Analytics: switching sort calls `track("search_sort_changed", { from, to, has_query })` once; restoring from `sessionStorage` calls nothing; with "lime" typed, switching sort fires `search_performed` again with the new `sort`; `buildSearchSortChangedEvent` unit test, verifies **AC-9**, **AC-13**.
- Live fame: after the tagging run, a count of live recipes with null `fame_score` is 0 and the first browse page differs between sorts, verifies **AC-15** (manual, in `/check verify`).

## Build plan

Ordered Tracer Bullet style: the first task carries one real thread from the database to the web screen, then each later task thickens one segment.

1. **Thin thread: A to Z from SQL to the web screen.** Migration `supabase/migrations/<ts>_search_sort_order.sql`, wrapped in `begin; … commit;` like its predecessors so the drop and create land together: `drop function public.search_recipes(text, text, integer, integer, text)`, create the six argument version (body copied from `20261114180000_merge_aliases.sql`, with the `sort_key` CTE and `order by` as designed), repeat revoke and grant for the new signature, `notify pgrst, 'reload schema'`. Before dropping, confirm nothing in the schema depends on the function (`pg_depend`; the admin list and home hero are client callers, not dependents). Rollback `supabase/rollbacks/<ts>_search_sort_order_down.sql` drops the six argument function and recreates the five argument one from the merge aliases migration with its grants. Hand the SQL to the engineer to run in the dashboard SQL editor (this project does not take MCP writes), and wait for them to confirm it applied. Only then regenerate `packages/shared/src/database.types.ts` (the shared call cannot typecheck before that). Shared: `SearchSort`, `SEARCH_SORTS`, `DEFAULT_SEARCH_SORT`, `parseSearchSort`, and `sort` on `searchRecipes` always passing `sort_order`, with vitest cases beside them; confirm the admin list and home hero still typecheck without `sort`. SQL check `supabase/tests/search_sort_check.sql` following `catalog_cleanup_check.sql`: runs inside `begin; … rollback;` with its own seeded rows, asserts the nine collations exist in `pg_collation`, asserts exactly one `search_recipes` in `pg_proc`, compares Popular output against a temporary copy of the old five argument function created inside the transaction, calls the function as `anon` (`set local role anon`), and covers the other SQL scenarios above. Web: `SegmentedControl` primitive, the control on the search page, `sort` in the query key, the URL helper used by both the debounced `q` effect and the sort handler (`push` for sort, `replace` for typing), scroll to top on change, server page reads `searchParams.sort` and passes `initialSort`, and the three strings in all nine `apps/web/messages/*.json`. Satisfies **AC-1**, **AC-3**, **AC-4**, **AC-5**, **AC-6**, **AC-7**, **AC-8**, **AC-11** (web), **AC-12** (web), **AC-14**.
2. **Mobile control and session memory.** `SegmentedControl` primitive (radio roles, 44 point targets, tokens from `design.md`), `SearchSortProvider` in the root layout above the navigator (hook returns the default outside it), `useSearchSort` in the search screen, the control in the fixed header under the chips, scroll to top on change, `sort` in the mobile query key, a new `search` namespace with the three keys in all nine mobile locale files. Satisfies **AC-2**, **AC-10**, **AC-11** (mobile), **AC-12** (mobile).
3. **Web tab memory.** `sessionStorage` key `search.sort` read on mount and written only in the user's change handler, both guarded with `try`/`catch`, restoring a stored `"az"` with `router.replace` only when the URL has no `sort`. Satisfies **AC-9**.
4. **Analytics.** `searchSortChanged` name, `buildSearchSortChangedEvent`, required `sort` on `SearchPerformedProperties`, with unit tests; in the same task fire the new event from both apps' change handlers, add `sort` to both `search_performed` calls, and key both dedupe refs on query plus sort. Satisfies **AC-13**.
5. **Load fame scores live (manual, engineer run, blocks `/check verify`, not the merge).** Run `tag-regions`, spot check the top 50 by fame plus anything odd (fix a wrong pick in the proposals JSON by hand), run `apply-regions`, then confirm the null count is 0. This also closes spec 0038's open tagging task. Satisfies **AC-15**.

## Consequences

**Positive**:
- People who want a menu style list get it back without losing the fame first default.
- Alphabetical order is correct in every app locale, including the non Latin ones, which today's `name` tiebreak is not.
- Popular finally means something live, since the tagging run is part of this build.
- Analytics shows whether anyone uses A to Z, which tells you whether spec 0038's call was right.

**Negative / tradeoffs**:
- The `order by` grows to about fifteen terms; anyone editing `search_recipes` later has to keep the locale table in sync with `SUPPORTED_LOCALES` when a tenth locale lands.
- On web, arriving at `/search` without a `sort` param after choosing A to Z shows the Popular first page for a moment, then a loading spinner, then the A to Z list.
- With a typed `q`, the server still renders nothing query specific, so the first view with `?q=lime&sort=az` loads on the client, as typed searches do today.
- Japanese kanji names sort by code point, not by reading.
- Signature change means the rollback is a hand written recreate, not a simple revert, and the five argument function disappears (any SQL that called it positionally with exactly five args still works through the default).
- The tagging run spends Claude Haiku tokens and needs a human spot check; a bad fame pick becomes visible in Popular immediately.
- The status filter is still not remembered while the sort is, which some people may find inconsistent.

**Neutral**:
- Two new small UI primitives (`SegmentedControl`) on web and mobile, reusable for later two or three way toggles.
- Mobile gets its first `search` translation namespace, which feature 83 will extend.

## Migration plan

**Strategy**: no migration needed for data; one function replacement, backward compatible by default parameter.
**Phases**:
1. Engineer runs the migration SQL in the dashboard. Every existing client keeps working (five named args resolve to the new function's default).
2. Deploy web; release mobile through the usual EAS path. Old mobile builds simply have no toggle.
3. Engineer runs the tagging and apply scripts (build task 5). Popular changes at that moment, with no deploy.
**Rollback**: run the down file to restore the five argument function; clients that send `sort_order` then get a PostgREST "function not found" error, so roll back the web deploy first (mobile builds with the toggle would show the search error state until the function returns). To undo fame scores, follow spec 0038's rollback (set `fame_score`, `region`, `popularity_rank` back to null).
**Risks**: forgetting the grant on the new signature leaves search broken for anonymous users (the SQL check should call the function as `anon`); a collation name typo fails the migration rather than search, which is the safe failure.

## Follow-up

- [ ] Add a check (vitest or SQL) that fails when `SUPPORTED_LOCALES` gains a locale that the A to Z collation table in `search_recipes` does not cover.
- [ ] Decide later whether the status filter should be remembered the same way as the sort (out of scope here).
- [ ] After a few weeks of `search_sort_changed` data, revisit whether A to Z deserves to be the default for browse.
