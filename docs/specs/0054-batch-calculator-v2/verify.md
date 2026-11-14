# Verify: Batch calculator v2 · spec 0054 · updated 2026-11-14

_Steps derived from spec 0054 acceptance criteria. `/check verify` runs these; `/test` locks the durable ones._

## Milestone 1: counted lines (AC-1, AC-3, AC-4, AC-7)

### Before the live reparse (rollout prerequisites)

- [ ] Apply `supabase/migrations/20261114120000_batch_counted_units.sql` in the dashboard SQL editor → it runs without the "amount_max_value that is not above" exception → AC-3
- [ ] Confirm the checks are live: `select conname, pg_get_constraintdef(oid) from pg_constraint where conname in ('recipe_ingredients_amount_unit_check', 'recipe_ingredients_amount_max_check');` → the unit check lists `dash`, `splash`, `drop`, `each`, and the max check exists → AC-3
- [ ] Try a bad max in a rolled back transaction: `begin; update recipe_ingredients set amount_max_value = amount_value where amount_value is not null and ctid = (select ctid from recipe_ingredients where amount_value is not null limit 1); rollback;` → rejected by `recipe_ingredients_amount_max_check` → AC-3
- [ ] Fix the catalog rows the dry run flagged before the live run (engineer's choice, 2026-11-14). Overrides can't rewrite a measure today, so use the admin form or extend `catalogOverrides.json`:
  - Layered shares on non alcohol lines, which would store as `each`: Bubble Gum (14730) `1/4` Orange Juice, Fuzzy Asshole (15743) `1/2` Coffee, Moranguito (16196) `1/5` Grenadine. None of these recipes shows a batch control (every line is `each`), so nothing wrong renders; the fix is data hygiene.
  - Split errors: `2` + "–3 Dashes Worcestershire Sauce", `3` + "–4 Drops Angostura Bitters", `3` + "–4 Fresh Raspberries", `¼` + "–½ Oz Chocolate Syrup (to Taste)", `3` + "Olives Or 1 Slice Cooked Bacon" (spec 0054 Follow-up).
- [ ] Review the full `each` list from `pnpm --filter @bartendingapp/shared reparse-measures --dry-run` (157 rows on 2026-11-14) → no other split errors → AC-3

### Commands

- [ ] `pnpm --filter @bartendingapp/shared reparse-measures --dry-run` → prints per unit counts including `dash`, `splash`, `drop`, `each`, and lists every row that would become `each` with its measure and ingredient name → AC-3
- [ ] `pnpm --filter @bartendingapp/shared reparse-measures` (live, after the web deploy) → `Rows failed` absent, exits 0 → AC-3
- [ ] Run the live reparse again → `Rows to change: 0` → AC-3
- [ ] `pnpm vitest run packages/shared/src/units.test.ts packages/shared/src/batch.test.ts packages/shared/src/reparseMeasures.test.ts` → all pass (parser table, counted batching, visibility) → AC-1, AC-4, AC-7

### UI / manual (web and mobile)

- [ ] Open a recipe with `2 dashes` bitters plus a spirit, batch 25 servings in oz → bitters line reads `50 dashes (≈ 1 oz)`; total includes about 30.8 ml from the bitters → AC-4
- [ ] Same recipe at 1 serving → `2 dashes`, no `≈` → AC-4
- [ ] Same recipe at 20% dilution → water grows by 20% of the bitters volume too → AC-4
- [ ] A recipe with drops (e.g. `3 drops`) × 10 → `30 drops`, total unchanged by the drops → AC-4
- [ ] A recipe with `1/2` Lime × 25 → `12.5`, no unit word → AC-4
- [ ] A recipe with an `each` line on a spirit or liqueur → line shows its `measure` text, flagged not scaled, and has no Custom checkbox → AC-4
- [ ] Custom scope on a recipe with a dash line → the dash line has a checkbox; unchecking it removes the line and its volume from the total → AC-4
- [ ] Except citrus on a recipe with `1` Lime → the lime line is hidden → AC-4
- [ ] Bubble Gum, Moranguito, or a B-52 style shooter (only `each` lines) → no batch control → AC-7
- [ ] A recipe whose only parsed line is a dash plus unparsed lines → batch control shows → AC-7
- [ ] Switch to Russian and Japanese → `2 дэша`, `5 дэшей`, `21 дэш`; `50 ダッシュ` → AC-4 (copy, AC-13 for all locales)
- [ ] Toggle oz/ml/cl on a dash recipe → the dash line keeps its `measure` text → AC-6 (counted part)
- [ ] Quick Build parts view on a parts recipe with a dash line → still shows parts; the dash line shows its measure text → AC-6 (counted part)

### Value sourcing checks

- [ ] Parse a measure: vary case and plural (`2 Dashes`, `1 dash.`, `3 Drops`) → same unit → AC-1
- [ ] Store a parsed measure: after the live reparse, `select amount_value, amount_unit from recipe_ingredients where measure ilike '%dash%' limit 5;` → `dash` rows with counts → AC-3
- [ ] Dash and splash volume: 8 dashes in ml → `≈` absent (4.9 ml); 12 dashes → `≈ 7.4 ml` → AC-4
- [ ] Counted line count shown: `1/2 dash` × 3 → `2 dashes`, while its volume is 1.5 dashes (check the total) → AC-4
- [ ] Volume hint threshold: exactly 1 splash × 1 → `1 splash (≈ 7.4 ml)` → AC-4
- [ ] Shooter share check: change an `each` line's ingredient category from `spirit` to `other` → it scales as a count → AC-4

## Milestone 2: ranges (AC-2, AC-3, AC-5, AC-6)

### Before the live reparse

- [ ] Apply `supabase/migrations/20261114130000_batch_ranges.sql` in the dashboard SQL editor → runs cleanly; `import_catalog`, `import_custom_recipes`, `admin_upsert_recipe`, and `fetch_recipe_detail` are replaced in place (same signatures, grants kept) → AC-3
- [ ] Confirm the writers store the max: `select proname from pg_proc where proname in ('import_catalog','import_custom_recipes','admin_upsert_recipe') and prosrc like '%amount_max_value%';` → three rows → AC-3
- [ ] Confirm the reader returns it: `select prosrc like '%''amount_max_value''%' from pg_proc where proname = 'fetch_recipe_detail';` → true → AC-3

### Commands

- [ ] `pnpm --filter @bartendingapp/shared reparse-measures --dry-run` → `After: ... 22 ranges` (2026-11-14: 1601 parsed lines, 259 rows to change), and range rows print as `"2-3 oz" -> 2-3 oz` → AC-3
- [ ] Live reparse (after the web deploy), then once more → `Rows to change: 0`, so `2` equals `2.0` and null equals null on all three columns → AC-3
- [ ] `pnpm vitest run packages/shared/src/units.test.ts packages/shared/src/batch.test.ts packages/shared/src/parts.test.ts packages/shared/src/reparseMeasures.test.ts` → all pass → AC-2, AC-5, AC-6

### UI / manual (web and mobile)

- [ ] A recipe with `2-3 oz` gin plus `1 oz` lime × 10, oz, 20% dilution → gin `20–30 oz`, water `6–8 oz`, total `36–48 oz` → AC-5
- [ ] The same recipe with no range line (edit a copy, or another recipe) → single values, exactly as before → AC-5
- [ ] A `2-3 dashes` line × 25 → `50–75 dashes (≈ 1–1.6 oz)`; in Russian the word follows 75 → AC-5, AC-13
- [ ] A range whose ends round alike in l (small amounts × 1 in l) → one value → AC-5
- [ ] Alcohol only on a recipe with a citrus range → the range line is hidden and the total drops it → AC-5
- [ ] Toggle a `2-3 cl` recipe to ml → `20–30 ml`; to oz on a `2-3 oz` recipe → the `measure` text → AC-6
- [ ] Quick Build on a range recipe → the range line shows its `measure` text in oz, ml, cl, and parts, and the other lines' parts ignore it → AC-6
- [ ] Admin form: save a recipe with a `2-3 oz` line → `select amount_value, amount_max_value, amount_unit from recipe_ingredients where measure = '2-3 oz' limit 5;` shows `2, 3, oz` → AC-3

## Acceptance-criteria coverage (milestone 2)

- AC-2: parser range table and negatives in `units.test.ts`
- AC-3: migration checks, reparse range count and rerun, admin save check (`amount_max_value` from every writer)
- AC-5: `computeBatch ranges`, `formatBatchRange`, and `batch counts` tests, UI steps
- AC-6: `formatAmountOrRangeInUnit` and `computeParts ranges` tests, toggle and Quick Build steps

## Acceptance-criteria coverage (milestone 1)

- AC-1: parser unit tests, value sourcing parse step
- AC-3: migration and constraint checks, reparse dry run, live run, and rerun (unit part only; `amount_max_value` writes come with ranges)
- AC-4: UI steps, value sourcing steps, `batch.test.ts`
- AC-7: shooter and dash only visibility steps, `hasScalableIngredient` tests
- AC-2, AC-5, AC-6 (ranges), AC-8 to AC-13: later milestones
