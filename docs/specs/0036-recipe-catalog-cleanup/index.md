# 0036. Recipe catalog cleanup through a curated overrides file

**Date**: 2026-10-11
**Status**: In Progress

## Summary

The recipe catalog we imported from TheCocktailDB has duplicates, misspellings, crude names, messy glass and ingredient casing, and instructions that mention ingredients the recipe never lists. We fix all of it through one curated overrides file in the import job, so every rerun of the import comes out clean instead of undoing the fixes. Duplicates are hidden and their old links redirect to the copy we keep, crude names are hidden, glass and ingredient names follow one casing rule, and Ice and Water become "staples" (always on hand) that never show pantry or shopping list buttons.

## Requirements

**User stories**:
- As a visitor, I want one clean entry per drink, so search and lists aren't padded with misspelled copies.
- As a visitor with an old link to a duplicate, I want to land on the right recipe, not a 404.
- As the site owner, I want crude names off the site, so the brand and the 17+ store rating are easier.
- As a home user, I want pantry matching to assume I have ice and water, so drinks aren't marked "missing: Ice".
- As the site owner, I want cleanup that survives a reimport, so I fix each problem once.

**Acceptance criteria**:
- **AC-1**: The 5 duplicate recipes (Cuba Libra `13751`, Holloween Punch `12954`, Planter’s Punch with a curly apostrophe `178368`, Long Island Tea `11002`, Vodka And Tonic `12460`) are soft deleted (`deleted_at` set). They don't appear in search, lists, the sitemap, recommendations, popular, the homepage, or pantry matches. The kept recipes are Cuba Libre `11288`, Halloween Punch `178313`, Planter's Punch `17191`, Long Island Iced Tea `17204`, and Vodka Tonic `178364`.
- **AC-2**: Opening a hidden duplicate's URL on web (`/recipes/<slug>-<id>`, any locale) permanently redirects (308) to the kept recipe's canonical URL in the same locale. Opening a hidden duplicate's id on mobile replaces the screen with the kept recipe.
- **AC-3**: The 5 crude recipes (Orgasm, Royal Bitch, Pink Panty Pulldowns, Deep Throat Cocktail, Dirty Nipple, matched by `source_id`) are soft deleted. Their web URL returns 404, and mobile shows the existing not found state.
- **AC-4**: Running the import twice in a row, with or without the custom recipes import in between, leaves the hidden set, merge pointers, recipe names, glass values, ingredient names, staple flags, and override fixes identical (the second run changes none of these fields; `updated_at` is not compared).
- **AC-5**: When the import sets a merge, favorites and bartender pins on the hidden duplicate move to the kept recipe. A user who already has the kept recipe keeps one row (no duplicate, no error), and a user at the 20 pin limit doesn't abort the import.
- **AC-6**: Every catalog `recipes.glass` value is a canonical name from `GLASS_MAP`, in sentence case. No two distinct glass values differ only by case or by a listed synonym. A glass the map doesn't know falls back to sentence case and is logged by the import. Admin recipe saves (create and edit) apply the same function.
- **AC-7**: Every catalog ingredient name follows the ingredient casing rule (Title Case, with the exceptions in `INGREDIENT_NAME_MAP`). For example, `demerara Sugar` becomes `Demerara Sugar` and `blackstrap rum` becomes `Blackstrap Rum`. The custom recipes import and admin recipe saves (create and edit) apply the same function, so no import or save flips a name back.
- **AC-8**: `pnpm --filter @bartendingapp/import-job report:unlisted` prints every catalog recipe whose instructions name an ingredient missing from its ingredient list, using whole word, case insensitive matching of catalog ingredient names plus the synonym map, and skipping staples. Americano is flagged for Soda water.
- **AC-9**: Fixes recorded in the overrides file (`addIngredients`, `instructions`) are applied by the import and survive a reimport. After the fix pass, Americano lists Soda water, and the report reruns with no unresolved entries other than ones recorded as `reviewed` in the file.
- **AC-10**: Ice and Water have `ingredients.is_staple = true`. On web and mobile, a staple in a recipe's ingredient list shows no Add to pantry or Add to shopping list button. Pantry and shopping list ingredient search (web and mobile) never offer a staple. House recipe detail screens are unchanged. Any existing pantry or shopping list rows for staples are removed.
- **AC-11**: Pantry matching counts staples as present. A recipe whose only non staple ingredients are all in the pantry is a full match, and a staple never appears in `missing_ingredients`. A recipe made only of staples is not returned.
- **AC-12**: The overrides file is validated (zod) before any write. A `recipes` key or `mergeInto` target that is unknown, a target that is itself hidden, a merge cycle, a staple that matches no ingredient, or an `addIngredients` entry naming an ingredient the recipe already lists fails the import with a clear message, and nothing is written. A `hide` key missing from the source logs a warning and is skipped.
- **AC-13**: Bartender mode and admin are unchanged: staples can still be marked out of stock (86'd), and the ingredient search in the admin recipe form and the house recipe forms (web and mobile) still offers Ice and Water.

## Decision

**Chosen option**: Option 1: a curated overrides file applied in the import transform.

Cleanup rules live in `packages/import-job/src/catalogOverrides.json` (zod validated, in git). Pure functions apply them to the TheCocktailDB payload before `import_catalog` runs. Hidden recipes are left out of the payload, so the existing reconciliation soft deletes them. The RPC then records merge pointers and staple flags. The casing and glass functions live in `packages/shared` so admin saves use them too.

**Implementation skills**: `supabase-postgres-best-practices` (`supabase/agent-skills`, `.agents/skills/supabase-postgres-best-practices/`) · `nextjs-app-router-patterns` (`wshobson/agents`, `.agents/skills/nextjs-app-router-patterns/`) · `vitest` (`antfu/skills`, `.agents/skills/vitest/`)

## Rationale

Reasoning and options: see [rationale.md](rationale.md).

## Feature design

**Data model sketch** (one migration):
- `recipes.merged_into_recipe_id uuid null`, references `recipes(id)` `on delete set null`, check `merged_into_recipe_id <> id`. Set only on a hidden duplicate. Comment the column.
- `ingredients.is_staple boolean not null default false`. No index needed (299 rows).
- Delete `pantry_items` and `shopping_list_items` rows whose ingredient is a staple (0 rows live today, still run it).

**Overrides file** (`packages/import-job/src/catalogOverrides.json`, schema in `catalogOverridesSchema.ts`):
```jsonc
{
  "hide": {                        // keyed by TheCocktailDB source_id
    "13751": { "reason": "duplicate", "mergeInto": "11288" },
    "12460": { "reason": "duplicate", "mergeInto": "178364" },
    "14134": { "reason": "crude" }   // ids resolved at build time from the live table
  },
  "recipes": {                     // per source_id fixes
    "11000": {
      "addIngredients": [{ "ingredientName": "Soda Water", "measure": "Top" }],
      "instructions": "…",         // optional full replacement
      "reviewed": true             // report entry checked, nothing to fix
    }
  },
  "unlistedIngredientSynonyms": { "soda": "Soda Water", "sugar syrup": "Simple Syrup" },
  "staples": ["Ice", "Water"]
}
```
Synonym keys are lowercased, trimmed phrases. Values are catalog ingredient display names. The crude `hide` ids are looked up from the live table by name at build time (the `14134` above is a placeholder).

**Shared functions and maps** (`packages/shared/src/catalogNames.ts`, pure, exported; they live in shared, not the overrides file, because admin saves need them too):
- `GLASS_MAP` (`{ "collins glass": "Collins glass", "coupe glass": "Coupe", "whiskey glass": "Rocks glass", … }`) and `INGREDIENT_NAME_MAP` (`{ "7-up": "7-Up", … }`), keyed by lowercased, trimmed source names.
- `canonicalGlass(raw): string | null`: map lookup on the normalized key, else sentence case.
- `canonicalIngredientName(raw): string`: map lookup, else Title Case (each word capitalized, existing inner capitals and digits kept, so `151 Proof Rum` and `7-Up` don't break).
- Applied client side in three write paths, SQL unchanged: `applyOverrides` (catalog import), `importCustomRecipes.ts` (custom recipes, and `customRecipes.json` is corrected to match), and the admin create and edit save in `packages/shared/src/adminRecipes.ts` (glass and every ingredient name). A direct RPC call can still bypass it; only the admin can make one.
- The final `GLASS_MAP` entries (all 41 live inputs, see rationale.md) and the 5 crude source ids are resolved by `/develop` at build time and recorded in `catalogNames.ts` and the overrides file. Sentence case keeps proper nouns: `Nick and Nora glass`, `Margarita/Coupette glass`, `Irish coffee cup`.

**Import job** (`packages/import-job/src`):
- `applyOverrides(drinks, overrides)` in a new pure `overrides.ts`: drops hidden source ids, canonicalizes glass and ingredient names, appends `addIngredients` (next `sortOrder`, measure parsed with `parseMeasure`), sets `instructions` plus `instructionsOverride: true` where given. Returns `{ drinks, merges, stapleNames, unknownGlasses }`.
- `index.ts` validates overrides against the fetched source and the AC-12 rules (a vanished `hide` key only warns, so a source change never blocks every import), then calls the RPC. Staple names are checked against the live `ingredients` table before the RPC. `--dry-run` prints counts (hidden, merges, glass renames, ingredient renames, fixes, unknown glasses) and makes no RPC call.
- `reportUnlistedIngredients.ts` (pure core `findUnlistedIngredients(recipes, ingredientNames, synonyms, staples)` plus a CLI entry) reads the live catalog with the service role key and prints a table. New script `report:unlisted` in `packages/import-job/package.json`. Rules: English `recipes.instructions` only; catalog ingredient names and synonyms matched whole word, case insensitive, longest name first (so "lime juice" consumes "lime"), with a trailing `s` allowed; staples skipped; recipes whose `recipes[sourceId].reviewed` is true are left out. Output is a stdout table (recipe, source id, named ingredient); exit code 0.

**API surface**:
| Surface | Kind | Key inputs | Key outputs | Auth | Key errors |
|---|---|---|---|---|---|
| `import_catalog(drinks jsonb, merges jsonb default '[]', staple_names text[] default '{}')` | RPC, replaces the 1 arg version (drop then create, no overload) | drinks (now with optional `instructionsOverride`), merges `[{fromSourceId,toSourceId}]`, staple names | void | service role only (execute revoked from public, anon, authenticated) | raises `merge target <source id> is not a live recipe` |
| `resolve_recipe_redirect(p_recipe_id uuid)` | RPC, `security definer`, `stable`, `search_path = ''` | recipe id | `uuid` of the kept recipe when the row is soft deleted and its target is live, else null | anon, authenticated | none, returns null |
| `match_recipes_to_pantry(real, int, int, text)` | RPC, `create or replace`, same signature | unchanged | missing means `pi.ingredient_id is null and not i.is_staple`; `total_count` still counts every line; a recipe with zero non staple lines is excluded | unchanged | unchanged |
| `search_ingredients(text, int, text, boolean)` | RPC: drop the `(text, int, text)` version, create the new one, grant execute to anon and authenticated again | new `include_staples boolean default false` | staples excluded unless true | unchanged | unchanged |
| `searchIngredients(client, query, limit, locale, options?)` | shared TS, calls the RPC with named args | `options.includeStaples` | as today | n/a | as today |
| `useIngredientSearch(query, { includeStaples })` | web and mobile hooks | false from pantry and shopping list screens; true from the house recipe forms (`apps/web/src/service/bar-recipe-form-page-client.tsx`, `apps/mobile/src/app/bar-recipe-form.tsx`); the admin suggestions hook passes true directly | n/a | n/a | n/a |
| `fetchRecipeRedirect(client, id)` | shared TS | recipe id | `Result<string \| null>` per the project's error return pattern | n/a | RPC error |
| Recipe detail payload (`fetch_recipe_detail`, `create or replace`) | changed | unchanged | each ingredient object gains `is_staple`, mapped to `isStaple` in `packages/shared/src/recipes.ts` and in the `bar.ts` mapper that calls the same RPC. `fetch_bar_recipe_detail` (house recipes) is unchanged | unchanged | unchanged |

`import_catalog` order inside its transaction:
1. Upsert drinks. On conflict, set `instructions = excluded.instructions` only when `instructionsOverride` is true; otherwise leave instructions alone, as today.
2. Reconcile soft deletes, as today.
3. Resolve each merge by source id, after the upsert, so a target that is new this run works. A target with no live row raises. A hidden row that doesn't exist is skipped.
4. Clear `merged_into_recipe_id` on every catalog row not named as a `fromSourceId`, then set the pointers. One hop only: a target never carries a pointer (validated).
5. For `favorites` and `pinned_recipes`, first delete the hidden id's rows for users who already hold the target. Then `update … set recipe_id = <target>` on the rest. An update doesn't fire the 20 pin insert trigger and needs no conflict clause.
6. `update ingredients set is_staple = (normalized_name = any(<staple_names, each lower(trim())>))` on every row.
7. Delete pantry and shopping list rows whose ingredient is a staple.

**Redirect read path**:
- Web, in `resolveRecipe` in `apps/web/src/app/[locale]/recipes/[slug]/page.tsx`, used by both the page and `generateMetadata`: when `fetchRecipeDetail` returns nothing, call `fetchRecipeRedirect`. On a target, `fetchRecipeDetail(target, locale)` and `permanentRedirect` (308) to its canonical slug in the route's locale. With no target, or a target that also returns nothing, call `notFound()`.
- Mobile, in the recipe screen under `apps/mobile/src/app/recipe`: on not found, call `fetchRecipeRedirect`. On a target, `router.replace` to the same route with the target id; otherwise show the existing not found state. One hop, never followed twice.

**Soft delete checklist** (`/develop` confirms each filters `deleted_at is null` or joins only live recipes, and fixes any that don't): `search_recipes`, `search_bartender` plus `recipe_aliases`, `recommend_recipes`, popular by region, the homepage queries, the favorites list, `pinned_recipes_visible`, the rating summary, `listAllRecipesForSitemap`, and the catalog translation backfill.

**Value sourcing**:
| Action | Value | Source |
|---|---|---|
| Hide a recipe | which recipes | `catalogOverrides.json` `hide` keys (source ids) |
| Redirect target | kept recipe id | `recipes.merged_into_recipe_id` via `resolve_recipe_redirect`, set from `hide[...].mergeInto` |
| Redirect URL | kept slug and locale | `buildRecipeSlugPath(keptId, keptName)` from `fetchRecipeDetail(keptId, locale)`; locale from the route param |
| Glass display | canonical glass | `canonicalGlass(source strGlass)` using `GLASS_MAP` |
| Ingredient display | canonical name | `canonicalIngredientName(source name)` using `INGREDIENT_NAME_MAP`, stored in `ingredients.name` (`normalized_name` unchanged) |
| Spanish glass, name, instructions | translated text | existing hash gated translation step; a changed English value (including an instructions override) changes the hash and retranslates on the next import |
| Staple flag | `is_staple` | `staples` in the overrides file, passed as `staple_names` |
| Button visibility | show pantry or shopping buttons | `!ingredient.isStaple` from the detail payload |
| Report rows | recipe, named ingredient | live `recipes.instructions`, `recipe_ingredients`, `ingredients.name`, synonym map, staples |
| Fixes | extra lines, new instructions | overrides `recipes[sourceId]` |

**Key invariants**:
- A row with `merged_into_recipe_id` set has `deleted_at` set, and its target has `deleted_at` null (enforced by the import validation and RPC order).
- Override entries apply only to catalog rows (`source = 'catalog'`, non `custom:` ids). Admin and custom recipes are never hidden by this file.
- `transform.ts` and `overrides.ts` stay pure; Supabase calls stay in entry points.
- Staple status comes only from `ingredients.is_staple`; no app keeps its own name list.

**Security model**: no new write paths for clients. `import_catalog` stays service role only. `resolve_recipe_redirect` exposes only the target id of a hidden duplicate; a crude hidden recipe has no pointer, so it returns null and leaks nothing. `recipes_select` (deleted rows invisible) is unchanged. No PII.

**Configuration required**: none new (the import job already needs `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY`).

**Critical test scenarios**:
- `applyOverrides` drops hidden ids, emits merges, canonicalizes glass and names, appends fixes; running it on its own output changes nothing (vitest), verifies **AC-1**, **AC-4**, **AC-6**, **AC-7**, **AC-9**
- Validation rejects an unknown id, a hidden merge target, and a cycle before any RPC call, verifies **AC-12**
- `canonicalGlass` and `canonicalIngredientName` table tests (`Collins Glass`, `Old-Fashioned glass`, `demerara Sugar`, `151 proof rum`, `7-up`, unknown glass), verifies **AC-6**, **AC-7**
- `findUnlistedIngredients` flags Americano for Soda Water via the `soda` synonym and ignores ice and water, verifies **AC-8**
- Hand run SQL check (`supabase/tests/catalog_cleanup_check.sql`): merge moves a favorite without a duplicate row, and a user holding 20 pins plus a pin on the hidden recipe doesn't abort the import; rerun is a no op; `resolve_recipe_redirect` returns the target for a duplicate and null for a crude or live id; matching treats Ice as present; `search_ingredients` hides Ice unless `include_staples`, verifies **AC-2**, **AC-4**, **AC-5**, **AC-10**, **AC-11**, **AC-13**
- Web: an old Cuba Libra URL in `/es` gets a 308 to the Spanish Cuba Libre URL; an Orgasm URL is 404, verifies **AC-2**, **AC-3**

## Build plan

Tracer Bullet: one duplicate goes all the way from the overrides file to a working redirect first, then each cleanup kind thickens that thread.

1. Migration `…_catalog_cleanup.sql`: both columns, new `import_catalog` (drop the 1 arg version, steps 1 to 7 above), `resolve_recipe_redirect`, `match_recipes_to_pantry` (`create or replace`), `search_ingredients` (drop the 3 arg version, create, grant again), `fetch_recipe_detail` gains `is_staple`, staple row cleanup. Regenerate `database.types.ts`, satisfies **AC-1**, **AC-2**, **AC-5**, **AC-10**, **AC-11**
2. Overrides schema, `overrides.ts` with hide plus merge only, validation, `--dry-run`; seed the file with the Cuba Libra merge; vitest, satisfies **AC-1**, **AC-12**
3. Web redirect in `resolveRecipe` per the redirect read path above. Run the import live (dry run, then real) and check the Cuba Libra URL end to end, satisfies **AC-2**, **AC-4**
4. Thicken hides: add the other 4 duplicates and the 5 crude ids (resolved from the live table by name and recorded in the file); walk the soft delete checklist, satisfies **AC-1**, **AC-3**, **AC-5**
5. Mobile redirect per the redirect read path, satisfies **AC-2**, **AC-3**
6. `catalogNames.ts` in shared with the final `GLASS_MAP` (all 41 live values) and the ingredient rule; wire it into `applyOverrides`, `importCustomRecipes.ts` (and correct `customRecipes.json`), and the admin create and edit save in `packages/shared/src/adminRecipes.ts`; vitest, satisfies **AC-4**, **AC-6**, **AC-7**
7. Staples: `staples` in the file, `isStaple` in the `recipes.ts` and `bar.ts` mappers, hide both buttons in `apps/web/src/recipes/ingredient-list.tsx` and `apps/mobile/src/recipes/ingredient-list.tsx`, the `includeStaples` option on `searchIngredients` and both `useIngredientSearch` hooks (true from the house recipe forms and the admin suggestions hook), satisfies **AC-10**, **AC-11**, **AC-13**
8. Report script (`report:unlisted`) plus synonym map; vitest on the pure core, satisfies **AC-8**
9. Fix pass: run the report, record each finding in `recipes[sourceId]` as a fix or `reviewed: true`; `instructionsOverride` path in the RPC, satisfies **AC-9**
10. Live rollout per the Migration plan, ending with a second import that changes nothing and the hand run SQL check, satisfies **AC-4**

## Migration plan

**Strategy**: no flag; the migration is backward compatible until the import runs.
**Phases**:
1. Apply the migration in the dashboard SQL editor (per project practice); nothing visible changes yet, since no row is hidden and no staple is flagged.
2. Deploy web and mobile (redirect, staple buttons, admin `includeStaples`).
3. Run the import with `--dry-run`, review the counts, then run it for real. Spanish retranslation of changed names and glasses runs in the same job.
4. Run the report, fill in fixes, run the import again, then once more to confirm no changes.
**Rollback**: remove entries from `catalogOverrides.json` and rerun the import. The upsert clears `deleted_at` and the RPC clears stale pointers and staple flags, so every step is reversible from the file. Moved favorites stay on the kept recipe.
**Risks**: the Title Case rule mangles a brand name (mitigated by `INGREDIENT_NAME_MAP` and the dry run printout); a translation run fails partway (the hash gate retries on the next import).

## Consequences

**Positive**:
- One reviewable file holds every catalog judgment call, and a reimport reapplies it.
- Fixes the "Import job vs admin edits" risk for catalog cleanup specifically, since the cleanup is part of the import itself.

**Negative / tradeoffs**:
- Recipe fixes are edited in JSON and need an import run to go live; there is no admin UI for them.
- Overrides are keyed by TheCocktailDB ids; if the source renumbers a drink, its entry silently stops matching (validation catches a missing id, not a renumbered one).
- Changing about 40 glass values and some ingredient names triggers a one time Spanish retranslation (small Haiku cost).
- Admin edits to a catalog recipe's name or glass are still overwritten by the import; this spec doesn't settle that deferred item. An `instructions` override also wins over an admin edit of that recipe's instructions, on every import.
- An `instructions` override retranslates that recipe's Spanish text, because instructions are part of the translation hash.
- Favorites and pins that moved to a kept recipe stay there if the duplicate is later unhidden.

**Neutral**:
- `import_catalog` gains two parameters; the 1 argument version is dropped.
- House recipes in bartender mode that copied a now hidden catalog drink are unaffected (they're standalone rows).

## Follow-up

- [ ] Decide whether AI drink ideas from the pantry (spec 0007) should tell the model that staples are always available.
- [ ] Decide whether a hidden duplicate's name should become a `recipe_aliases` entry on the kept recipe for bartender search.
- [ ] The deferred "Import job vs admin edits" decision remains open for admin changes to catalog rows.
