# 0056. Catalog freshness rules

**Date**: 2026-11-14
**Status**: In Progress

## Summary

When you edit or delete a catalog recipe in admin, the import job now leaves it alone (it "locks"), instead of quietly undoing your work on the next run. The import still tells you when TheCocktailDB changes a recipe you locked, and a Reset button hands it back. New recipes get a fame score automatically at the end of each import (or from a new field on the admin form), so they stop sorting last. A merged duplicate's old name becomes a search alias on the recipe we kept, so searching "Long Island Tea" finds Long Island Iced Tea.

## Requirements

**User stories**:
- As the admin, I want my edits and deletes on a catalog recipe to survive every import, so I never have to fix the same thing twice.
- As the admin, I want to know when TheCocktailDB changes a recipe I took over, so I don't miss an upstream fix.
- As the admin, I want to hand a recipe back to the import when my edit is no longer needed.
- As a visitor, I want a newly added drink to show up in its rightful place in browse, search, and the classics row, not at the very end.
- As a visitor, I want to find a drink by the name of a duplicate we merged into it.

**Acceptance criteria** (the contract, each criterion is IDed and independently checkable):
- **AC-1**: An admin save of a `source = 'catalog'` recipe (TheCocktailDB or `custom:` ids) that changes any import owned field sets `admin_locked_at` to now if it is null. Import owned fields are: name, glass, alcoholic status, the ingredient list (each line's ingredient, measure, order, and amounts), the catalog tag set, and, for `custom:` recipes only, instructions (the TheCocktailDB import never rewrites instructions without an override, so they don't lock a TheCocktailDB recipe). The comparison uses the same normalizations the form applies before sending (ingredient `normalized_name`, `nullif(btrim(measure), '')`, glass compared with `lower(btrim())`, tags compared as a set), so saving a recipe unchanged never locks it. A save that changes no import owned field (only fame score, region, flavor profile, method, or TheCocktailDB instructions) leaves `admin_locked_at` as it was. A `source = 'admin'` recipe never gets a lock.
- **AC-2**: For a locked recipe, `import_catalog` and `import_custom_recipes` leave its name, instructions, glass, alcoholic status, IBA, `recipe_ingredients` rows, catalog `recipe_tags` rows, and `deleted_at` unchanged. Content fixes in `catalogOverrides.json` (`name`, `instructions`, `addIngredients`) have no effect on it. The existing image rule (`image_origin = 'admin_upload'`) is unchanged.
- **AC-3**: An admin delete of a `source = 'catalog'` recipe sets `deleted_at` and `admin_locked_at` together; the recipe stays deleted across every later import while the lock holds. Deleting a recipe that another recipe is merged into (`merged_into_recipe_id` points to it) is refused with `this recipe is a merge target in catalogOverrides.json` and nothing changes. Deleting a recipe that has a region recomputes `popularity_rank` for that region.
- **AC-4**: A locked TheCocktailDB recipe missing from a complete run stays live, unless `catalogOverrides.json` hides it (crude or duplicate), in which case it is soft deleted (and merged) exactly like an unlocked one. The run's report lists each locked recipe kept live this way (`keptMissing`). A locked recipe that is back in the payload but still deleted (for example, a hide entry was removed) stays deleted and is listed as `lockedStillDeleted`; Reset is how you bring it back. This rule is TheCocktailDB only: the custom import has no "missing from file" step.
- **AC-5**: Every import run writes `latest_source_hash` on every recipe in its payload. It also writes `source_hash` to the same value when the recipe is unlocked, or when `source_hash` is null. A locked recipe whose `latest_source_hash` differs from its `source_hash` is listed as "changed upstream" in the report of every run until it is reset or acknowledged. Any admin save of a locked recipe acknowledges it by setting `source_hash` to `latest_source_hash`.
- **AC-6**: On a locked recipe's edit page, the admin can run "Reset to TheCocktailDB version" (with a confirm step). It clears `admin_locked_at`; the next import rewrites the recipe's import owned fields from source and, if the recipe was admin deleted and is still in source, brings it back. Reset never restores a TheCocktailDB recipe's instructions (the import only writes those through an override). The action is shown only for `source = 'catalog'` recipes that are locked, including deleted ones (AC-7).
- **AC-7**: The admin recipe list shows a "Locked" badge on locked recipes, a "Changed upstream" badge on locked recipes whose hashes differ, an "Unscored" badge on recipes whose `fame_score` is null, and a "Deleted" badge. A "Deleted" status filter lists soft deleted recipes (the default view still hides them). The edit page loads a deleted recipe only when it is a locked `source = 'catalog'` recipe, and then shows the Reset action and no Save. The edit page of a "Changed upstream" recipe says so above the form.
- **AC-8**: `pnpm --filter @bartendingapp/import-job import --dry-run --diff-locks` writes nothing to the database and writes `packages/import-job/lock-candidates.json`: every unlocked live `source = 'catalog'` TheCocktailDB recipe whose stored name, glass, alcoholic status, ingredient list (ingredient and measure text, in order; parsed amounts are ignored), or catalog tag set differs from the transformed source plus overrides, with its source id, name, and the list of differing fields. Instructions and IBA are not compared. `--diff-locks` without `--dry-run` exits with an error. `pnpm --filter @bartendingapp/import-job import:apply-locks` sets `admin_locked_at` on every source id left in that file and prints how many it locked; a source id that no longer exists is reported, not fatal.
- **AC-9**: After the catalog write commits, both import entry points score up to 200 live recipes (any source) with a null `fame_score` through the existing Haiku fame and region prompt and apply the result through `apply_fame_on_arrival`, which writes only rows whose `fame_score` is still null at apply time (so a fame score an admin sets meanwhile wins): the fame score always, the proposed region only when the recipe's region is null, then `popularity_rank` is recomputed for every affected region. A recipe whose region an admin cleared to null can get an LLM proposed region back; that is accepted. If this step fails, the run still exits successfully, prints a warning and the unscored recipes, and the next run picks them up. Recipes past the cap are listed as "waiting for the next run".
- **AC-10**: The admin add and edit form has an optional fame score field (whole number, 0 to 100). A value is saved to `fame_score`; a blank field saves null (the next import scores it); anything else is rejected with a form error and nothing is saved. When the fame score or region changes on a recipe, `popularity_rank` is recomputed for the old and new region in the same transaction.
- **AC-11**: After every `import_catalog` run, `recipe_aliases` rows with `source = 'merge'` exactly match the merges in `catalogOverrides.json`: one alias per merge on the kept recipe, holding the hidden recipe's stored name, skipped when it equals the kept recipe's name ignoring case. Removing a merge from the file removes its alias on the next run. `generated` and `manual` aliases are never touched.
- **AC-12**: `search_recipes` with a text query that matches a `merge` alias (the same trigram rule as the name trigram fallback) returns the kept recipe, ranked in bucket 1 (below exact name matches, with the trigram name matches), and never twice in one result (the alias CTE excludes ids from the name, trigram, and CJK CTEs, and `ingredient_matches` also excludes ids from the alias CTE). `generated` and `manual` aliases do not affect `search_recipes`. Bartender search keeps reading every alias, so it finds merge aliases too.
- **AC-13**: Each import run prints a freshness report: locked recipes skipped, locked recipes changed upstream, locked recipes kept though gone from source, locked recipes still deleted, overrides content entries ignored because their recipe is locked, recipes scored, and recipes still unscored. `--dry-run` reads the database with the service role (no writes) and prints how many recipes are locked and how many are changed upstream.
- **AC-14**: Only an admin session can take a lock, acknowledge, reset, or set a fame score (through the admin RPCs, which check `is_admin`), and only the service role can run the import RPCs. A non admin calling `admin_reset_recipe_to_source` gets `not authorized` and nothing changes.
- **AC-15**: A real (not dry run) `import` refuses to run, exiting non zero with a message pointing to the backfill steps, while no `recipes` row has a non null `source_hash`, unless `--backfill-done` is passed. After the first hashed run the guard never fires again.

