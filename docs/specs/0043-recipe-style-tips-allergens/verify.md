# Verify: Recipe drink style, tips, and allergens · spec 0043 · updated 2026-10-29
_Steps derived from spec 0043 acceptance criteria. `/check verify` runs these; `/test` locks the durable ones._

Seeded fixture (live, real values): Clover Club `b926e79c-1907-417f-b75f-d2a5158c0a29` has family `sour` plus all three EN notes; Egg white = `{egg}`, Gin = `{}`, Grenadine and Lemon not reviewed.

## UI / manual
- [ ] Web `/en/recipes/clover-club-b926e79c-…` → Drink style shows "Sour" and the sentence; Bartender tip and Presentation tip show their text → AC-1, AC-2, AC-3
- [ ] Same page → order is Instructions, Drink style, Bartender tip, Presentation tip, Allergen information, then recommendations and comments → AC-4
- [ ] Web `/es/recipes/…` → headings and the "Sour" label come from `es.json`; the three texts show English (no `es` translation row yet) → AC-5
- [ ] After translate-catalog and apply-recipe-notes, `/es/` shows the Spanish texts; a recipe with no `es` row still shows English → AC-5
- [ ] Clover Club allergens → "Egg (Egg white)", the incomplete line, and the disclaimer; no "none" line → AC-6
- [ ] A recipe whose ingredients are all reviewed with `{}` → "None of the common allergens…" plus the disclaimer → AC-6
- [ ] A recipe with two ingredients sharing an allergen (e.g. vermouth and champagne) → one entry listing both, in recipe order → AC-6
- [ ] Set a recipe's family to `other` with no sentence → Drink style section hidden; with a sentence → only the sentence shows → AC-1
- [ ] Mobile: open the Clover Club in both locales → same sections, order, and text as web; "Instructions"/"Preparación" heading from i18n → AC-1 to AC-6
- [ ] Admin `/admin/recipes/<id>/edit` → family select (with None), three textareas with a live n/240 counter; the hint "N ingredients have no allergen review yet" links to `/admin/ingredients` → AC-10
- [ ] Admin form: type 241 characters in a tip and save → inline error, nothing saved; style sentence with family None → "Choose a drink style…" error → AC-10
- [ ] Admin form: edit only the EN bartender tip and save → that recipe's `recipe_translations.bartender_tip` is null, the other two ES fields unchanged; `/es/` shows the new English tip → AC-10, AC-5
- [ ] `/admin/ingredients` (link in the admin nav) → search by name, "Not reviewed only" filter, pages of 50, "Not reviewed" badge on null rows → AC-11
- [ ] On a row: check "None" → every allergen box clears; check an allergen → "None" turns off; Save disabled until one is on; Save → "Saved", the row stays in view under the filter → AC-11
- [ ] After saving an ingredient, reload a recipe that uses it → the allergen section reflects the change → AC-11
- [ ] Sign in as a non admin and visit `/admin/ingredients` → redirected home → AC-11

## Commands
- [ ] `pnpm --filter @bartendingapp/shared propose-ingredient-allergens` → writes `scripts/tagging/ingredient-allergens-proposals.json` sorted by name with a reason per flag; DB unchanged; a second run without `--force` refuses → AC-9
- [ ] `pnpm --filter @bartendingapp/shared apply-ingredient-allergens` → writes only `{id, allergens}`; an empty list stores `{}`; editing one row to `"almond"` makes the whole run fail with no writes → AC-9
- [ ] `pnpm --filter @bartendingapp/shared propose-recipe-notes` → only recipes missing an EN value; `--all` prints the overwrite warning; existing file refused without `--force` → AC-7
- [ ] `pnpm --filter @bartendingapp/shared apply-recipe-notes` → all or nothing; a 241 character or whitespace only text rejects the file before any write; prints the ids whose ES was skipped → AC-8
- [ ] SQL editor as service role: `select apply_recipe_notes('[{"id":"<deleted recipe id>", …}]')` → error `22023`, no row changed → AC-8, AC-12
- [ ] SQL: `update ingredients set allergens = '{egg,null}'` / `'{almond}'`; `update recipes set bartender_tip = '  '` / a 241 char tip / `drink_style = 'martini'` / a sentence with `drink_style = null` → each rejected by a check constraint → AC-12
- [ ] As an authenticated non admin: `rpc('admin_set_recipe_notes', …)` and `rpc('admin_set_ingredient_allergens', …)` → "not authorized"; `rpc('apply_recipe_notes', …)` → permission denied → AC-8 to AC-11
- [ ] No clobber: run `import_catalog` (or `admin_upsert_recipe` on the Clover Club) → its notes and its ingredients' `allergens` unchanged → AC-6, AC-10

## Value sourcing
- [ ] Family label → `recipes.drink_style` → `recipe.drinkStyles.<value>`: change the family in admin, the label changes in both locales
- [ ] Style sentence and tips → `coalesce(rt.<col>, r.<col>)` by `p_locale`: with an `es` row holding Spanish, `/es/` shows Spanish and `/en/` English; null the ES field, `/es/` falls back to English
- [ ] Allergen entries and status → `summarizeRecipeAllergens` over `ingredients[].allergens` and the localized names: in `es`, entries use translated ingredient names once `ingredient_translations` exist
- [ ] Allergen labels, none line, incomplete line, disclaimer → i18n files: all four switch with the locale
- [ ] Propose inputs → `recipes`, `recipe_ingredients`, `ingredients` via the service role: the review file names match the DB names
- [ ] Which rows propose includes → any EN value null / `allergens is null`; `--all` overrides: fill one recipe fully, rerun propose, it is left out
- [ ] Apply targets → each proposal's `id`: an id not in the file is untouched
- [ ] Which ES fields admin clears → `is distinct from` against the stored EN: saving an unchanged form clears nothing
- [ ] Admin ingredients rows → `ingredients` table + search + filter + page: a name with `%` or `_` searches literally

## Acceptance-criteria coverage
- AC-1: UI 1, 4, 9 · AC-2: UI 1 · AC-3: UI 1 · AC-4: UI 2, 9 · AC-5: UI 3, 4, 12 · AC-6: UI 5 to 7, 9; Commands 8 · AC-7: Commands 3 · AC-8: Commands 4, 5, 7 · AC-9: Commands 1, 2 · AC-10: UI 10 to 12; Commands 8 · AC-11: UI 13 to 16; Commands 7 · AC-12: Commands 5, 6
- Unit tests already lock: `summarizeRecipeAllergens`, `drinkStyleDisplay`, both proposal validators, the admin form validation, the `notes_failed` chained save, and the admin row toggles.
