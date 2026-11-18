# Verify: Catalog freshness rules · spec 0056 · updated 2026-11-14
_Steps derived from spec 0056 acceptance criteria. `/check verify` runs these; `/test` locks the durable ones._

This file covers milestone 3 (Upstream changes and Reset) and milestone 4 (Merge aliases and fame on arrival). Steps that run the real import need the backfill done first (spec 0056 Live rollout); until then use `--dry-run`, or run the real import against a branch or local database.

## UI / manual
- [ ] Sign in as the test admin, open Admin > Recipes, set Status to Deleted → only soft deleted recipes are listed, each with a "Deleted" badge and no Delete button; set it back to Live → deleted recipes are gone again → AC-7
- [ ] In the Deleted view, a deleted recipe that is not locked (or is `source = 'admin'`) has no Edit link; visiting its `/admin/recipes/<id>/edit` URL directly shows not found → AC-7
- [ ] Admin delete a catalog recipe, then open it from the Deleted view → the page shows the deleted notice and the "Hand back to the import" panel, and no form or Save button → AC-6, AC-7
- [ ] Open a live locked catalog recipe → the Reset panel shows above the form; open an unlocked catalog recipe or an admin recipe → no Reset panel → AC-6
- [ ] On a locked recipe, press "Reset to TheCocktailDB version" → a confirm step appears; Cancel leaves it locked; confirm → back on the list, the Locked badge is gone, and `admin_locked_at` is null in the database → AC-6
- [ ] With a recipe where `admin_locked_at` is set and `source_hash <> latest_source_hash` (set it by hand in SQL to test) → the list shows "Changed upstream" and the edit page shows the changed upstream notice above the form → AC-7
- [ ] Save that changed upstream recipe once without changes → `source_hash` now equals `latest_source_hash`, and the badge and notice are gone → AC-5
- [ ] Switch the admin UI to each of es, fr, hi, ja, ko, pt, ru, zh → the status filter, badges, notices, and Reset panel show translated copy, and the deleted notice shows the recipe name → AC-7
- [ ] Admin list → every recipe with a null `fame_score` shows an "Unscored" badge; one with a score shows none → AC-7
- [ ] Edit a recipe, type `72` in Fame score, save → `fame_score = 72` and its Unscored badge is gone; clear the field and save → `fame_score` is null and the badge is back → AC-10
- [ ] Type `50.5`, `101`, `-1`, or `abc` in Fame score and save → an inline "whole number from 0 to 100" error under the field, and nothing is saved (`updated_at` unchanged) → AC-10
- [ ] Change only the fame score of an unlocked catalog recipe → `admin_locked_at` stays null → AC-1, AC-10
- [ ] Move a top 10 recipe from one region to another in admin → in both regions `popularity_rank` is 1 to N with no gaps or repeats, the moved recipe ranks in its new region (or holds no rank outside the top 10), and a recipe whose region is set to blank holds no rank → AC-10
- [ ] Admin delete a recipe that holds a `popularity_rank` → its rank is null and its region's ranks close up with no gap → AC-3

