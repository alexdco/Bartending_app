# Verify: Catalog freshness rules · spec 0056 · updated 2026-11-14
_Steps derived from spec 0056 acceptance criteria. `/check verify` runs these; `/test` locks the durable ones._

This file covers milestone 3 (Upstream changes and Reset). Steps that run the real import need the backfill done first (spec 0056 Live rollout); until then use `--dry-run`, or run the real import against a branch or local database.

## UI / manual
- [ ] Sign in as the test admin, open Admin > Recipes, set Status to Deleted → only soft deleted recipes are listed, each with a "Deleted" badge and no Delete button; set it back to Live → deleted recipes are gone again → AC-7
- [ ] In the Deleted view, a deleted recipe that is not locked (or is `source = 'admin'`) has no Edit link; visiting its `/admin/recipes/<id>/edit` URL directly shows not found → AC-7
- [ ] Admin delete a catalog recipe, then open it from the Deleted view → the page shows the deleted notice and the "Hand back to the import" panel, and no form or Save button → AC-6, AC-7
- [ ] Open a live locked catalog recipe → the Reset panel shows above the form; open an unlocked catalog recipe or an admin recipe → no Reset panel → AC-6
- [ ] On a locked recipe, press "Reset to TheCocktailDB version" → a confirm step appears; Cancel leaves it locked; confirm → back on the list, the Locked badge is gone, and `admin_locked_at` is null in the database → AC-6
- [ ] With a recipe where `admin_locked_at` is set and `source_hash <> latest_source_hash` (set it by hand in SQL to test) → the list shows "Changed upstream" and the edit page shows the changed upstream notice above the form → AC-7
- [ ] Save that changed upstream recipe once without changes → `source_hash` now equals `latest_source_hash`, and the badge and notice are gone → AC-5
- [ ] Switch the admin UI to each of es, fr, hi, ja, ko, pt, ru, zh → the status filter, badges, notices, and Reset panel show translated copy, and the deleted notice shows the recipe name → AC-7

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

## Value sourcing checks
- [ ] `latest_source_hash` comes from the job's `catalogSourceHash()`: change only a TheCocktailDB recipe's instructions with no override → the hash does not change; add an `instructions` override → it changes → AC-5
- [ ] `hidden_source_ids` comes from transformed ids missing from the applied payload: the ids sent equal the `hide` keys that exist in the source → AC-4
- [ ] `keptMissing` only counts `source = 'catalog'`, non `custom:`, locked, live rows not in the payload and not hidden: a locked `custom:` recipe never appears there → AC-4
- [ ] "Overrides ignored" counts only `name`, `instructions`, or `addIngredients` entries: a `reviewed` or `note` only entry for a locked recipe is not listed → AC-13
- [ ] Changed upstream badge needs a non null `source_hash`: a locked recipe with `source_hash` null and `latest_source_hash` set shows no badge → AC-7
- [ ] Reset button visibility comes from `source = 'catalog' and admin_locked_at is not null` on the edit page load → AC-6

## Acceptance-criteria coverage
- AC-2 covered by the overrides ignored and custom lock steps · AC-4 by the kept, hidden, and still deleted steps · AC-5 by the hash, baseline, acknowledge, and custom steps · AC-6 by the Reset steps · AC-7 by the filter, badge, notice, and locale steps · AC-13 by the dry run and report steps · AC-14 by the non admin and wrong source steps
- AC-1, AC-3, AC-8, AC-15 (milestones 1 and 2) and AC-9 to AC-12 (milestone 4) are not covered here yet
