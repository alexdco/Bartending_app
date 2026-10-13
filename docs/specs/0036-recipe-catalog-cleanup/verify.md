# Verify: recipe catalog cleanup · spec 0036 · updated 2026-10-12
_Steps derived from spec 0036 acceptance criteria. `/check verify` runs these; `/test` locks the durable ones._

Run these after the live rollout: migration `20261012120000_catalog_cleanup.sql` applied, web and mobile deployed, then the import run for real.

## UI / manual
- [ ] Web: open an old Cuba Libra URL (`/en/recipes/cuba-libra-<old uuid>`) → 308 to the Cuba Libre canonical URL in `/en` → AC-2
- [ ] Web: open the same old Cuba Libra id under `/es` → 308 to the Spanish Cuba Libre URL in `/es` (slug from the Spanish name) → AC-2
- [ ] Web: open an old Orgasm URL → 404 → AC-3
- [ ] Web: search "cuba", "planter", "long island", "vodka tonic", "halloween" → one result each, the kept recipe → AC-1
- [ ] Web: search "orgasm", "dirty nipple" → no results; sitemap has none of the 9 hidden ids → AC-1, AC-3
- [ ] Mobile: open the old Cuba Libra id → the screen is replaced by Cuba Libre (Back doesn't return to a blank page) → AC-2
- [ ] Mobile: open an old Orgasm id → "Recipe not found" → AC-3
- [ ] Web and mobile: a recipe with Ice (e.g. Mojito) → no "Add to pantry" or "Add to shopping list" on the Ice line; other lines still have them → AC-10
- [ ] Web and mobile: pantry and shopping list ingredient search for "ice" and "water" → neither offered (Soda Water, Tonic Water still are) → AC-10
- [ ] Web and mobile: house recipe form ingredient search for "ice" → Ice offered; web admin recipe form suggestions → Ice offered; bartender 86 list still lists Ice → AC-13
- [ ] Web: pantry with only Light Rum, Lime, Coca-Cola → Cuba Libre is a full match (Ice not in missing) → AC-11
- [ ] Web: Americano lists Soda Water; Old Fashioned lists Orange Peel and Cherry; Broadside instructions say "bitters" → AC-9
- [ ] Web: glass on a former "Highball Glass" recipe reads "Highball glass"; a former "Coupe Glass" reads "Coupe" → AC-6
- [ ] Web admin: create a recipe with glass "COLLINS GLASS" and ingredient "demerara sugar" → saved as "Collins glass" and "Demerara Sugar"; edit it again → unchanged → AC-6, AC-7

## Commands
- [ ] `pnpm --filter @bartendingapp/import-job exec tsx --env-file=.env src/index.ts --dry-run` → 9 hidden, 5 merges, 0 unknown glasses, no validation error → AC-12
- [ ] Add a bogus `recipes."99999"` entry, run the dry run → fails with `recipes.99999: not in the TheCocktailDB source`, nothing written; revert → AC-12
- [ ] Run the real import twice, snapshotting `source_id, name, glass, instructions, deleted_at is null, merged_into_recipe_id` for catalog rows and `name, is_staple` for ingredients before the second run → identical → AC-4
- [ ] Run `import:custom` between two catalog imports → ingredient names and glasses unchanged → AC-4, AC-7
- [ ] `pnpm --filter @bartendingapp/import-job report:unlisted` (with env loaded) → "No unresolved unlisted ingredients." → AC-8, AC-9
- [ ] Paste `supabase/tests/catalog_cleanup_check.sql` into the SQL editor → every line PASS → AC-2, AC-4, AC-5, AC-10, AC-11, AC-13
- [ ] SQL: `select glass, count(*) from recipes where source = 'catalog' and deleted_at is null group by 1` → every value is in `GLASS_MAP`'s values, none differ only by case → AC-6
- [ ] SQL: `select name from ingredients where name <> initcap(name)` → only names from `INGREDIENT_NAME_MAP` exceptions or brand casing (e.g. `7-Up`, `Creme de Banane`) → AC-7
- [ ] SQL: `select count(*) from recipes where source = 'admin' and deleted_at is null` → same as before the import (admin recipes never hidden)

## Value sourcing
- [ ] Hide a recipe: remove `13751` from `hide`, dry run → hidden drops to 8 (then restore) → source is the overrides `hide` keys
- [ ] Redirect target: `select resolve_recipe_redirect(id) from recipes where source_id = '13751'` → Cuba Libre's id → source is `merged_into_recipe_id`
- [ ] Redirect URL: the `/es` Cuba Libra redirect lands on the Spanish slug, not the English one → locale from the route param, slug from `fetchRecipeDetail(kept, locale)`
- [ ] Glass display: an unknown glass added to a test drink → sentence cased and logged by the import → `canonicalGlass` fallback
- [ ] Ingredient display: `ingredients.name` for `lime juice` reads `Lime Juice`, `normalized_name` unchanged → `canonicalIngredientName`
- [ ] Spanish text: a recipe whose glass changed shows a retranslated Spanish glass after the import's translation step → hash gated retranslation
- [ ] Staple flag: remove `Water` from `staples`, rerun → Water's `is_staple` false and its buttons return (then restore) → `staples` in the file
- [ ] Report rows: mark one recipe `reviewed: false` → it reappears in `report:unlisted` → live instructions plus the `reviewed` filter
- [ ] Fixes: Americano's added line has the next `sort_order` after Orange Peel → `recipes[sourceId].addIngredients`

## Acceptance-criteria coverage
- AC-1 search and sitemap steps · AC-2 web and mobile redirect steps, SQL check · AC-3 Orgasm steps · AC-4 double import snapshot, SQL check · AC-5 SQL check · AC-6 glass steps · AC-7 ingredient and admin steps · AC-8 report command · AC-9 Americano step, report rerun · AC-10 button and search steps, SQL check · AC-11 matching step, SQL check · AC-12 dry run and bogus entry steps · AC-13 house and admin search steps, SQL check
