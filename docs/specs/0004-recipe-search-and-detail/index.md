# 0004. Recipe search and detail

**Date**: 2026-09-07
**Status**: In Progress

## Summary

This decision fixes how the thinnest real slice of the product works: a user searches cocktail recipes by name or ingredient (with an optional alcoholic status filter), sees image backed results, and opens a detail page with full instructions. It works the same way on the web app and the mobile app, against the real imported recipe data, with no accounts or pantry involved yet. This is the first feature to actually use the data model (spec 0002) and the design system (spec 0003) together.

## Requirements

**User stories**:
- As a home bartender (guest or signed in), I want to search cocktail recipes by name or ingredient, so I can find a drink I already have in mind or one I can make from something I have.
- As a home bartender, I want to filter search results by alcoholic status, so I can find drinks that fit an occasion (e.g. a non alcoholic option).
- As a home bartender, I want to open a recipe and see its full instructions, ingredients, and image, so I can actually make the drink.
- As a home bartender, I want search results to load more as I scroll, so browsing feels continuous rather than paginated.

**Acceptance criteria**:
- **AC-1**: A single search box matches both recipe name and ingredient name in one query; a result matched by name is included even if no ingredient matches, and vice versa.
- **AC-2**: An empty search query (no text entered) shows the first page of all recipes, ordered by name, rather than an empty or blocked state.
- **AC-3**: An alcoholic status filter (alcoholic, non alcoholic, optional, or no filter) narrows results, composing with the search query (both apply together when both are set).
- **AC-4**: Search results paginate at 20 per page via infinite scroll; scrolling near the bottom of the loaded results loads the next page without a full page reload.
- **AC-5**: A recipe result matched by name search is ordered by relevance (best name match first); a recipe matched only through its ingredients (no name match) is appended after, ordered alphabetically by recipe name.
- **AC-6**: Opening a result navigates to a detail page showing the recipe's image (or a fallback placeholder if missing), name, alcoholic status, glass type, its ingredients in the recipe's own order with measures, and full instructions.
- **AC-7**: Requesting a detail page for a recipe id that does not exist, or is soft deleted (`deleted_at` set, per spec 0002's reconciliation), shows a not found state, not an error or a blank page.
- **AC-8**: A failed search or detail query (network error, timeout) shows a visible error state with a retry action, never a silent failure or a crash.
- **AC-9**: Both the search results page and the detail page work identically on the web app and the mobile app against the same live Postgres data (no mocked or platform specific data).

## Options considered

### Option 1: Two client side Supabase queries per search, unioned in application code

The client (web or mobile) issues two separate PostgREST queries against Supabase, one for the full text name match, one for the ingredient trigram match through `recipe_ingredients`, then merges and dedupes the results in TypeScript before rendering.

**Pros**:
- No new backend code; every piece (the two indexes, the client libraries) already exists from spec 0002 and spec 0001.
- Easy to reason about and debug: each query is independently testable, ordinary PostgREST calls.

**Cons**:
- Two round trips per search instead of one; each keystroke or filter change costs two network requests.
- Result ordering (name relevance first, ingredient only matches after) and pagination math (LIMIT/OFFSET across two unioned, differently ordered result sets) have to be done correctly in client code, on two platforms, and kept in sync between them.

### Option 2: A single Postgres function (RPC) that runs the union server side

Add one `search_recipes(query text, alcoholic_status text, limit int, offset int)` Postgres function (called via Supabase's RPC mechanism) that runs both matches, unions and orders them per the confirmed rule, and returns one page of recipe rows. Both apps call the same RPC.

**Pros**:
- One network round trip per search; ordering, deduping, and pagination logic live in one place (the database), not duplicated across two client codebases.
- Matches spec 0002's own precedent: it already put`import_catalog` in a Postgres function for exactly this reason, one source of truth for logic both platforms would otherwise duplicate.

**Cons**:
- A new piece of backend logic (SQL, not TypeScript) to write, test, and evolve, which is less familiar to a team primarily writing TypeScript.
- Business logic in the database is a real place to make mistakes silently (no TypeScript typechecking on the SQL body); needs care and a critical test scenario per behavior.

## Decision

**Chosen option**: Option 2: A single Postgres function that runs the union search server side.

Both apps call one `search_recipes` RPC with the query text, the optional alcoholic status filter, and pagination params; it returns one ordered, paginated page of recipe rows in the shape both clients need.

**Implementation skills**: `nextjs-app-router-patterns` (`wshobson/agents`, `.agents/skills/nextjs-app-router-patterns/`) · `react-native-best-practices` (`callstackincubator/agent-skills`, `.agents/skills/react-native-best-practices/`) · `supabase-postgres-best-practices` (`supabase/agent-skills`, `.agents/skills/supabase-postgres-best-practices/`)

**Reasoning and options considered**: see [rationale.md](rationale.md).

## Feature design

**Data model sketch**: No schema change. This feature reads spec 0002's existing tables (`recipes`, `ingredients`, `recipe_ingredients`) and adds one Postgres function, `search_recipes`, as the query surface. No new tables, columns, or migrations.

**State transitions**: Not applicable. Search and detail are stateless reads; no entity here has a lifecycle this feature manages (recipe lifecycle, including soft delete, is owned by spec 0002's import job).

**`search_recipes` function body (exact, not to be reinvented at build time)**:

```sql
create or replace function public.search_recipes(
  query text default '',
  status_filter text default null,
  page_limit int default 20,
  page_offset int default 0
)
returns table (
  id uuid,
  name text,
  image_url text,
  alcoholic_status text
)
language sql
stable
security invoker
set search_path = ''
as $$
  with name_matches as (
    select r.id, r.name, r.image_url, r.alcoholic_status,
           0 as match_bucket,
           ts_rank(r.name_search, websearch_to_tsquery('english', query)) as rank
    from public.recipes r
    where r.deleted_at is null
      and query <> ''
      and r.name_search @@ websearch_to_tsquery('english', query)
      and (status_filter is null or r.alcoholic_status = status_filter)
  ),
  ingredient_matches as (
    select distinct r.id, r.name, r.image_url, r.alcoholic_status,
           1 as match_bucket,
           0::real as rank
    from public.recipes r
    join public.recipe_ingredients ri on ri.recipe_id = r.id
    join public.ingredients i on i.id = ri.ingredient_id
    where r.deleted_at is null
      and query <> ''
      and i.name % query
      and r.id not in (select nm.id from name_matches nm)
      and (status_filter is null or r.alcoholic_status = status_filter)
  ),
  browse_all as (
    select r.id, r.name, r.image_url, r.alcoholic_status,
           0 as match_bucket,
           0::real as rank
    from public.recipes r
    where r.deleted_at is null
      and query = ''
      and (status_filter is null or r.alcoholic_status = status_filter)
  ),
  combined as (
    select * from name_matches
    union all
    select * from ingredient_matches
    union all
    select * from browse_all
  )
  select c.id, c.name, c.image_url, c.alcoholic_status
  from combined c
  order by c.match_bucket asc, c.rank desc, c.name asc, c.id asc
  limit least(greatest(page_limit, 1), 50)
  offset greatest(page_offset, 0);
$$;

revoke all on function public.search_recipes(text, text, int, int) from public;
grant execute on function public.search_recipes(text, text, int, int) to anon, authenticated;
```

Key points a builder must not deviate from:
- `set search_path = ''` plus schema qualified `public.recipes`/`extensions` operators (the `%` trigram operator resolves via `pg_trgm` living in the `extensions` schema per the search_path hardening migration in spec 0002; `search_path = ''` means the operator itself must already be visible without a schema prefix, which Postgres resolves for operators regardless of `search_path`, but every table and function reference above is explicitly schema qualified to be safe).
- `security invoker` (not `definer`): the function runs under the caller's own `anon`/`authenticated` privileges, so `recipes_select`'s `using (deleted_at is null)` RLS policy would already apply to any direct `recipes` read; the explicit `r.deleted_at is null` predicates in every branch above are defense in depth, not reliance on RLS alone, specifically because `ingredient_matches` joins through `recipe_ingredients`/`ingredients`, whose own policies are `using (true)` with no `deleted_at` awareness.
- `websearch_to_tsquery` (not `plainto_tsquery`): supports the natural "as you type" query style users expect (quoted phrases, `-exclude` terms) without the caller constructing tsquery syntax.
- The empty query path (`browse_all`) is its own branch, not a fallthrough, because `websearch_to_tsquery('english', '')` returns an empty tsquery that matches nothing, not everything.
- `ingredient_matches` excludes any id already in `name_matches` (`UNION ALL`, not `UNION`, since dedup is explicit and cheaper than a distinct-across-buckets sort), which is what "matched by name search is included even if no ingredient matches, and vice versa" (AC-1) resolves to without double-listing a recipe matched by both.
- Final `ORDER BY` ends in `c.id asc`: the deterministic tiebreak that makes `LIMIT`/`OFFSET` stable across page boundaries even when many rows tie on `rank` (a near-certainty on a short query against 426 recipes).
- `page_limit` is clamped to 1 to 50 (`least(greatest(page_limit, 1), 50)`) so a caller cannot request an unbounded page.
- `LIMIT`/`OFFSET` clamp expressions are inlined directly (not read from a separate CTE column); Postgres rejects a CTE column reference in `LIMIT`/`OFFSET` for a plain `language sql` function (`ERROR 42P10: argument of OFFSET must not contain variables`), confirmed by running this exact function body against the live database in a rolled back transaction.

**This function body was verified live** (via a `pg_temp` function in a `begin`/`rollback` transaction against the real imported data, no persisted changes) before being locked into this spec: name search ("margarita" → 2 results, Margarita ranked first), ingredient search ("lime" → 50+ matches, capped correctly), empty query browse (exactly `page_limit` rows returned), the alcoholic status filter (40 non-alcoholic recipes out of 425), pagination stability (page 1 and page 2 at `page_limit=5` share zero overlapping rows), the `page_limit` clamp (a request for 100000 returns exactly 50), and the soft-delete/RLS defense in depth (temporarily soft-deleting "Margarita" within the same rolled back transaction, then searching by an ingredient it contains, "tequila", confirms it does not leak through `ingredient_matches`, count 0).

**API surface**:
| Endpoint | Method | Key inputs | Key outputs | Auth | Key errors |
|---|---|---|---|---|---|
| `search_recipes` (Postgres function, called via Supabase RPC, `supabase.rpc('search_recipes', {...})`) | RPC (POST under the hood) | `query: text` (optional, default `''`, empty means browse all), `status_filter: text` (optional, default `null`, one of `alcoholic`/`non_alcoholic`/`optional`), `page_limit: int` (default 20, clamped 1 to 50 server side), `page_offset: int` (default 0) | `returns table(id uuid, name text, image_url text, alcoholic_status text)`, i.e. an array of `{ id, name, image_url, alcoholic_status }` rows, enough for a result card | `anon`/`authenticated` (public read, `security invoker`, per spec 0002's RLS) | Empty array on no matches (not an error); a Postgres/network error surfaces as a normal Supabase client error (`{ data: null, error }`) for the caller to catch |
| Recipe detail read | Supabase client `select` on `recipes` joined to `recipe_ingredients`/`ingredients` | `id: uuid` (the recipe id from the route) | `id, name, instructions, image_url, alcoholic_status, glass`, plus an ordered ingredients array (`ingredient.name, measure, sort_order`) | `anon`/`authenticated` (public read) | Zero rows (not found or soft deleted, since the query filters `deleted_at is null`) is treated as not found by the caller, not a thrown error |

**Value sourcing**:
| Action | Value produced / displayed | Source |
|---|---|---|
| Search results render | The list of matching recipes | `search_recipes` RPC, called with the current search box text and filter state |
| Search results render (empty query) | The full recipe list, browse mode | Same RPC, called with `query: ""` (AC-2's confirmed behavior) |
| Search results render | Result order (relevance then alphabetical) | Computed inside `search_recipes` itself: `ts_rank` for name matches, `recipes.name asc` for ingredient only matches appended after (AC-5's confirmed rule) |
| Search results render | Next page of results (infinite scroll) | `page_offset` incremented by 20 (the confirmed page size) on each TanStack Query `fetchNextPage` call; offset based per the confirmed pagination mechanism |
| Search results render | Alcoholic status filter options | A fixed enum matching `recipes.alcoholic_status`'s own check constraint from spec 0002 (`alcoholic`, `non_alcoholic`, `optional`, plus "no filter"); `unknown` is a valid stored value but not offered as a filter choice (a user cannot usefully filter for "we don't know") |
| Recipe card image | The card's image, or the fallback | `recipes.image_url` when present; a static placeholder asset (confirmed direction: a generic drink glass placeholder) when `image_url` is null or the image fails to load |
| Detail page render | Full recipe detail (name, instructions, image, alcoholic status, glass) | The detail read query, keyed by the recipe id from the route param (`/recipes/[id]` on web, the route param on mobile's pushed screen) |
| Detail page render | Ordered ingredient list with measures | `recipe_ingredients` joined to `ingredients`, ordered by `recipe_ingredients.sort_order asc`, exactly as spec 0002's own Value sourcing table already specifies for this read |
| Detail page render | Not found state trigger | The detail read returning zero rows (either the id does not exist, or `deleted_at is not null` and the query filters it out), distinguished from a thrown error by an empty result vs. a caught exception |
| Search results render | Debounce delay before firing a new search on text input | 300ms, a fixed constant in the search hook; short enough to feel responsive, long enough to avoid a request per keystroke |
| Search results render (infinite query) | The TanStack Query cache key | `['recipes', 'search', { query, statusFilter }]`; a new query text or filter value produces a new key (a fresh query), while `fetchNextPage` reuses the same key and appends pages under it |
| Detail page render (TanStack Query) | The cache key for the detail read | `['recipes', 'detail', id]` |
| Web search page first paint | The server rendered first page of results, without a client side refetch flash | The server component fetches page 1 directly (not through TanStack Query) and passes it as `initialData` to the client's infinite query hook, keyed identically (`['recipes', 'search', { query: '', statusFilter: null }]`), so the client's first render reuses the server data instead of refetching (no `dehydrate`/`HydrationBoundary` needed for this single case; only the client written pages beyond page 1 use the query client mutably) |
| Recipe card / detail image fallback | The placeholder asset itself | A single static SVG or PNG asset, `packages/shared`'s design tokens directory or each app's own `assets/` folder (one per platform, since `next/image` and `expo-image` each need their own reference, not a shared file path); depicts a simple line art cocktail glass matching `design.md`'s dark cocktail bar palette |
| Mobile detail screen route | The route path | `apps/mobile/src/app/recipe/[id].tsx` (a new route segment, pushed from the Search tab's result list via Expo Router's `Link`/`router.push`) |
| Web route `/recipes/[id]` | The recipe id in the URL | The recipe's `id` (uuid) from spec 0002's schema, used directly as the route param; no separate slug is introduced |

**Key invariants**:
- `search_recipes` never returns a soft deleted recipe (`deleted_at is not null`), enforced by an explicit `r.deleted_at is null` predicate in every one of its three branches (`name_matches`, `ingredient_matches`, `browse_all`), not by relying on RLS alone. This matters specifically because `ingredient_matches` joins through `recipe_ingredients`/`ingredients`, whose own RLS policies are `using (true)` with no `deleted_at` awareness; the explicit predicate is defense in depth verified live (see the function body's verification note above), not just an inherited side effect of `security invoker`.
- The detail read and `search_recipes` are both plain `SELECT`s executed as `anon`/`authenticated`, relying on spec 0002's existing RLS (public read, no write policy exists for either role) plus the explicit predicate above; this feature adds no new grant or policy beyond `EXECUTE` on the function itself.
- `search_recipes` is `SECURITY INVOKER` (the Postgres default), not `SECURITY DEFINER` like spec 0002's `import_catalog`, since it must run under the caller's own (already-public) read permissions, not bypass RLS; unlike `import_catalog`, no privilege elevation is needed or wanted here.
- The final `ORDER BY` (`match_bucket asc, rank desc, name asc, id asc`) always ends in `id asc`, the deterministic tiebreak that keeps `LIMIT`/`OFFSET` pagination stable across page boundaries; without it, rows tied on `rank` (common on a short query) could appear on two pages or on neither, confirmed by a live overlap test between two adjacent pages (zero overlapping rows).
- Pagination is offset based; a page's `page_offset` is only ever used as a monotonically increasing multiple of `page_limit` (20), so the RPC's `LIMIT`/`OFFSET` never has to reconcile a client sent, arbitrary offset against a changing result set (the accepted tradeoff of offset pagination, noted in Consequences).
- The alcoholic status filter and the search query combine with logical AND, never OR; a result must satisfy both when both are set.
- A query of only stopwords or punctuation (e.g. "the", "a", "%") resolves via `websearch_to_tsquery` to an effectively empty tsquery, so `name_matches` returns nothing for it; since `query <> ''` is still true, `browse_all` does not activate either, and `ingredient_matches` only returns rows if the literal text trigram matches an ingredient name. The net behavior is "few or no results," treated as a normal empty search, not a special cased error; no separate handling is needed beyond the existing EmptyState.

**Security model**: Public read, no new access rule. Every table this feature touches (`recipes`, `ingredients`, `recipe_ingredients`) already has spec 0002's RLS: `SELECT` open to `anon` and `authenticated`, no `INSERT`/`UPDATE`/`DELETE` policy for any client role, with those grants explicitly revoked. `search_recipes` is granted `EXECUTE` to `anon`/`authenticated` (the same roles that can already read these tables directly; the function does not expose anything a direct query could not already return).

**Configuration required**:
- `next.config.ts` (web): add `www.thecocktaildb.com` to the allowed remote image patterns, so `next/image` can optimize TheCocktailDB's own hosted images (confirmed the real domain via the live imported data).

**Critical test scenarios**:
- Happy path: search "margarita" → the Margarita recipe appears near the top by relevance, opening it shows instructions, image, and 4 ordered ingredients with measures, verifies **AC-1**, **AC-6**.
- Happy path: search "lime" (an ingredient, not a recipe name) → recipes containing lime appear, ordered alphabetically (no name match to rank by), verifies **AC-1**, **AC-5**.
- Happy path: empty search box on page load → the first 20 recipes (alphabetical) render without requiring input, verifies **AC-2**.
- Failure case: `search_recipes` called with an alcoholic status filter and a query that matches nothing under that filter → an empty result set (not an error), the UI shows its EmptyState, verifies **AC-3**.
- Failure case: scroll to the bottom of 20 loaded results → the next 20 load and append without a full reload or losing scroll position, verifies **AC-4**.
- Failure case: open a detail page for a recipe id that was soft deleted via spec 0002's reconciliation → a not found state, not a crash or blank page, verifies **AC-7**.
- Failure case: the Supabase client throws (simulated network failure) on either page → a visible error state with a retry action appears, verifies **AC-8**.
- Auth/permission: an anonymous (guest) user, with no session at all, can search and open detail pages exactly like a signed in user (no auth check anywhere in this feature), verifies **AC-9**.
- Security: a recipe soft deleted via spec 0002's `deleted_at` mechanism does not leak through `search_recipes`'s `ingredient_matches` branch even though `recipe_ingredients`/`ingredients`' own RLS has no `deleted_at` awareness (already verified live during this spec's own design, see the function body's verification note; `/test` should lock this as a permanent regression test), verifies **AC-7**.
- Consistency: two adjacent pages of the same browse-all query (`page_offset` 0 and 5, `page_limit` 5) share zero overlapping recipe ids (already verified live; `/test` should lock this), verifies **AC-4**.

## Consequences

**Positive**:
- One `search_recipes` function is the single source of the search ranking and pagination rule; both platforms call it identically instead of each reimplementing the union and ordering logic.
- The feature exercises the whole stack for real (Postgres function → Supabase client → server component/TanStack Query → design system components), proving the Tracer Bullet thread spec 0001 called for.
- Web's search page (`/`) replaces the current placeholder home page; mobile gains a real Search tab, both moving the product from scaffold to a first real feature.

**Negative / tradeoffs**:
- Offset based pagination (LIMIT/OFFSET) can show a duplicate or skip a row if the underlying recipe set changes between page loads (a rare case at this feature's data size, hundreds of recipes, effectively static between import runs); a future feature at much larger scale would need cursor based paging instead.
- A Postgres function is new surface the team maintains in SQL, not TypeScript; a bug in its ranking or filter logic is only caught by a database level test, not the TypeScript compiler.
- Mobile keeps its current Home/Explore tabs and Expo starter demo screens unchanged; spec 0003's Follow-up item (retire the `LegacyColors`/`useLegacyTheme()` shim by rebuilding these screens) is not resolved by this feature, since the engineer chose to add search as a new tab rather than replace Home.

**Neutral**:
- The alcoholic status filter only offers `alcoholic`, `non_alcoholic`, `optional` (not `unknown`), since filtering for "we don't know the status" has no useful meaning to a user; recipes with `unknown` status still appear under "no filter" or a plain text search.
- `www.thecocktaildb.com` becomes a permanent entry in `next.config.ts`'s allowed image domains; if the import job's image source ever changes, this needs updating too.

## Build plan

1. [x] Write the `search_recipes` Postgres function (migration in `supabase/migrations/`): unions the full text name match and the ingredient trigram match, applies the optional alcoholic status filter, orders by relevance then name per AC-5, paginates via `page_limit`/`page_offset`, excludes soft deleted recipes, `SECURITY INVOKER`, `EXECUTE` granted to `anon`/`authenticated`, satisfies **AC-1**, **AC-2**, **AC-3**, **AC-5**. Applied live as `supabase/migrations/20260907044354_search_recipes_function.sql`; the ingredient trigram predicate was schema qualified (`operator(extensions.%)` instead of the spec's bare `%`) because `set search_path = ''` left the bare operator unresolvable against `pg_trgm` living in the `extensions` schema — confirmed live, a mechanical fix with no behavior change.
2. [x] Regenerate `packages/shared/src/database.types.ts` to include the new RPC's types (via the Supabase MCP type generator, matching how spec 0002's build applied its migration), satisfies **AC-1**.
3. [x] Add `www.thecocktaildb.com` to `apps/web/next.config.ts`'s allowed remote image patterns, satisfies **AC-6**.
4. [x] Build the shared query layer, satisfies **AC-1** through **AC-5**, **AC-7**, **AC-8**. `packages/shared/src/recipes.ts` holds plain, framework free `searchRecipes`/`fetchRecipeDetail` functions (per `packages/shared`'s no React/RN dependency convention); each app wraps them in its own TanStack Query hooks (`use-recipe-search.ts` infinite query, `use-recipe-detail.ts`), identical query keys and shapes on both platforms.
5. [x] Build `RecipeCard` and `RecipeDetailHeader` on both web and mobile, satisfies **AC-6**. Web uses `next/image` with `/recipe-placeholder.svg` as the missing-image fallback; mobile uses `expo-image` with a glyph based fallback view (no placeholder image asset existed; `// TODO: missing asset` left in `apps/mobile/src/recipes/recipe-image.tsx`).
6. [x] Build the web search page at `/`, satisfies **AC-1** through **AC-5**, **AC-8**. Server component fetches page 1 and passes it as the infinite query's `initialData`; `SearchPageClient` handles the debounced Input, status filter Chips, `IntersectionObserver` based infinite scroll, and loading/error/empty states.
7. [x] Build the web detail page at `/recipes/[id]`, satisfies **AC-6**, **AC-7**. Confirmed live: a real recipe renders name/instructions/ingredients/image; a nonexistent id returns a real 404 via `notFound()`.
8. [x] Build the mobile search screen, satisfies **AC-1** through **AC-5**, **AC-8**. New `Search` tab (`apps/mobile/src/app/search.tsx`) added alongside Home/Explore per the spec's confirmed navigation choice; reuses `explore.png` as its tab icon since no dedicated search icon asset exists yet (flagged inline, follow up below).
9. [x] Build the mobile detail screen, satisfies **AC-6**, **AC-7**. Pushed via Expo Router at `apps/mobile/src/app/recipe/[id].tsx` from a `RecipeCard` tap; not found, error, and loading states all handled explicitly.
10. [x] Verify parity, satisfies **AC-9**. Both platforms call the identical `packages/shared` `searchRecipes`/`fetchRecipeDetail` functions against the same live Supabase project (`ctuzjhhpnkkhooneporu`); no mocked or platform specific data anywhere in the query layer.

## Follow-up

- [ ] The `.env` files show a real mismatch: `apps/mobile/src/lib/supabase.ts` reads `process.env.EXPO_PUBLIC_SUPABASE_URL`/`EXPO_PUBLIC_SUPABASE_ANON_KEY`, but the actual `apps/mobile/.env` (confirmed during spec 0002's build) used `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` instead. This blocks mobile from ever reading live data until fixed; resolve before or during this feature's mobile build (not a design decision, a bug).
- [ ] Spec 0003's Follow-up item ("retire the Expo starter demo screens and the `LegacyColors`/`useLegacyTheme()` shim") is not resolved by this feature; Home/Explore stay as is per the engineer's navigation choice. Revisit when a future feature has reason to touch mobile's Home tab.
- [ ] Region and tag browsing (spec 0002's `recipes.region`/`tags`/`recipe_tags`) are not surfaced by this feature; region data is still empty (per spec 0002's own Follow-up) and tag browsing is Slice 7's job.