## Decision

**Chosen option**: Option 1: a whole recipe lock owned by the admin, a source fingerprint for upstream changes, an import tail that scores fame, and import owned merge aliases.

Add `admin_locked_at`, `source_hash`, and `latest_source_hash` to `recipes`; teach both import RPCs to skip a locked recipe's content and keep its delete; teach `admin_upsert_recipe` and `admin_delete_recipe` to take the lock; extract the fame tagging core into a shared module that both import entry points run after the write; and let `import_catalog` own `source = 'merge'` aliases, which `search_recipes` reads.

**Implementation skills**: `supabase-postgres-best-practices` (`supabase/agent-skills`, `.agents/skills/supabase-postgres-best-practices/`) · `vitest` (`antfu/skills`, `.agents/skills/vitest/`) · `nextjs-app-router-patterns` (`wshobson/agents`, `.agents/skills/nextjs-app-router-patterns/`)

## Rationale

Reasoning and options: see [rationale.md](rationale.md).

## Feature design

**Data model sketch** (confirmed):

| Entity | Change | Type | Rules |
|---|---|---|---|
| `recipes` | add `admin_locked_at` | timestamptz, nullable | Set by an admin edit that changes an import owned field (AC-1) or an admin delete (AC-3) of a `source = 'catalog'` row. Null means the import owns the recipe. Cleared only by `admin_reset_recipe_to_source`. |
| `recipes` | add `source_hash` | text, nullable | The source version this row's content reflects (the acknowledged version). Written by the import on unlocked rows and on locked rows where it is null; written by an admin save on a locked row (acknowledge). |
| `recipes` | add `latest_source_hash` | text, nullable | The source version the last import saw. Always written by the import for every recipe in its payload. |
| `recipes` | `fame_score`, `region`, `popularity_rank` | unchanged columns | Now also written by the import tail (fame always, region only when null) and by the admin form (fame). |
| `recipe_aliases` | widen `recipe_aliases_source_check` | `source in ('generated','manual','merge')` | `merge` rows are owned by `import_catalog`. New partial unique index `recipe_aliases_merge_unique` on `(recipe_id, lower(alias)) where source = 'merge'`. |