## Commands
- [ ] `pnpm --filter @bartendingapp/import-job import --dry-run` → prints `locked recipes:` and `changed upstream:` counts matching `select count(*) from recipes where admin_locked_at is not null` and the changed upstream rule → AC-13
- [ ] Real `import` (after the backfill): every recipe in the payload has `latest_source_hash` set, and every unlocked one has `source_hash = latest_source_hash` → AC-5
- [ ] Lock a recipe with a null `source_hash`, run the real import → its `source_hash` takes the run's hash as the baseline and it is not listed as changed upstream → AC-5
- [ ] Add a `name` fix in `catalogOverrides.json` for a locked recipe, run the import twice → both runs list it under "locked recipes changed upstream" and under "overrides ignored because the recipe is locked"; its stored name is unchanged → AC-2, AC-5, AC-13
- [ ] Make a locked live TheCocktailDB recipe go missing from the payload (local or branch database, for example by filtering the fetched list) → it stays live and is listed under "kept though gone from source" → AC-4
- [ ] Add a locked recipe to `hide` in `catalogOverrides.json`, run the import → it is soft deleted (and merged if `duplicate`), not listed as kept → AC-4
- [ ] Remove that hide entry and run again → the recipe is back in the payload, still deleted, and listed under "still deleted (Reset brings them back)" → AC-4
- [ ] Reset a locked, deleted recipe that is still in source, run the import → it is live with source content and `source_hash = latest_source_hash` → AC-6
- [ ] Lock a `custom:` recipe in admin, change it in `customRecipes.json`, run `import:custom` → its content is unchanged and it is listed under "changed upstream"; the custom report has no kept or still deleted lines → AC-2, AC-5, AC-13
- [ ] As a signed in non admin, call `rpc('admin_reset_recipe_to_source', { p_recipe_id })` → `not authorized`, lock unchanged; as anon → permission denied → AC-14
- [ ] As admin, call it on a `source = 'admin'` recipe → `only catalog recipes can be reset`; on an unknown id → `recipe not found` → AC-14
- [ ] `pnpm test` → `sourceHash.test.ts`, `freshnessReport.test.ts`, `overrides.test.ts` (hidden ids), and `adminRecipes.test.ts` (badge and loader rules) pass → AC-4, AC-5, AC-7, AC-13
- [ ] After applying `20261114180000_merge_aliases.sql`, insert a row with `source = 'merge'` → accepted; `source = 'other'` → check violation; a second merge row with the same alias in another case on the same recipe → unique violation → AC-11
- [ ] Real `import` → `select r.name, ra.alias from recipe_aliases ra join recipes r on r.id = ra.recipe_id where ra.source = 'merge'` returns exactly one row per `mergeInto` entry in `hide` (today 5: Long Island Tea, Vodka And Tonic, Holloween Punch, Cuba Libra, Planter’s Punch) → AC-11
- [ ] Remove the Cuba Libra merge from `catalogOverrides.json`, run the import → its alias row is gone; `generated` and `manual` alias counts are unchanged across the run → AC-11
- [ ] `select name from search_recipes('long island tea')` and `search_recipes('holloween punch')` → the kept recipe appears exactly once, in bucket 1 (after any exact name matches) → AC-12
- [ ] Add a `generated` alias that only it matches (for example `zzq` on Margarita), call `search_recipes('zzq')` → no row; `search_bartender` with the same text still finds it → AC-12
- [ ] `search_recipes` with a query matching both a name and an ingredient of a recipe that also has a merge alias → that recipe appears once → AC-12
- [ ] After applying `20261114190000_fame_on_arrival.sql`: as anon and as a signed in non admin, `rpc('apply_fame_on_arrival', ...)` and `rpc('recompute_popularity_ranks', ...)` → permission denied; `admin_upsert_recipe` with `p_set_fame_score = true, p_fame_score = 101` as admin → `fame score must be a whole number from 0 to 100` → AC-9, AC-10, AC-14
- [ ] Before the first fame tail run, export `id, region, fame_score, popularity_rank` from `recipes` as CSV (spec 0038 rollback rule) → file saved → AC-9
- [ ] Real `import` with `ANTHROPIC_API_KEY` set (475 live recipes are unscored today) → the report ends with "Fame scoring:", `recipes scored: 200` (or close, minus failed batches), and `waiting for the next run: 275`; run `import:custom` or `import` twice more → waiting reaches 0 and `select count(*) from recipes where fame_score is null and deleted_at is null` is 0 → AC-9, AC-13
- [ ] Run the import with an invalid `ANTHROPIC_API_KEY` → the import still exits 0, every batch is listed under "recipes still unscored", and the next run with a good key scores them → AC-9
- [ ] `pnpm --filter @bartendingapp/shared tag-regions` (with no unscored recipes, then with `--all` on a branch) → still writes `scripts/tagging/popular-by-region-proposals.json` in the same shape → spec 0056 Consequences (script keeps working on the shared module)
- [ ] `pnpm test` → `fameScoring.test.ts` (cap split, region rule), `adminRecipes.test.ts` (fame parse, save payload), and `freshnessReport.test.ts` (fame report lines) pass → AC-9, AC-10, AC-13

## Value sourcing checks
- [ ] `latest_source_hash` comes from the job's `catalogSourceHash()`: change only a TheCocktailDB recipe's instructions with no override → the hash does not change; add an `instructions` override → it changes → AC-5
- [ ] `hidden_source_ids` comes from transformed ids missing from the applied payload: the ids sent equal the `hide` keys that exist in the source → AC-4
- [ ] `keptMissing` only counts `source = 'catalog'`, non `custom:`, locked, live rows not in the payload and not hidden: a locked `custom:` recipe never appears there → AC-4
- [ ] "Overrides ignored" counts only `name`, `instructions`, or `addIngredients` entries: a `reviewed` or `note` only entry for a locked recipe is not listed → AC-13
- [ ] Changed upstream badge needs a non null `source_hash`: a locked recipe with `source_hash` null and `latest_source_hash` set shows no badge → AC-7
- [ ] Reset button visibility comes from `source = 'catalog' and admin_locked_at is not null` on the edit page load → AC-6
- [ ] Merge alias text is the hidden recipe's stored name: lock and rename the hidden recipe, run the import → the alias holds the new stored name → AC-11
- [ ] Alias skipped when equal to the kept name ignoring case: a merge whose two recipes share a name in different case writes no alias → AC-11
- [ ] Recipes to score come from `fame_score is null and deleted_at is null`, oldest `created_at` first, capped at 200: a deleted unscored recipe is never sent, and the 201st oldest is listed as waiting → AC-9
- [ ] Region to apply: call `apply_fame_on_arrival` (service role) with region `Cuban` for one unscored recipe whose region is `British` and one whose region is null → the first keeps `British`, the second becomes `Cuban`; both get the fame score → AC-9
- [ ] Which rows to write: set a fame score in admin on an unscored recipe, then call `apply_fame_on_arrival` with a different score for it → the admin score is kept and nothing else on the row changes → AC-9
- [ ] Regions to rerank on an admin save come from the old region read before the write plus `p_region`: move a recipe from `Cuban` to `British` → ranks are recomputed in both, not only the new one → AC-10
- [ ] Unscored badge comes from `fame_score is null` in the list select: set a score by SQL → the badge goes away on reload → AC-7

## Acceptance-criteria coverage
- AC-2 covered by the overrides ignored and custom lock steps · AC-4 by the kept, hidden, and still deleted steps · AC-5 by the hash, baseline, acknowledge, and custom steps · AC-6 by the Reset steps · AC-7 by the filter, badge, notice, and locale steps · AC-13 by the dry run and report steps · AC-14 by the non admin and wrong source steps
- AC-11 covered by the alias row, removal, and alias text steps · AC-12 by the search once, generated alias, and dedupe steps
- AC-9 covered by the fame tail run, failure, race, region rule, and cap steps · AC-10 by the fame field, invalid input, and region move rerank steps · AC-3 (rerank part) by the delete rerank step
- AC-1, AC-3 (lock part), AC-8, AC-15 (milestones 1 and 2) are not covered here yet
