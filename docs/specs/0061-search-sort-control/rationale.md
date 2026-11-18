# 0061. Search sort control (Popular or A to Z): rationale

Decision record for [index.md](index.md). `/develop` builds from `index.md`; this file explains why.

## Context

Spec 0038 changed the default search order from alphabetical to "famous drinks first" and named the cost in its Consequences: alphabetical browsing is gone unless a sort control is added. Scope feature 62 asks for that control on web and mobile, with the choice sticking for the session.

How search works today. Both apps call `searchRecipes` in `packages/shared/src/recipes.ts`, which calls the `search_recipes` Postgres function (latest body in `supabase/migrations/20261114180000_merge_aliases.sql`). The function builds one result set from six groups (full text name matches, close trigram name matches, CJK name matches, merge alias matches, ingredient matches, and "browse all" when the box is empty). Each row carries a `match_bucket` (0 for a full text name match or browse all, 1 for a close name, CJK, or alias match, 2 for an ingredient only match). It orders by `match_bucket`, relevance `rank`, `fame_score desc nulls last`, `name`, `id`. The `name` tiebreak uses the database default collation (`en_US.UTF-8`, ICU provider), so Cyrillic, kana, Hangul, and Devanagari names come out in a Latin centric order.

Two live facts shape this. First, all 475 live recipes have `fame_score = null`: the tagging run from spec 0038 (`tag-regions` then `apply-regions`) never happened, and spec 0056's fame on arrival only scores new imports. So today Popular already falls through to name order, and a toggle would change nothing visible. Second, the live database has an ICU collation for every app locale (`en-x-icu`, `es-x-icu`, `pt-x-icu`, `fr-x-icu`, `ru-x-icu`, `hi-x-icu`, `ja-x-icu`, `ko-x-icu`, `zh-Hans-x-icu`), so a locale correct alphabetical order needs no extension or new data.

On the clients, web search (`apps/web/src/recipes/search-page-client.tsx`) keeps the query in `?q=` and the status chips in component state; the server page (`apps/web/src/app/[locale]/search/page.tsx`) renders the first page of browse results. Mobile search (`apps/mobile/src/app/search.tsx`) is a stack route that unmounts when you leave it, so any state there is lost on back. Its strings are still hardcoded English (feature 83 will sweep them). Mobile builds already in people's hands call `search_recipes` with five named arguments and must keep working.

## Options considered

### Option 1: One optional `sort_order` parameter on `search_recipes`

Add `sort_order text default 'popular'` to the existing function and switch the `order by` on it. Popular keeps today's terms exactly. A to Z orders by `match_bucket`, then the name under the locale's ICU collation, then `id`. Clients pass the sort through `searchRecipes`.

**Pros**:
- One function, one result set, one pagination model; the match logic is not copied.
- Server side order means infinite scroll pages stay consistent.
- Default keeps old callers working untouched.

**Cons**:
- Postgres `COLLATE` takes only a literal, so a per locale order needs one `order by` term per locale (nine short terms) instead of one.
- Changing the signature means a drop and recreate, so the rollback must restore the old function by hand.

### Option 2: A separate `browse_recipes_az` function

Leave `search_recipes` alone and add a second function just for alphabetical order, called when A to Z is on.

**Pros**:
- Zero risk to today's order.
- Each function stays simpler to read.

**Cons**:
- The six match groups (full text, trigram, CJK, alias, ingredient, browse all) would be copied into a second function, and every future change to matching (like spec 0056's aliases) would have to land twice.
- Two RPCs for one screen doubles the client wiring and tests.

### Option 3: Sort on the client

Keep the RPC as is and sort the received rows by name in the app with `Intl.Collator`.

**Pros**:
- No migration.
- `Intl.Collator` handles locales well.

**Cons**:
- Results are paged 20 at a time, so sorting a page sorts only that page; page 2 would start over at A. Fixing that means fetching the whole catalog (475 rows today, growing) to every client.
- Hermes `Intl` support on Android varies by build, so mobile order could differ from web.

## Rationale

The order has to come from the database because results are paged (Context: 20 per page, infinite scroll). Any client side sort breaks the moment a second page loads, which rules out Option 3 for the core behavior. Between the two database options, the match logic in `search_recipes` is the part that keeps changing (CJK search, then merge aliases, in the last two weeks), so copying it into a second function (Option 2) creates exactly the drift this repo has already paid for once (spec 0038 had to codify columns that existed only live). A single function with a default parameter also gives AC-14 for free: PostgREST resolves a call with five named arguments to the six argument function by using the default.

Keeping `match_bucket` first in A to Z follows the engineer's choice (alphabetical within match groups). I kept the three existing buckets rather than merging buckets 0 and 1 into one "name match" group. Bucket 1 holds trigram and alias matches, which can be loose (word similarity above the threshold), and putting them below the exact word matches keeps A to Z as trustworthy as Popular about what you typed. Runner up: merge 0 and 1, which reads more purely alphabetical but lets a fuzzy match outrank an exact one.

Per locale collation (AC-6) is the engineer's pick and is cheap here: the collations already exist live, and at 475 rows the extra sort terms cost nothing measurable (spec 0038 already judged indexes unnecessary at this size). The values `'popular'` and `'az'` are used everywhere (SQL, shared type, URL, analytics) so there is one vocabulary instead of mapping `az` to `name` at each boundary. Runner up: `'name'` in SQL and `az` only in the URL, which is more descriptive in SQL but adds a translation step and a place for bugs.

On web, the URL carries the sort so the server renders the right order first (AC-8). `sessionStorage` (per tab memory that ends when the tab closes) covers the case where you come back without the param (AC-9), as the engineer chose. That path shows the Popular first page briefly and then switches, because the server cannot read `sessionStorage`. A session cookie would avoid that flash but would leak the choice across tabs and survive browser "restore session" for days, which is not "the session". The flash happens only on that one path and only for people who chose A to Z, so it is the smaller cost.

On mobile, the search route unmounts on back, so the choice needs to live above it. A small React context mounted in the root layout is the in memory home that fits the repo rule against shared mutable module state, and it disappears when the process ends (AC-10). Runner up: TanStack Query cache as a store, which works but bends a server cache into a UI preference store.