No new tables. `recipe_aliases.recipe_id` → `recipes.id` stays N to 1 with cascade delete.

**State transitions** (`recipes`, `source = 'catalog'` only):
- `import owned` (lock null) → `locked` : an admin save that changes an import owned field, an admin delete, or `import:apply-locks`.
- `locked` → `locked, changed upstream` : an import sees a `latest_source_hash` different from `source_hash`.
- `locked, changed upstream` → `locked` : any admin save (acknowledge).
- `locked` (either) → `import owned` : `admin_reset_recipe_to_source`; the next import rewrites content, sets both hashes, and clears `deleted_at` if the recipe is in source.

**Source fingerprint**: `sourceHash` is a pure function in `packages/import-job/src/sourceHash.ts`: the prefix `v1:` plus the SHA-256 (hex) of a canonical JSON (the prefix lets a future format change be rebaselined on purpose instead of flagging every locked recipe) of exactly the fields the import would write for that recipe after overrides: `name`, `glass`, `alcoholicStatus`, `iba`, the ingredient list as `[ingredientName, measure, sortOrder]` in sort order, the catalog tag names sorted, and `instructions` only when `instructionsOverride` is true (the import never rewrites instructions otherwise). Custom recipes hash `name`, `instructions`, `glass`, `alcoholicStatus`, ingredients, and tags the same way. Hashing after overrides means editing an override for a locked recipe also shows it as "changed upstream", which is the review prompt you want. Baseline: a locked recipe with a null `source_hash` takes whatever its first hashed import sees as the baseline, so an upstream change made before that run is accepted silently; the backfill diff covers older drift only for unlocked rows. Parsed amounts are not hashed and are never rewritten on a locked row, so any future amount reparse must be a direct script (like spec 0035's reparse), not an import run.

**API surface**:

| Surface | Kind | Key inputs | Key outputs | Auth | Key errors |
|---|---|---|---|---|---|
| `import_catalog` (changed; return type changes, so drop and recreate, then the same revoke and `grant execute ... to service_role`) | RPC, `security definer` | `drinks jsonb` (each drink gains `sourceHash`), `merges jsonb`, `staple_names text[]`, new `hidden_source_ids text[] default '{}'` | `jsonb` report: `lockedSkipped`, `changedUpstream`, `keptMissing`, `lockedStillDeleted` (each `[{sourceId, name}]`) | service role only | `merge target % is not a live recipe` (unchanged; AC-3 keeps a merge target from being admin deleted) |
| `import_custom_recipes` (changed; same drop and recreate) | RPC, `security definer` | `recipes jsonb` (each gains `sourceHash`) | `jsonb` report: `lockedSkipped`, `changedUpstream` | service role only | `custom recipe sourceId must start with "custom:"` (unchanged) |
| `admin_upsert_recipe` (changed signature: adds `p_set_fame_score boolean default false`, `p_fame_score smallint default null`) | RPC, `security definer` | existing params plus the two above | recipe `id` | `is_admin` check (unchanged) | `fame score must be a whole number from 0 to 100` |
| `admin_delete_recipe` (changed body: lock, merge target refusal, rerank) | RPC | `p_recipe_id` | void | `is_admin` | `this recipe is a merge target in catalogOverrides.json` |
| `apply_fame_on_arrival` (new) | RPC, `security definer`, `set search_path = ''` | `proposals jsonb` (`id`, `region`, `fame_score`) | void | service role only (revoke from `public, anon, authenticated`) | raises on out of range score; skips rows whose `fame_score` is no longer null |
| `admin_reset_recipe_to_source` (new) | RPC, `security definer`, `set search_path = ''` | `p_recipe_id uuid` | void | `is_admin`; `revoke all ... from public, anon`; `grant execute ... to authenticated` | `not authorized`, `recipe not found`, `only catalog recipes can be reset` |
| `recompute_popularity_ranks` (new, internal) | SQL function, `security definer`, same owner as its callers | `p_regions text[]` | void | revoked from `public, anon, authenticated`; called by `apply_region_proposals`, `apply_fame_on_arrival`, `admin_upsert_recipe`, and `admin_delete_recipe` | none. Keeps today's two phase rewrite (null the ranks in those regions, then rank live scored rows top 10 by fame, name, id) so the partial unique index on `(region, popularity_rank)` never sees a collision |
| `apply_region_proposals` (body change only) | RPC | unchanged | unchanged | service role only (unchanged) | unchanged; its step 3 calls `recompute_popularity_ranks` |
| `search_recipes` (`create or replace`, signature and return table unchanged) | RPC | unchanged | unchanged | anon and authenticated (unchanged) | none new |
| `@bartendingapp/shared/fame-scoring` (new subpath export, `src/fameScoring.ts`) | TS module | `supabase`, `anthropic`, `{ limit }` | `{ scored, unscored, waiting }` (each `{ id, name }[]`), or an explicit error result | service role client | Haiku or apply failure returned, never thrown |
| `import --dry-run --diff-locks` (new flag; only valid with `--dry-run`) | CLI | none | `lock-candidates.json` | service role key in your shell | read failures exit non zero |
| `import --backfill-done` (new flag) | CLI | none | lets a real run pass the AC-15 guard | service role key | without it, exits non zero before any write while no row has a `source_hash` |
| `import:apply-locks` (new script, `src/applyLocks.ts`) | CLI | `lock-candidates.json` | count locked, unknown ids listed | service role key | missing or invalid file exits non zero, nothing written |
| Admin reads (`packages/shared/src/adminRecipes.ts`: `fetchAdminRecipes` and the edit page loader) | TS | new status filter `live \| deleted` (default `live`) | adds `admin_locked_at`, both hashes, `fame_score`, `deleted_at` to the select; the edit loader returns a deleted row only when it is locked and `source = 'catalog'` | admin session | unchanged |
| Admin list, edit page, form (`apps/web/src/admin/*`) | UI | the fields above | badges, Deleted filter, notice, fame field, Reset button (Reset only, no Save, on a deleted recipe) | admin pages (unchanged gate) | Reset failure shows an inline error |

**Value sourcing**:

| Action | Value produced / displayed | Source |
|---|---|---|
| `admin_upsert_recipe` | whether an import owned field changed (AC-1) | the stored row read with `select ... for update` before any write: `name`, `lower(btrim(glass))`, `alcoholic_status`, `instructions` (`custom:` rows only), its `recipe_ingredients` as an ordered list of (`ingredients.normalized_name`, `nullif(btrim(measure), '')`, `sort_order`, `amount_value`, `amount_max_value`, `amount_unit`), and its catalog `recipe_tags` normalized names as a set, compared with the `p_*` inputs normalized the same way |
| `admin_upsert_recipe` | new `admin_locked_at` | `now()` when the comparison above differs and `source = 'catalog'` and it was null; else unchanged |
| `admin_upsert_recipe` | new `source_hash` on a locked row | the row's own `latest_source_hash` |
| `admin_upsert_recipe` | `fame_score` | `p_fame_score` when `p_set_fame_score`; unchanged otherwise |
| `admin_upsert_recipe` | regions to rerank | old `region` read before the write plus `p_region`, when either fame or region changed |
| `import_catalog` | each recipe's `latest_source_hash` | `drink ->> 'sourceHash'`, from `sourceHash()` in the job |
| `import_catalog` | whether a recipe is hidden by overrides | `hidden_source_ids`, computed in the job as transformed ids not present in `applied.drinks` |
| `import_catalog` | merge alias text | the hidden (`fromSourceId`) recipe's stored `recipes.name` (even if a lock renamed it); no alias when that recipe doesn't exist; skipped when it equals the kept recipe's stored name ignoring case |
| report `lockedStillDeleted` | locked recipes back in source but deleted | payload rows whose stored row is locked and `deleted_at is not null` |
| report `keptMissing` | locked recipes gone from source | `source = 'catalog'`, not `custom:`, locked, `deleted_at is null`, id not in the payload and not in `hidden_source_ids` |
| report "overrides ignored" | content overrides on locked recipes | the job: keys of `overrides.recipes` with `name`, `instructions`, or `addIngredients`, intersected with `lockedSkipped` |
| `lock-candidates.json` | differing fields | the job: stored rows (read via service role, paged like `fetchStoredImageStates`) compared field by field against `applied.drinks`, measure text not parsed amounts |
| fame tail | recipes to score | `recipes` where `fame_score is null and deleted_at is null`, ordered by `created_at`, `limit 200` |
| fame tail | region to apply | the proposal's region when the recipe's `region` is null; the recipe's existing `region` otherwise |
| fame tail apply | which rows to write | `apply_fame_on_arrival`, re-checking `fame_score is null` under the row lock at apply time |
| Admin badges | Locked / Changed upstream / Unscored / Deleted | `admin_locked_at is not null` / that plus `latest_source_hash is distinct from source_hash` and `source_hash is not null` / `fame_score is null` / `deleted_at is not null`, added to the select in `packages/shared/src/adminRecipes.ts` |
| AC-15 guard | whether any hashed run happened | `select 1 from recipes where source_hash is not null limit 1`, read by the job before writing |
| Reset button visibility | whether to show | `source = 'catalog' and admin_locked_at is not null` from the edit page's recipe load |

**Key invariants**:
- The import never writes a content column, `recipe_ingredients`, catalog `recipe_tags`, or `deleted_at` on a row whose `admin_locked_at` is not null, except soft deleting a locked row that `hidden_source_ids` names. The reconciliation step becomes `... and (admin_locked_at is null or source_id = any (hidden_source_ids))`. The upsert's `returning` clause also returns `admin_locked_at`, and the child row steps (ingredients, tags) branch on that returned value, not an earlier read.
- `source = 'admin'` rows never carry a lock or hashes.
- Only `import_catalog` writes or deletes `recipe_aliases` rows with `source = 'merge'`; the classifier keeps deleting only `generated`.
- `import_catalog` stays one transaction under `pg_advisory_xact_lock(hashtext('import_catalog'))`. The merge alias rewrite happens inside it, after the merge loop (step 3) and the pointer cleanup (step 4): first delete every `source = 'merge'` row, then insert one per merge resolved this run.
- Concurrency: the import's `on conflict ... do update` reads the row's committed `admin_locked_at` under the row lock, so an admin save that commits first always wins; a save that lands after the import touched the row simply locks it from then on. `admin_upsert_recipe` reads the row `for update` before comparing, so it never compares against content an import is changing. No new advisory lock.
- Fame scoring runs after the catalog transaction commits and never rolls it back; it reuses the prompt and zod schema from spec 0038, not a copy.
- `search_recipes`'s `alias_matches` CTE comes after `name_cjk_matches`, excludes ids from the name, trigram, and CJK CTEs, casts its rank to `real`, and returns `base_name = r.name`; `ingredient_matches` adds `r.id not in (select id from alias_matches)`, so a recipe appears once. `recipe_aliases` already has a public select policy, so no policy changes.
- `generated` aliases have no unique constraint, so one may duplicate a `merge` alias; that is harmless (bartender search dedupes by recipe).

**Security model**: the import RPCs stay `security definer` with execute granted only to `service_role`. Every admin RPC checks `user_preferences.is_admin` first and raises `not authorized` otherwise; `admin_reset_recipe_to_source` and `recompute_popularity_ranks` follow the `set search_path = ''` pattern. The new `recipes` columns are readable through the existing public select policy (they reveal only that an admin edited a recipe, which is not sensitive); writes stay behind the existing admin update policies and RPCs. No PII, no compliance scope.

**Configuration required**: none new. The import job already needs `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and `ANTHROPIC_API_KEY` (fame scoring is skipped with a warning without it, like translation).

**Critical test scenarios** (each maps to an acceptance criterion):
- Happy path: lock a TheCocktailDB recipe by renaming it in admin, run the import, the name survives and the report lists it under locked skipped, verifies **AC-1**, **AC-2**, **AC-13**.
- No accidental lock: change only the fame score of an unlocked catalog recipe, `admin_locked_at` stays null; open an imported recipe (with untrimmed measures and source glass casing) and save it unchanged, it stays unlocked; edit only a TheCocktailDB recipe's instructions, it stays unlocked, verifies **AC-1**, **AC-10**.
- Delete sticks: admin delete a catalog recipe, run the import, it is still deleted; try to delete a merge target, it is refused, verifies **AC-3**.
- Deleted reset: filter the admin list to Deleted, open the locked deleted recipe, only Reset shows; reset and import, it is live, verifies **AC-6**, **AC-7**.
- Guard: on a database with no `source_hash` yet, a real `import` exits non zero before writing; with `--backfill-done` it runs, verifies **AC-15**.
- Fame race: set a fame score in admin on a recipe the tail is about to score; `apply_fame_on_arrival` leaves the admin value, verifies **AC-9**.
- Upstream change: edit a locked recipe's override in `catalogOverrides.json`, run twice, it is listed both times; save it once in admin, the next run no longer lists it, verifies **AC-5**.
- Kept vs hidden: a locked recipe missing from the payload stays live and is listed; a locked recipe in `hidden_source_ids` is soft deleted, verifies **AC-4**.
- Reset: reset a locked, deleted recipe that is still in source, run the import, it is live with source content and both hashes equal, verifies **AC-6**.
- Backfill: with one stored name changed by hand, `--dry-run --diff-locks` lists exactly that recipe with `name` as the differing field and writes nothing; `import:apply-locks` locks it, verifies **AC-8**.
- Fame failure: with the Haiku call failing, the import still exits 0, prints the unscored list, and the next run scores them, verifies **AC-9**.
- Alias lifecycle: after an import, `search_recipes('long island tea', ...)` returns Long Island Iced Tea once; remove that merge, run again, the alias row is gone, verifies **AC-11**, **AC-12**.
- Auth: a signed in non admin calling `admin_reset_recipe_to_source` gets `not authorized` and the lock is unchanged, verifies **AC-14**.
- Pure units (vitest, beside the source): `sourceHash` is stable across key order and changes on each hashed field; the diff function reports the right field names; `hidden_source_ids` derivation; the fame tail region rule, verifies **AC-5**, **AC-8**, **AC-9**.

## Build plan

Ordered as a Tracer Bullet: the first slice runs one real thread end to end (admin edit → lock → import respects it → badge), then each slice thickens one rule. Migrations are one per slice, applied in the Supabase SQL editor.

1. **Thin thread: the lock.** Migration `<ts>_catalog_lock.sql`: add `admin_locked_at`; change `admin_upsert_recipe` to read the row `for update`, compare import owned fields with the AC-1 normalizations, and take the lock; change `admin_delete_recipe` to take the lock on catalog rows and refuse a merge target; change `import_catalog` so a locked row keeps its content columns, ingredients, catalog tags, and `deleted_at` (branching on the `returning` value), and return the `lockedSkipped` report (drop, recreate, regrant). Regenerate `database.types.ts`. Print the report in `index.ts`. Add the columns to the select in `packages/shared/src/adminRecipes.ts` and the "Locked" badge to `admin-recipe-list.tsx`. Add the unchanged save case to vitest (the payload builder) and to a SQL check in `/check verify`. Satisfies **AC-1**, **AC-2**, **AC-3**, **AC-7**, **AC-13**.
2. **Backfill tool and guard** (must ship before the first real import after slice 1 goes live). Add the pure diff in `packages/import-job/src/lockDiff.ts` with vitest cases (measure text only, no instructions or IBA), the `--diff-locks` dry run branch writing `lock-candidates.json` (add it to `.gitignore`; error without `--dry-run`), `src/applyLocks.ts` with an `import:apply-locks` script, and the AC-15 guard with `--backfill-done`. Satisfies **AC-8**, **AC-15**.
3. **Upstream fingerprint and source drops.** Migration `<ts>_catalog_source_hash.sql`: add both hash columns; `import_catalog` takes `hidden_source_ids`, writes the hashes per AC-5, keeps locked rows missing from source live, and returns `changedUpstream`, `keptMissing`, and `lockedStillDeleted`; `admin_upsert_recipe` acknowledges. Add `sourceHash.ts` with vitest cases, send `sourceHash` and `hidden_source_ids` from `index.ts`, print the "overrides ignored" line and the dry run counts. Add the "Changed upstream" badge and edit page notice. Satisfies **AC-4**, **AC-5**, **AC-7**, **AC-13**.
4. **Custom recipe parity and reset.** Same migration file or `<ts>_catalog_reset.sql`: `import_custom_recipes` respects the lock and writes hashes; new `admin_reset_recipe_to_source`. Send `sourceHash` from `importCustomRecipes.ts` and print its report. Add the Deleted status filter and badge (`fetchAdminRecipes` status param), let the edit loader return a locked deleted catalog row, and add the Reset button with a confirm step (Reset only, no Save, on a deleted recipe), wired through `use-admin-recipe-mutations.ts`, with copy in every admin locale file the admin UI already uses. Satisfies **AC-2**, **AC-3**, **AC-5**, **AC-6**, **AC-7**, **AC-14**.
5. **Merge aliases in search.** Migration `<ts>_merge_aliases.sql`: widen the source check, add `recipe_aliases_merge_unique`, rewrite `merge` aliases in `import_catalog` after steps 3 and 4 (delete all, then insert), and add an `alias_matches` CTE (bucket 1, trigram similarity on `alias` over `source = 'merge'` rows of live recipes, excluding ids the name CTEs already returned, with `ingredient_matches` excluding it in turn) to `search_recipes` built from the live definition in `20261111150000_cjk_search.sql`. Satisfies **AC-11**, **AC-12**.
6. **Fame for new recipes.** Migration `<ts>_fame_on_arrival.sql`: `recompute_popularity_ranks(text[])` extracted from `apply_region_proposals` step 3 keeping its two phase rewrite (which now calls it); new `apply_fame_on_arrival(jsonb)` that writes only rows whose `fame_score` is still null, then reranks; `admin_upsert_recipe` gains `p_set_fame_score`/`p_fame_score` and reranks the old and new region when fame or region changed; `admin_delete_recipe` reranks the deleted recipe's region. Move the batch prompt, zod schema, and retry from `scripts/tag-regions.ts` into `src/fameScoring.ts` (subpath `@bartendingapp/shared/fame-scoring`), keep the script working on top of it, and call `scoreUnscoredRecipes(..., { limit: 200 })` at the end of both import entry points, non fatal like translation. Add the fame field to `admin-recipe-form.tsx` and the "Unscored" badge. Satisfies **AC-7**, **AC-9**, **AC-10**.
7. **Live rollout** (manual, in this order): apply the migrations in the SQL editor; run `import --dry-run --diff-locks`, review `lock-candidates.json` and delete entries you don't want locked, run `import:apply-locks`; then run the real `import --backfill-done` and `import:custom` and read the report (the first run sets every `source_hash` baseline, so nothing should show as changed upstream). Satisfies **AC-2**, **AC-5**, **AC-8**, **AC-9**, **AC-11**, **AC-15**.

## Migration plan

**Strategy**: feature flagged by order of operations, no runtime flag. Every new column is nullable and the new RPC params have defaults, so the old job code keeps working against the new database.
**Phases**:
1. Apply slice 1 to 3 migrations. Until step 2 of the rollout runs, do not run the real import.
2. Backfill locks from the reviewed diff (`--diff-locks`, then `import:apply-locks`).
3. First real import: sets hash baselines, writes merge aliases, scores unscored recipes.
4. Slices 4 to 6 deploy the same way; slice 6's fame tail starts on the next import after it ships.
**Rollback**: to undo the lock behavior, `update recipes set admin_locked_at = null`, `drop function` the new `import_catalog` and `import_custom_recipes` (their return type changed, so `create or replace` alone fails), and restore the previous `import_catalog`, `import_custom_recipes`, `admin_upsert_recipe`, and `admin_delete_recipe` from `20261114130000_batch_ranges.sql`, `20261114140000_recipe_method_source.sql`, and `20260930200000_admin_recipe_management.sql`. Merge aliases: `delete from recipe_aliases where source = 'merge'` and restore `search_recipes` from `20261111150000_cjk_search.sql`. Before the first fame tail run, export `id, region, fame_score, popularity_rank` as CSV (spec 0038's rollback rule).
**Risks**: running the real import before the backfill undoes any earlier admin edit for good (there is no history to recover it from), which is why AC-15 makes the import refuse until you pass `--backfill-done`; a too broad diff locks rows that only drifted for harmless reasons (reviewing the candidates file is the guard); the auto applied fame scores skip spec 0038's human spot check.

## Consequences

**Positive**:
- An import can no longer silently undo an admin edit or delete; the scope's Done when holds by construction.
- Upstream fixes to a recipe you took over are surfaced on every run, not lost.
- New recipes are scored the same run they arrive, so browse, search order, and the classics row stay right without a manual step.
- Old duplicate names keep working as search terms, in both main and bartender search.
- Editing a fame score or region in admin now keeps `popularity_rank` consistent, closing a gap that existed before this spec.

**Negative / tradeoffs**:
- The lock is whole recipe: once you change one field, upstream changes to every other field stop flowing in. You see them in the report, but applying them is manual (reset, or copy by hand).
- `import_catalog` grows again (lock branches, hashes, report, aliases); it is the riskiest function in the schema and has no automated database test.
- Auto applied fame scores are an LLM judgment with no review step, unlike the initial run in spec 0038.
- Locked recipes never get reparsed amounts from an import, so a future parser improvement needs its own direct reparse script to reach them.
- A merge target can't be deleted from admin; you remove the merge from `catalogOverrides.json` first.
- Merge aliases are English names only; searching a merged name in another locale does not find it.
- The backfill covers TheCocktailDB recipes only. An earlier admin edit to a `custom:` recipe is overwritten by the next `import:custom`, so copy any such edit into `customRecipes.json` before that run.
- The diff based backfill can't tell an old admin edit from an upstream change TheCocktailDB made since the last import; you decide by reviewing the file.

**Neutral**:
- Content overrides on a locked recipe become inert; the report names them so you can delete or move them.
- `import_catalog` and `import_custom_recipes` change return type from `void` to `jsonb`, so they are dropped and recreated with their grants.
- The tagging script keeps working for full reruns (`--all`) on top of the shared module.

## Follow-up

- [ ] Spec 0035's Follow-up ("decide whether admin edits should win"), spec 0036's two Follow-ups (admin edits vs import, merge aliases), and spec 0038's Follow-up (fame on arrival) are settled by this spec; tick them when it ships.
- [ ] `packages/import-job/AGENTS.md` should gain the lock rule ("never write a locked recipe's content") and the two new commands; `/sync` owns that.
- [ ] Consider translating merge aliases per locale if non English search for old duplicate names turns out to matter.
