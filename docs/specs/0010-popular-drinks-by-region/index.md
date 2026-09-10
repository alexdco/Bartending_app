# 0010. Popular drinks by region

**Date**: 2026-09-07
**Status**: In Progress

## Summary

This decision adds a browsable "popular drinks by region" section: a user picks a region and sees a curated top ten list of recipes for it. Since no third party source in this project has real region or popularity data for cocktails, a one time script uses Claude (the AI model already in this stack) to tag each recipe with a region and, per region, rank its most famous ten. The region picker and the ranked list are both served by one new Postgres function, reusing the pattern already set by recipe search (spec 0004).

## Requirements

**User stories**:
- As a home bartender, I want to browse popular drinks by region, so I can find well known drinks tied to a place or style I'm interested in.
- As a home bartender, I want to pick a region from a clear, short list, so I'm not guessing what regions exist.

**Acceptance criteria**:
- **AC-1**: A dedicated page (web) and screen (mobile) shows a region picker and, for the selected region, its top ten ranked recipes.
- **AC-2**: The region picker only offers regions that have at least one recipe tagged with them; a region with zero tagged recipes never appears as a choice.
- **AC-3**: Within a region, recipes render in `popularity_rank` order (1 first); if a region has fewer than ten tagged recipes, exactly that many render, never a padded or repeated list.
- **AC-4**: Opening a recipe from this list navigates to the same recipe detail page/screen as search (spec 0004), unchanged.
- **AC-5**: A failed region list or popular list query (network error, timeout) shows a visible error state with a retry action, matching the existing pattern (spec 0004's AC-8, spec 0006's error state).
- **AC-6**: This feature works identically on the web app and the mobile app against the same live Postgres data.
- **AC-7**: The one time tagging script never applies its region and rank assignments straight to the live database; it first writes its proposed assignments to a reviewable output, and only a separate, explicit apply step commits them.

## Options considered

### Option 1: Hand curated region and popularity tagging

The engineer manually assigns a region and a rank to a subset of recipes, by reading the imported catalog and picking values themselves (a spreadsheet or a short manual script run).

**Pros**:
- No AI involved, no risk of a wrong or implausible region/rank assignment slipping through unnoticed.
- Full engineer control over what counts as regional and what counts as popular.

