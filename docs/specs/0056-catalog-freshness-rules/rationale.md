# 0056. Catalog freshness rules: rationale

## Context

The recipe catalog has three writers. The TheCocktailDB import (`import_catalog`, spec 0002) upserts every drink on each run. The custom recipe import (`import_custom_recipes`) does the same for `customRecipes.json`. The admin UI (`admin_upsert_recipe`, spec 0030) edits any recipe in place, including imported ones. The import already protects a few admin owned things: uploaded images (`image_origin = 'admin_upload'`, spec 0041), instructions unless an override replaces them, taste tags, and the method (`method_source`, spec 0054). Everything else (name, glass, alcoholic status, IBA, ingredients, catalog tags) is overwritten on every run. Worse, the import sets `deleted_at = null` on every recipe it sees, so an admin delete of a catalog recipe comes back on the next run. Specs 0035 and 0036 both deferred this decision. The `catalogOverrides.json` file (spec 0036) solved it for the cleanup itself, but not for admin edits.

New recipes have a second problem. Spec 0038 made the default browse order, search tiebreaks, and the home classics row depend on `fame_score`, an LLM judged score loaded once by `tag-regions.ts`. Nothing runs that script again, so every recipe added by an import or by the admin arrives with no score and sorts last until someone remembers to run it.

Third, spec 0036 merged five duplicates (Long Island Tea into Long Island Iced Tea, and so on). The hidden rows are soft deleted, so their old names no longer find anything in main search. `recipe_aliases` exists, but only bartender search reads it, and its rows are written by a Haiku classifier that deletes and rewrites `generated` rows.

The forces: one admin, a small catalog (about 430 live recipes), imports run by hand from your shell, migrations applied in the SQL editor, no history of past values to recover an overwritten edit from, and a strong project preference for reusing existing patterns (the `image_origin` and `method_source` guards) over new machinery. Leaving this undecided means every import is a gamble against your own edits, which makes the admin UI unsafe to use on catalog recipes.

## Options considered

### Option 1: Whole recipe lock, fingerprint, import tail scoring, import owned merge aliases

The first admin change to an import owned field (or an admin delete) locks the recipe, and the import then leaves its content and delete state alone. A source hash per recipe lets the import report when TheCocktailDB changes a locked recipe; a Reset hands it back. The import tail scores unscored recipes through the existing fame prompt. The import writes merge aliases, and main search reads them.

**Pros**:
- One column decides ownership, the same shape as the `image_origin` guard the import already has.
- No silent loss in either direction: admin edits survive, and upstream changes are reported.
- Fame and aliases ride on the import you already run, so there's nothing new to schedule.

**Cons**:
- Coarse: one edited field freezes every field of that recipe against upstream.
- Adds more branches to `import_catalog`, which is already the largest function in the schema.

### Option 2: Per field ownership

Track which fields the admin changed (a `jsonb` of field names, or a provenance column per field like `method_source`), and let the import keep updating every other field.

**Pros**:
- The most precise: upstream fixes keep flowing into fields you never touched.

**Cons**:
- Ingredients and tags are row sets, not columns, so "which part did the admin change" needs a diff model of its own.
- Roughly doubles the logic in both import RPCs and the admin save, for a catalog where upstream edits are rare.

### Option 3: Import wins, admin edits on catalog recipes go through the overrides file

Make catalog recipes read only in the admin UI; every fix becomes a reviewed entry in `catalogOverrides.json`.

**Pros**:
- One source of truth, versioned and diffable, already validated before any write.
- No change to the import's ownership model.

**Cons**:
- Every small fix needs a code change, a commit, and an import run instead of a form save.
- The overrides schema would have to grow to cover glass, status, measures, and tags, rebuilding the admin form in JSON.

### Option 4: Import wins, warn on the form

Keep today's behavior and add a warning to the edit form.

**Pros**:
- No schema or RPC change at all.

**Cons**:
- Fails the scope's Done when outright: an import still silently undoes an admin edit and revives an admin delete.

## Rationale

The scope's Done when is absolute ("an import never silently undoes an admin edit"), which rules out Option 4. Option 3 meets it, but it moves the one person who curates the catalog from a form to a JSON file for every fix. That's the right call for bulk, judgment heavy cleanup (spec 0036), and the wrong one for day to day corrections. Between 1 and 2, the question is how often TheCocktailDB changes a recipe you also edited. With one admin and a slow moving upstream, that's rare, so Option 2's precision buys little and costs a diff model for ingredient and tag sets in two RPCs. Option 1 keeps the rule one sentence long. The fingerprint closes its one real weakness: you're told about every upstream change to a locked recipe, on every run, until you deal with it.

Locked recipes beat the overrides file's content fixes because the lock is the newer, more specific intent, and the report names any override made inert. Hide and merge still win because they decide the catalog's shape, not a recipe's content. A locked recipe that TheCocktailDB drops stays live because you've chosen to stand behind it. The lock triggers only on a real change to an import owned field, so fixing a fame score or region doesn't freeze a recipe by accident.

For fame, the import tail is the one moment new recipes appear, and the scoring pipeline already exists with a human review step that matters for the first bulk run of 430 recipes, not for the handful per later run. The form field covers admin added recipes right away, and the tail catches anything left blank. The 200 cap bounds cost if TheCocktailDB ever adds a big batch. Merge aliases belong to the import because the merges live in its overrides file, and rewriting them each run mirrors how the import already reconciles `merged_into_recipe_id`. Main search reads only `merge` aliases because the generated shorthand was tuned for bartender mode and would add noisy matches to public search.

Calls made at write time, with the runner up:
- **Hash after overrides, not raw source** (runner up: raw source). The hash should describe what the import would write, so an override edit also prompts a review.
- **`source_hash` baseline when null** (runner up: a separate baseline step). The first import after rollout sets every baseline, so locks taken before any hash existed don't all show as changed.
- **Alias CTE in bucket 1 with trigram similarity** (runner up: exact match only in bucket 0). Old duplicate names are often misspellings, so fuzzy matching earns its place, and bucket 1 keeps a real name match ahead.
- **Extract `recompute_popularity_ranks`** (runner up: duplicate the ranking SQL in `admin_upsert_recipe`). One ranking rule, two callers.
- **Fame module in `packages/shared`** (runner up: import the script file). `packages/import-job/AGENTS.md` requires reusing shared modules through subpath exports.
