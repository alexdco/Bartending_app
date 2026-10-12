# Verify: Batch calculator correctness · spec 0035 · updated 2026-10-11
_Steps derived from spec 0035 acceptance criteria. `/check verify` runs these; `/test` locks the durable ones._

## Before you start
- [ ] Apply `supabase/migrations/20261011140000_batch_calculator_units.sql` and `20261011140100_admin_upsert_recipe_parsed_amounts.sql` in the dashboard SQL editor, deploy web (and ship mobile), then run the reparse (Commands below). Steps marked (live data) need the reparse done first.

## UI / manual
- [ ] Open a recipe with a `1 shot` line (live data), toggle oz → shows `1 1/2 oz`; toggle ml → `44.4 ml` → AC-2
- [ ] Open a recipe with an `oz` sourced line, toggle oz → the original measure text, unchanged → AC-2
- [ ] Open Afterglow (live data) → batch panel shows, no oz/ml/cl toggle, part lines show their measure text → AC-4
- [ ] Afterglow, 10 servings, oz batch, default part size → `40 oz`, `10 oz`, `10 oz`, total `60 oz` → AC-3
- [ ] Afterglow, switch batch unit to ml → part size input becomes `30` (ml); switch back to oz → `1` → AC-3
- [ ] Afterglow, part size `5` in oz → inline error, no batch shown; fix to `2` → batch returns → AC-3
- [ ] Afterglow, set part size to `abc`, switch to ml → resets to `30` → AC-3
- [ ] Open another recipe after changing the part size → part size back to default → AC-3
- [ ] A mixed recipe (volume plus part lines) → both toggle and batch control; part line shows text in the toggle view → AC-4
- [ ] 60 oz spirit + 30 oz lime recipe batched with 20% dilution → water `18 oz`; Alcohol only scope → `12 oz` → AC-5
- [ ] Custom selection, uncheck every line, 20% dilution → "Nothing to dilute in this batch.", no water line, no total row → AC-5
- [ ] A no alcohol recipe at 15% → a water line appears (dilution no longer needs alcohol) → AC-5
- [ ] Batch unit picker shows exactly `oz`, `ml`, `cl`, `l` in English and on `/es` → AC-6
- [ ] Set toggle to ml, then look at the batch → starts in ml; pick `l` in the batch, change toggle to oz → batch stays `l` → AC-6
- [ ] Open a different recipe → batch follows the toggle again (oz) → AC-6
- [ ] Batch a recipe in `l` → amounts round to the thousandth with zeros trimmed (`2.5 l`, not `2.500 l`) → AC-6
- [ ] A `1/8 tsp` line, 1 serving, in `l` → `0.001 l`; a tiny line that rounds to zero → `< 0.001 l`, never `0` → AC-7
- [ ] Admin: edit a recipe with `1 1/2 oz` and `2 dashes`, save → recipe page toggle and batch still work; DB row holds `1.5`/`oz` and null/null → AC-8
- [ ] Admin: save the same recipe again unchanged → amounts identical → AC-8
- [ ] Quick Build, parts view, a parts only recipe → shows `4`, `1`, `1`; a `1/3 part` line shows `0.33` → AC-10
- [ ] Quick Build, mixed recipe in parts view → part lines show text, volume ratios unchanged; oz and ml views show part lines as text → AC-10
- [ ] A recipe with `2 dashes` or `2-3 oz` → line shows text with "not scaled, adjust manually", excluded from total and dilution → AC-11
- [ ] `/es` recipe with a part line → "Tamaño de 1 parte (oz)" label and the Spanish error; the nothing to dilute note in Spanish → AC-13

## Commands
- [ ] `pnpm test` → all pass (parser table, batch, parts, admin payload, reparse planning) → AC-1, AC-2, AC-3, AC-5, AC-6, AC-7, AC-8, AC-10, AC-11, AC-12
- [ ] SQL: `select pg_get_constraintdef(oid) from pg_constraint where conname in ('recipe_ingredients_amount_unit_check','recipe_ingredients_amount_pair_check')` → widened list and pair check present → AC-9
- [ ] `SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... pnpm reparse-measures --dry-run` → before/after counts, rows to change, nothing written → AC-9
- [ ] Same without `--dry-run` → rows changed, exit 0 → AC-9
- [ ] Run it a third time → `Rows to change: 0` → AC-9
- [ ] SQL: `select measure, amount_value, amount_unit from recipe_ingredients where measure ilike any (array['%shot%','%part%','%tblsp%','% dl%','%½%'])` → parsed per AC-1 → AC-1, AC-9
- [ ] SQL: `select count(*) from recipe_ingredients where amount_unit not in ('oz','ml','cl','tsp','tbsp','cup','shot','jigger','dl','l','pint','qt','gal','part')` → 0 → AC-12

## Value sourcing checks
- [ ] Parse: `1 lime` stays unparsed while `1 L` reads liters (whole token rule) → parseMeasure
- [ ] Unit constants: shot and jigger both batch as 44.36 ml per unit → toMl
- [ ] Admin save: payload carries `amount_value`/`amount_unit` from the trimmed measure → adminRecipes.ts
- [ ] Show batch control / toggle / part size input each flip correctly between a parts only, a mixed, and a volume only recipe → AC-4 rules
- [ ] Part size unit follows batch unit family (oz → oz; ml, cl, l → ml) → partSizeUnitFor
- [ ] Part line ml = count × part size ml × servings; volume line ml = toMl(value × servings) → computeBatch
- [ ] Dilution base and water from unrounded ml; total is never a sum of displayed values → computeBatch
- [ ] Initial batch unit = toggle unit, overridden once picked, reset on a new recipe → RecipeMeasures
- [ ] Displayed amount and `<` floor, labels identical in en and es → formatBatchAmount, BATCH_UNIT_LABELS
- [ ] Quick Build parts value: stored count (parts only) vs smallest ml ratio (mixed) → computeParts
- [ ] Reparse counts match the rows read and the updates made → planReparse

## Acceptance-criteria coverage
- AC-1 parser table test, live SQL check · AC-2 toggle steps, toMl test · AC-3 Afterglow steps · AC-4 visibility steps · AC-5 dilution steps · AC-6 unit follow steps · AC-7 floor steps · AC-8 admin steps · AC-9 reparse commands · AC-10 Quick Build steps · AC-11 unscaled step · AC-12 guard test, unknown unit SQL · AC-13 `/es` step