**Cons**:
- Real manual effort across roughly 425 recipes (per spec 0002's import counts) to get a usable spread of regions, redone by hand for any future catalog growth.
- Does not reuse anything already in the stack; this project already pays for and calls Claude (spec 0001, spec 0007), so paying pure human time here (not just the Claude cost) instead is more expensive.

### Option 2: LLM assisted tagging with a reviewable staging step

A one time script calls Claude twice per recipe set: once to classify each recipe into a fixed region list (or none), once per region to rank its recipes by real world fame. The proposed assignments are written to a JSON output first; a second, explicit step applies them to the database.

**Pros**:
- Reuses the AI capability already in this stack (spec 0001's Claude/Haiku tier) instead of introducing new manual tagging work.
- The review step catches an implausible region or a rank the engineer disagrees with before it is live and constrained by the unique `(region, popularity_rank)` index.
- One time cost: this is a script run once, not a permanent addition to the recurring import job (spec 0002), so it adds no per import latency or cost later.

**Cons**:
- Region classification for an ambiguous cocktail (a Margarita is globally common despite a Mexican-ish origin) is a judgment call the model can get wrong or inconsistent between runs; the review step is what catches this, not a guarantee of correctness.
- A second, separate concept (LLM classification) that a purely relational stack does not otherwise need, adding one more moving part (a script that calls an external API and produces a file, not just a migration).

### Option 3: Skip region entirely, use TheCocktailDB's existing category data instead

Since TheCocktailDB has no area/region filter at all (confirmed against its real API; see rationale.md), reuse its actual category data (`strCategory`, e.g. "Cocktail", "Ordinary Drink", "Shot") for a "popular by category" browse instead of region.

**Pros**:
- Real third party data already available with no new tagging step or AI cost at all.
- Zero ambiguity: a recipe's category is a stated fact from the source, not inferred.

**Cons**:
- Does not satisfy the actual scope intent ("popular drinks by region," scope row 11) or this spec's confirmed requirement; a category is not a region and doesn't answer the same user question ("what's popular where I'm from / traveling to").
- Still leaves "popular" unanswered even if category solves "region"; popularity ranking is a separate gap this option doesn't close.

**This option is not chosen**, since it abandons the feature's actual purpose rather than solving the missing data problem; noted here because it was raised and rejected during design (see rationale.md).

## Decision

**Chosen option**: Option 2 (LLM assisted tagging with a reviewable staging step), refined to a single LLM call per recipe rather than two passes (see rationale.md's Option 4 note).

A one time script asks Claude, once per recipe, for a region (from a fixed list, or none) and a 0 to 100 fame score; `popularity_rank` is then computed deterministically in SQL from that score, not asserted by a second LLM call. Proposals are written to a review file before an explicit apply step commits them; a new `popular_recipes_by_region` Postgres function and a distinct regions query serve the browse page on both platforms.

**Implementation skills**: `supabase-postgres-best-practices` (`supabase/agent-skills`, `.agents/skills/supabase-postgres-best-practices/`) · `nextjs-app-router-patterns` (`wshobson/agents`, `.agents/skills/nextjs-app-router-patterns/`) · `react-native-best-practices` (`callstackincubator/agent-skills`, `.agents/skills/react-native-best-practices/`)

**Reasoning and options considered**: see [rationale.md](rationale.md).

## Feature design

**Data model sketch**: Two new nullable columns on the existing `recipes` table (spec 0002); no new tables.

| Entity | Field added | Type | Constraint |
|---|---|---|---|
| `recipes` | `popularity_rank` | integer, nullable | Unique per `(region, popularity_rank)` where both are not null (partial unique index); null means this recipe is not in its region's top ten |
| `recipes` | `fame_score` | smallint, nullable | `check (fame_score between 0 and 100)`; the raw LLM judgment `popularity_rank` is computed from, kept so a re-rank (e.g. after adding a recipe to a region) never needs another LLM call, just a recompute |

`recipes.region` already exists (spec 0002, currently empty for every row) and is populated by this feature's tagging script. To close the gap the cross check raised (an LLM near miss like `"Mexico"` or `"mexican "` silently fragmenting the picker), `region` also gets a `check` constraint restricting it to the fixed value set: `Mexican`, `Cuban`, `Caribbean`, `American`, `British`, `Italian`, `French`, `Asian`, `International/Global`, or `null`. The apply step validates against this same list before writing, so a constraint violation there means the script itself produced a bad value, not a race with some other writer.

**State transitions**: Not applicable; `region`, `fame_score`, and `popularity_rank` are plain tagged fields set once by the script (and correctable later by a direct update), not a lifecycle.

**Migration**: `supabase/migrations/<timestamp>_popular_drinks_by_region.sql`:

```sql
alter table public.recipes
  add column fame_score smallint check (fame_score between 0 and 100),
  add column popularity_rank integer,
  add constraint recipes_region_check check (
    region is null or region in (
      'Mexican', 'Cuban', 'Caribbean', 'American', 'British',
      'Italian', 'French', 'Asian', 'International/Global'
    )
  );

create unique index recipes_region_popularity_rank_key
  on public.recipes (region, popularity_rank)
  where region is not null and popularity_rank is not null;
```

No new index is needed for the read path beyond this: `popular_recipes_by_region` filters on `region` (already indexed by spec 0002's `recipes(region) where region is not null`) and the new partial unique index above already covers `(region, popularity_rank)` ordering.

**`popular_recipes_by_region` function (exact, not to be reinvented at build time)**:

```sql
create or replace function public.popular_recipes_by_region(
  region_filter text
)
returns table (
  id uuid,
  name text,
  image_url text,
  alcoholic_status text,
  popularity_rank int
)
language sql
stable
security invoker
set search_path = ''
as $$
  select r.id, r.name, r.image_url, r.alcoholic_status, r.popularity_rank
  from public.recipes r
  where r.deleted_at is null
    and r.region = region_filter
    and r.popularity_rank is not null
  order by r.popularity_rank asc
  limit 10;
$$;

revoke all on function public.popular_recipes_by_region(text) from public;
grant execute on function public.popular_recipes_by_region(text) to anon, authenticated;
```

A second function lists the region picker's own options. Its output column is named `region_name`, not `region`, because the source column and an identically named `returns table` column in the same function body is a real ambiguity hazard in Postgres (a bug the cross check caught in this spec's first draft: `select distinct r.region ... order by r.region` inside a function whose out parameter is also called `region` resolves ambiguously):

```sql
create or replace function public.list_popular_regions()
returns table (region_name text)
language sql
stable
security invoker
set search_path = ''
as $$
  select distinct r.region as region_name
  from public.recipes r
  where r.deleted_at is null
    and r.region is not null
    and r.popularity_rank is not null
  order by r.region asc;
$$;

revoke all on function public.list_popular_regions() from public;
grant execute on function public.list_popular_regions() to anon, authenticated;
```

Key points a builder must not deviate from:
- `set search_path = ''` plus schema qualified `public.recipes`, matching spec 0004's `search_recipes` precedent exactly.
- `security invoker`, not `definer`: both functions run under the caller's own `anon`/`authenticated` privileges, relying on spec 0002's existing public read RLS on `recipes`; the explicit `r.deleted_at is null` predicate is defense in depth, matching spec 0004's own stated reasoning for the same predicate.
- `limit 10` is inlined directly in `popular_recipes_by_region`, not parameterized, since the confirmed top-N size is fixed at ten; a future change to N is a spec change, not a runtime parameter.
- `list_popular_regions` filters on `r.popularity_rank is not null`, not just `r.region is not null`: a region can have recipes tagged to it but none ranked yet (a partial tagging run), and without this predicate that region would appear as a selectable, default-eligible choice whose list is empty on first load. This closes a gap the cross check found in this spec's first draft, where AC-2 was true in name only.
- `popular_recipes_by_region`'s own output columns (`id`, `name`, `image_url`, `alcoholic_status`, `popularity_rank`) also collide by name with `recipes` columns; every reference in its body is schema and alias qualified (`r.id`, `r.name`, etc.) specifically to avoid the same ambiguity, never a bare column name.

**API surface**:
| Endpoint | Method | Key inputs | Key outputs | Auth | Key errors |
|---|---|---|---|---|---|
| `list_popular_regions` (Postgres function, Supabase RPC) | RPC | none | `returns table(region_name text)`, an array of region strings | `anon`/`authenticated` | Empty array if no recipe has been tagged and ranked yet (not an error) |
| `popular_recipes_by_region` (Postgres function, Supabase RPC) | RPC | `region_filter: text` (required, one of the values `list_popular_regions` returned) | `returns table(id uuid, name text, image_url text, alcoholic_status text, popularity_rank int)`, up to 10 rows ordered by rank | `anon`/`authenticated` | Empty array if the region has zero ranked recipes (not an error) |

**Shared module**: `packages/shared/src/popularByRegion.ts` holds plain, framework free `listPopularRegions()`/`fetchPopularByRegion(region)` functions wrapping these two RPCs, matching spec 0004's `recipes.ts` convention (non UI logic lives once in `packages/shared`, per root `AGENTS.md`'s own rule); each app wraps them in its own TanStack Query hook. `packages/shared/src/database.types.ts` is regenerated (Supabase MCP type generator) after the migration lands, to include the new columns and both RPCs' types, matching spec 0004's build plan step 2.

**Value sourcing**:
| Action | Value produced / displayed | Source |
|---|---|---|
| Region picker render | The list of selectable regions | `list_popular_regions` RPC via `listPopularRegions()` |
| Region picker default selection | Which region is selected on first load | The first region alphabetically from `list_popular_regions`'s own result (its `order by region asc`), since there is no stored user preference for this yet |
| Popular list render | The ranked recipes for the selected region | `popular_recipes_by_region` RPC via `fetchPopularByRegion(region)`, called with the currently selected region |
| Popular list render | Result order | `popularity_rank asc`, computed inside the function itself, from `fame_score` at apply time (see Key invariants) |
| Popular list render | Card image, or its fallback | `recipes.image_url` when present, else the same static placeholder asset spec 0004 already established, via the existing `RecipeCard` component (spec 0003/0004), reused unchanged |
| Popular list render | Region label text shown in the picker | The raw `region_name` value verbatim (e.g. `International/Global` renders as is); no separate display-label mapping is introduced, since the fixed 9 value list was chosen to already read as user facing text |
| Recipe tap navigation | Which detail page/screen opens | The tapped recipe's existing `id` (uuid), routed through spec 0004's already built detail page/screen unchanged |
| Web route | The page's URL | `/popular` (new top level route, `apps/web/src/app/popular/page.tsx`), with the selected region as a query param (`/popular?region=Cuban`) so the picked region survives a refresh or share, mirroring how spec 0004's search page keeps query state client side but adding the param since this page's whole state is one selectable value |
| Web/mobile TanStack Query cache keys | The keys both apps use | `['popular-regions']` for the region list; `['popular-recipes', region]` for a region's ranked list, a new key per region so switching regions is a fresh, independently cached query (matching spec 0004's `['recipes', 'search', {...}]` pattern of embedding the varying input in the key) |
| Mobile screen | Where it lives in navigation | A new `Popular` tab (`apps/mobile/src/app/popular.tsx`), added alongside the existing Search/Drink Ideas tabs per the confirmed navigation choice |
| Tagging script run | `recipes.region` and `recipes.fame_score` per recipe | One Claude call per recipe (batched, see Key invariants), given the recipe's name, ingredients, and instructions, asked to return a region (constrained to the fixed list, or null) and a 0 to 100 fame score in one response; output appended to the review file, not applied directly (AC-7) |
| Apply step | `recipes.popularity_rank` per recipe | Computed in SQL from the reviewed `fame_score`, not asserted by the LLM: `row_number() over (partition by region order by fame_score desc, name asc)`, capped at 10 per region; this removes a second LLM pass entirely and makes ties deterministic (alphabetical) |
| Apply step | Which rows actually get updated | The engineer's approved review file, applied via one transaction (see Key invariants), only after manual review (AC-7) |

**Key invariants**:
- `(region, popularity_rank)` is unique among rows where both are not null, enforced by the partial unique index (see Migration above). Because a partial unique index (unlike a full unique constraint) cannot be declared `deferrable`, the apply step's single `UPDATE` must never produce a transient collision: it first sets `popularity_rank = null` for every row in a region being re-ranked, then sets the new ranks, both inside the same transaction, so the index only ever sees the final, valid state.
- `region` is restricted to the fixed 9 value list (or null) by the `recipes_region_check` constraint (see Migration above), not just the tagging script's own prompt. This closes the gap the cross check flagged: an LLM near miss like `"Mexico"` or `"mexican "` now fails the apply step's `UPDATE` loudly (constraint violation) instead of silently creating a near duplicate region that fragments the picker.
- `popular_recipes_by_region` never returns a soft deleted recipe (`r.deleted_at is null`), matching spec 0004's established defense in depth pattern for every read against `recipes`.
- The tagging script only proposes for recipes where `region is null` (i.e. it is safely rerunnable without `--all`); passing `--all` reprocesses every recipe, for the deliberate case of re-tagging after a prompt change. This is what makes it usable both as the one time initial run and, per Follow-up, a manual rerun after a future reimport.
- **Review file format**: the script appends one JSON object per recipe to `scripts/tagging/popular-by-region-proposals.json` (a JSON array): `{ id: uuid, name: string, region: string | null, fame_score: number | null, reasoning: string }`. `reasoning` is the model's one line justification, kept so the engineer's review has something to judge the call against, not just a bare value. The script writes incrementally (append and flush per batch), so a run that dies partway through leaves a valid partial file instead of losing all prior calls; a rerun skips any `id` already present in the file.
- **Batching and cost**: recipes are sent to Claude Haiku in batches of 25 per call (roughly 17 calls for spec 0002's ~425 recipes), each call returning one region + fame score per recipe in the batch; at Haiku's per token pricing this is expected to cost well under a dollar for the whole catalog, low enough that re running it after a prompt fix is not a real cost concern. A batch that fails (rate limit, timeout) retries with exponential backoff up to 3 times before being logged as skipped and left for a manual rerun; one failed batch never aborts the whole script.
- **Apply step mechanics**: after the engineer edits the review file to their satisfaction, a second script command reads it, validates every non null `region` against the fixed list and every `fame_score` against 0 to 100 (aborting with a clear error, and no writes at all, if any row fails validation), then in one transaction: (1) nulls `region`/`fame_score`/`popularity_rank` for every recipe `id` present in the file (so a corrected rerun cleanly replaces a prior apply, never layering stale ranks under new ones), (2) updates `region`/`fame_score` from the file via `UPDATE ... FROM (select * from json_to_recordset($1) as p(id uuid, region text, fame_score int)) p WHERE recipes.id = p.id`, (3) recomputes `popularity_rank` for every affected region via the `row_number()` window function described in Value sourcing, applied only to that region's rows. Runs under an advisory lock (the same pattern as spec 0002's import job) so two apply runs can never interleave.

**Security model**: Public read, matching spec 0002 and spec 0004 exactly. `recipes` already has `SELECT` open to `anon`/`authenticated`, no write policy for any client role; `popularity_rank` is just another column on that same table, no new access rule. Both new functions are granted `EXECUTE` to `anon`/`authenticated`, the same roles that can already read `recipes` directly. The tagging script's apply step runs with the Supabase service role key (bypassing RLS), the same privilege level spec 0002's import job already uses; it is never exposed to any client.

**Configuration required**:
- `ANTHROPIC_API_KEY`: already provisioned (spec 0001, spec 0007); the tagging script reuses it, run locally or from wherever the engineer runs one off scripts, not from a client or Edge Function.

**Critical test scenarios**:
- Happy path: after the tagging script and apply step run, open the popular drinks page, pick a region, see up to ten recipes ordered by rank; tapping one opens the normal recipe detail page, verifies **AC-1**, **AC-3**, **AC-4**.
- Failure case: a region with only 4 tagged recipes shows exactly 4, not a padded list of 10 or an error, verifies **AC-3**.
- Failure case: `popular_recipes_by_region` or `list_popular_regions` throws (simulated network failure) → a visible error state with a retry action, verifies **AC-5**.
- Auth/permission: an anonymous (guest) user sees the exact same popular list as a signed in user, no auth check anywhere in this feature, verifies **AC-6**.
- Process check: running the tagging script against the live catalog produces a review file only; the database's `region`/`popularity_rank` columns are unchanged until the separate apply step runs, verifies **AC-7**.

## Consequences

**Positive**:
- Reuses the existing Claude integration (already paid for and wired up per spec 0001/0007) instead of introducing new manual tagging labor.
- One new column, two small functions, no new tables; the smallest schema change that satisfies the requirement.
- The review-before-apply step (AC-7) makes a wrong LLM guess correctable before it's live, rather than silently shipping bad data to users.

**Negative / tradeoffs**:
- `region`/`fame_score` are LLM inferred, not authoritative third party data; a specific recipe's regional classification is a judgment call that can be wrong or feel arbitrary to a user who knows the drink's real origin.
- The tagging script's initial run is one time, not part of the recurring import job (spec 0002); any recipe added by a future reimport starts untagged and invisible to this feature until the script is rerun by hand (see Follow-up). The script is safely rerunnable (it only proposes for `region is null` rows unless `--all` is passed), which keeps this a real option, not just a stated hope.
- `fame_score` is a stored, LLM judged value that a re run of the tagging script (with a changed prompt) can shift, changing `popularity_rank` on a later apply even for recipes whose real world popularity has not changed; this is accepted as the cost of a one time human reviewed batch process rather than a live, always current signal.

**Neutral**:
- `popularity_rank` is a stored, derived value rather than computed at read time (an exception to the general "don't store derived values" guidance), justified because it is a deterministic `row_number()` recompute from the stored `fame_score`, not something recomputed from an expensive external call on every read.
- The region list (9 values plus null) is a design choice for this feature, not sourced from any external system; expanding or renaming a region later means a migration to widen the `recipes_region_check` constraint, plus rerunning or hand editing the tagging data.

## Build plan

1. [x] Write the migration (`region` check constraint, `fame_score` column, `popularity_rank` column, the partial unique index), satisfies **AC-3**. Applied live as part of `supabase/migrations` (`popular_drinks_by_region`, `popular_recipes_by_region_function`, `apply_region_proposals_function`, `revoke_apply_region_proposals_client_access`), confirmed via live schema introspection; `apply_region_proposals` is `security definer` and its execute grant to `anon`/`authenticated` was explicitly revoked (confirmed live) since it is only ever called with the service role key from `apply-regions.ts`, never a client.
2. [ ] Write and run the tagging script (batched Claude Haiku calls, one region + fame score per recipe, incremental review file per the format in Key invariants), satisfies **AC-7**. Code written at `packages/shared/scripts/tag-regions.ts` (`pnpm --filter @bartendingapp/shared tag-regions`), typechecks clean; not yet run against the live catalog (needs `ANTHROPIC_API_KEY` and the Supabase service role key, which the engineer runs locally).
3. [ ] Engineer reviews and edits the review file as needed (a manual step, not code). Pending task 2's run.
4. [ ] Write and run the apply step (validate, then the one transaction: null then rewrite `region`/`fame_score`, recompute `popularity_rank` via `row_number()`, under an advisory lock), satisfies **AC-3**, **AC-7**. Code written at `packages/shared/scripts/apply-regions.ts` (`pnpm --filter @bartendingapp/shared apply-regions`) plus the `apply_region_proposals` Postgres function (task 1), typechecks clean; not yet run (depends on task 3).
5. [x] Write `popular_recipes_by_region` and `list_popular_regions` Postgres functions, satisfies **AC-1**, **AC-2**, **AC-3**. Applied live, `EXECUTE` granted to `anon`/`authenticated` only, confirmed callable and returning the expected (currently empty, pre tagging) shape.
6. [x] Regenerate `packages/shared/src/database.types.ts` for the new columns and RPCs, satisfies **AC-1**. Regenerated via the Supabase MCP type generator, includes `fame_score`, `popularity_rank`, and all three new functions.
7. [x] Build `packages/shared/src/popularByRegion.ts` (`listPopularRegions`/`fetchPopularByRegion`), satisfies **AC-1**, **AC-5**, **AC-6**. Exported from `packages/shared/src/index.ts`; typechecks clean.
8. [x] Build the web page at `/popular` (region query param, region picker, ranked list reusing `RecipeCard`, loading/error/empty states), satisfies **AC-1** through **AC-5**. `apps/web/src/app/popular/page.tsx` + `apps/web/src/popular/{popular-page-client.tsx,use-popular-by-region.ts}`, nav link added to `site-nav.tsx`; typechecks and lints clean.
9. [x] Build the mobile `Popular` tab, satisfies **AC-1** through **AC-5**. `apps/mobile/src/app/popular.tsx` + `apps/mobile/src/popular/use-popular-by-region.ts`, tab registered in `app-tabs.tsx` (reusing `explore.png` as a placeholder icon per the existing convention); typechecks and lints clean.
10. [x] Verify parity: both platforms call the identical `packages/shared` functions against the same live data, satisfies **AC-6**. Both apps' `use-popular-by-region.ts` are near identical thin wrappers around the same `listPopularRegions`/`fetchPopularByRegion`, identical cache key shapes (`['popular-regions']`, `['popular-recipes', region]`), and both reuse the same `RecipeCard` component.

## Follow-up

- [ ] Decide how newly imported recipes (a future reimport per spec 0002) get tagged with region and rank; the tagging script supports a rerun (untagged rows only) but nothing triggers it automatically today. Revisit before or during any future catalog growth.
- [ ] The `list_popular_regions` order (alphabetical) also decides the region picker's default selection; revisit if a stated "most popular region overall" ordering is wanted instead once usage data (scope row 14) exists.
- [ ] If a recipe's `fame_score` ever needs a manual override (the engineer disagrees with a specific rank after seeing it live), the current path is editing the review file and rerunning the apply step with `--all` scoped to that region; no lighter weight single row correction tool exists yet.

## Rationale

See [rationale.md](rationale.md) for the full context, options considered in detail, and the API verification behind this decision.
