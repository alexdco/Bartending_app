# Rationale: 0004. Recipe search and detail

## Context

This is the first feature to actually query the data model spec 0002 built and render through the components spec 0003 built; it is the "thinnest real thread" the project's Tracer Bullet build approach and spec 0001's stack decision both call for, a real user flow carried end to end through every layer (Postgres query → Supabase client → server component/TanStack Query → design system component → rendered page), on both platforms, before any later feature (pantry, generation, accounts) adds its own layer on top.

The two apps have no shared backend logic layer beyond the plain Supabase client wrappers in `packages/shared`; every query today would otherwise be written twice (once per app) unless this feature deliberately centralizes the one piece of real logic it needs (combining a name search and an ingredient search into one ranked, paginated result set). Getting this shape wrong here means every later search-adjacent feature (recipe recommendations, popular drinks by region) either copies a bad pattern or has to unwind it.

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
- Matches spec 0002's own precedent: it already put `import_catalog` in a Postgres function for exactly this reason, one source of truth for logic both platforms would otherwise duplicate.

**Cons**:
- A new piece of backend logic (SQL, not TypeScript) to write, test, and evolve, which is less familiar to a team primarily writing TypeScript.
- Business logic in the database is a real place to make mistakes silently (no TypeScript typechecking on the SQL body); needs care and a critical test scenario per behavior.

### Option 3: A denormalized combined search column, maintained at import time

Add one generated or trigger maintained `tsvector` column on `recipes` combining the recipe name and its ingredients' names (weighted, name ranked higher via `setweight`), replacing the need for a union entirely: one `ORDER BY ts_rank(...) DESC, name ASC, id ASC LIMIT/OFFSET` query does the whole job, no Postgres function required.

**Pros**:
- Structurally simpler at query time: one indexed column, one `ORDER BY`, no union, no cross arm pagination correctness problem to get right (the class of bug the cross check's findings 1 and 2 flagged).
- No new function surface at all; ordinary PostgREST `select` with `order`/`limit`/`offset` params, callable directly from either client with no RPC layer.

**Cons**:
- Changes spec 0002's already applied, already accepted schema and its `import_catalog` function (a new column, a new maintenance step in the import job), reopening an accepted spec rather than building purely on top of it.
- The combined column must be kept in sync with `recipe_ingredients` changes (an ingredient rename cascades into every recipe's combined vector), which `import_catalog`'s current upsert shape does not do today; getting this right is itself nontrivial new logic, just moved into the import job instead of a search function.

## Rationale

The deciding force is exactly the one spec 0002 already named for `import_catalog`: two platforms sharing one Postgres backend should not duplicate non trivial query logic, because a divergence between them (web ranks results one way, mobile another, from two independently written TypeScript implementations) is a real, easy to introduce bug that a single database function structurally prevents. AGENTS.md's own rule ("non UI logic lives once in `packages/shared`, never duplicated per app") is the spirit of this decision even though the mechanism here is a database function rather than a shared TypeScript module, because the alternative (Option 1) would still require writing the union/ranking/pagination logic twice, once per app, in TypeScript, which is exactly the duplication that rule exists to prevent.

Option 1 is not wrong, and for a much simpler search (a single index, no combining) it would be the better, boring choice; the union and custom ordering rule (AC-5) is specifically what tips this toward centralizing in one place. The Postgres function's con (SQL that TypeScript cannot typecheck) is mitigated by writing the exact SQL body into this spec (Feature design, below) rather than leaving it for the build to invent, plus explicit critical test scenarios for the ranking and filter behavior.

Option 3 (a denormalized combined search column) is the structurally simplest long term answer and is not rejected on merit, only on scope: it requires reopening spec 0002, an accepted, already applied spec, to add a column and change `import_catalog`'s upsert shape, which this feature's own boundary (build on top of the existing schema, not inside it) rules out. If `search_recipes`'s query performance or correctness ever becomes a real, measured problem at a larger data size, Option 3 is the recommended next step, not a further patch to the union function; this is recorded as a Follow-up rather than silently deferred.
