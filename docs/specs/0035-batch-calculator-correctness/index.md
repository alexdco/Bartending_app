# 0035. Batch calculator correctness

**Date**: 2026-10-11
**Status**: In Progress
**Amends**: [0022](../0022-batch-cocktail-conversion/index.md) (AC-1 visibility, AC-2 units and rounding, AC-6 dilution base) · [0021](../0021-recipe-ingredient-unit-conversion/index.md) (parsing rules, recognized units, toggle visibility)

## Summary

The batch calculator gives wrong or missing answers today: dilution only counts the alcohol, half of all ingredient lines never parse (shots, parts, `Tblsp`, liters), tiny amounts show as `0 l`, and the batch units don't match the recipe toggle. This spec fixes all of that in place. The parser learns the common TheCocktailDB units and stores each under its own unit name (a shot stays a shot), recipes written in parts get a "1 part = ..." size input, dilution is based on the whole batch, and every existing row is reparsed once by a script. It also fixes a bug found during design: saving a recipe in admin wipes its parsed amounts.

## Requirements

**User stories**:
- As a bartender batching a recipe written in shots or parts, I want real volumes for every line, so I don't have to convert by hand.
- As a bartender adding dilution, I want the water to match what ice would add to the whole drink, so the batch tastes like one made to order.
- As a bartender reading in metric, I want the batch to start in the unit I'm already reading, and never show a tiny amount as zero.
- As an admin editing a recipe, I want my save to keep the recipe's batch and unit tools working.

**Acceptance criteria** (the contract, each criterion is IDed and independently checkable):

- **AC-1**: The shared parser (`parseMeasure`) reads a leading number followed by a unit token, where the unit is the first word after the number (or the two words `fl oz`), case insensitive, and any further words are ignored. Recognized number forms add `1 ½` (whole number, space, unicode fraction glyph) to the forms from spec 0021. Recognized unit spellings add: `shot`/`shots`, `jigger`/`jiggers`, `part`/`parts`, `dl`/`deciliter(s)`/`decilitre(s)`, `l`/`liter(s)`/`litre(s)`, `tblsp` (as `tbsp`), `pint`/`pints`, `qt`/`quart`/`quarts`, `gal`/`gallon`/`gallons`. The unit must match a whole token: `1 lime` does not parse as liters. Any unit token may carry one trailing dot (`Tblsp.`, `oz.`), and `fl. oz` reads like `fl oz`. A line stays unparsed when the text after the unit starts with `-`, `to`, `or`, or `/` followed by a number (`1 oz to 2 oz`, `1 oz - 2 oz`, `1 oz or 2 shots`), so ranges written with the unit twice stay ranges (AC-11). Examples that must parse: `1 shot`, `2 Jiggers`, `3 parts`, `1/2 part`, `1 dl`, `1 L`, `1 Tblsp`, `1 Tblsp.`, `1 fl. oz`, `1 pint`, `1 ½ oz`, `1 oz Bacardi`, `1 tsp superfine`, `2 cups cold`. `measure` itself is never modified.
- **AC-2**: Volume constants: `shot` = 1.5 oz and `jigger` = 1.5 oz (both 44.36025 ml, from 29.5735 ml per oz), `dl` = 100 ml, `l` = 1000 ml, `pint` = 473.176 ml, `qt` = 946.353 ml, `gal` = 3785.41 ml (US). The constants live only in code (`toMl`), never in stored data. In the single serving toggle, every volume line whose source unit is not `oz` (`shot`, `jigger`, `dl`, `l`, `pint`, `qt`, `gal`, and the existing `tsp`/`tbsp`/`cup`/`ml`/`cl`) renders in oz through `formatOunces` (`1 shot` shows `1 1/2 oz`); only an `oz` sourced line keeps its `measure` text, per spec 0021. Every text fallback in this spec (part lines, unscaled lines) shows the same coalesced, possibly translated `measure` the page shows today.
- **AC-3**: A recipe with at least one `part` line shows a "1 part = [value] [unit]" input in the batch panel. Each included part line's batched amount is `amount_value × part size in ml × servings`. The input's unit follows the batch unit family: `oz` when the batch unit is oz, `ml` when it is ml, cl, or l. Default is `1` oz or `30` ml. Allowed range is 0.25 to 4 oz or 5 to 120 ml, whole or decimal; an empty, non numeric, or out of range value shows an inline error and no batch is computed until it is corrected (the same handling as servings). Switching family converts a valid current value instead of resetting it: oz to ml rounds to the nearest whole ml, ml to oz rounds to the nearest 0.25 oz, then clamps into the new family's range (switching back and forth may drift slightly; that is accepted, not a bug). If the current value is invalid when the family switches, it resets to the new family's default. The part size resets to its default whenever a different recipe opens and is never saved. Part lines follow the scope presets (by their ingredient's `category`) and Custom selection exactly like volume lines.
- **AC-4**: The batch control shows when at least one line has a parsed amount (a volume unit or `part`). The single serving oz/ml/cl toggle shows only when at least one line has a volume unit. A `part` line in the toggle view always shows its original `measure` text. A recipe whose lines are all parts (e.g. Afterglow) shows the batch control and no toggle.
- **AC-5**: Dilution water equals the chosen percentage of the sum, in unrounded ml, of every included scaled line (volume and part lines alike, after scope and Custom selection filtering, before water). Category no longer affects dilution directly; it still decides which lines a scope preset includes, so under Alcohol only the base is only the included alcohol lines. When a dilution level other than None is chosen and that sum is zero (e.g. Custom selection with every line unchecked), no water line is computed and the note reads "nothing to dilute in this batch". Presets stay None, 15%, 20%, 25%, Custom 0 to 50; default stays None. This replaces spec 0022 AC-6.
- **AC-6**: Batch units are `oz`, `ml`, `cl`, `l`, labeled exactly that way in the picker and in the amounts (English and Spanish). The single serving toggle stays `oz`, `ml`, `cl`. On opening a recipe, the batch unit follows whatever the toggle shows until the bartender picks a batch unit; from then on the two are independent until a different recipe is opened. Rounding, once at display from unrounded ml: oz, ml, and cl to the nearest tenth; l to the nearest thousandth. Trailing zeros are trimmed (`2.5 l`, not `2.500 l`). This replaces the units and rounding parts of spec 0022 AC-2.
- **AC-7**: A nonzero amount (a line, the water line, or the total) that rounds to zero in the chosen unit shows as `< 0.1 oz`, `< 0.1 ml`, `< 0.1 cl`, or `< 0.001 l`. No batch amount ever displays as `0`.
- **AC-8**: Saving a recipe through admin (`admin_upsert_recipe`) writes `amount_value` and `amount_unit` for each ingredient, parsed from its `measure` with the same shared parser before the call. A line that does not parse is saved with both null. Re-saving an unchanged recipe leaves its parsed amounts identical.
- **AC-9**: A one time script (`pnpm reparse-measures`) rereads the `measure` of every `recipe_ingredients` row, whatever its source (catalog, custom, admin), runs the shared parser, and updates `amount_value`/`amount_unit` only where the result differs. It reads rows in pages of 1,000, sets both columns to null for a row whose `measure` is null or empty, and supports `--dry-run`, prints counts before and after (parsed lines, lines per unit, rows changed), and running it again changes zero rows. After the live run, Afterglow shows a batch panel and the lines in the AC-1 examples are parsed in the live data.
- **AC-10**: Quick Build Mode's parts view: when every parsed line of a recipe is a `part` line, it shows each line's stored part count directly (formatted to at most two decimals, trailing zeros trimmed, no quarter rounding). When a recipe mixes part lines with volume lines, part lines show their `measure` text and are left out before the smallest ml amount is found, and volume lines keep the existing ratio rule. In Quick Build's oz and ml views, part lines show their `measure` text.
- **AC-11**: Ranges (`2-3 oz`, `1 to 2 oz`, `1 oz to 2 oz`, `1 oz - 2 oz`), counted lines (dashes, drops, slices, bare numbers like `1`), and text only measures (`Juice of 1/2`, `top up with`) stay unparsed and keep spec 0022's unscaled behavior: shown with their text and the "not scaled, adjust manually" flag, never counted in the total or the dilution base.
- **AC-12**: Clients treat any stored `amount_unit` they don't recognize as unparsed (shown as `measure` text, unscaled), never as a number. A future unit added to the database can't produce `NaN` or a crash in an older client.
- **AC-13**: Every new piece of user facing copy (the part size label and its error, the "nothing to dilute" note) comes from the web message catalog with English and Spanish entries, following the feature 41 pattern. Mobile uses the same copy approach its batch panel uses today.

## Decision

**Chosen option**: Option 1: fix in place. Store the source unit as written (widened check constraint), teach the shared parser the missing forms, change the batch math (part size, dilution base, units, tiny amount floor), make admin saves parse, and reparse every existing row once with a script.

**Implementation skills**: `supabase-postgres-best-practices` (`supabase/agent-skills`, `.agents/skills/supabase-postgres-best-practices/`) · `vitest` (`antfu/skills`, `.agents/skills/vitest/`)

Decisions made during design without a separate question (pick, why, runner up):
- **Parse unit as the first token, two words only for `fl oz`.** Whole token matching is what stops `1 lime` becoming liters. Runner up: a regex over the whole remainder, rejected because trailing words like `light or dark` would need their own rules.
- **Bar recipes keep the original six units.** The bar form gets its own explicit `BAR_FORM_UNITS` list, so `bar_recipe_ingredients` and its check constraint are untouched. Runner up: widen both tables, rejected because the form picker would grow eight options nobody asked for.
- **Part size rounding on family switch: whole ml, quarter oz.** These are the steps a bartender can actually pour. Runner up: exact conversion (`29.6 ml`), rejected as noise.
- **Batch unit follow rule lives in the recipe page.** The toggle unit is lifted from `ingredient-list` to the recipe detail page so both the toggle and the batch panel read it. Runner up: a shared context, rejected as more machinery than one prop.
- **Reparse runs over `recipe_ingredients` only.** Bar recipe rows come from a unit picker, not free text, so there's nothing to reparse there.

## Feature design

**Data model sketch**:

`recipe_ingredients` (existing table, one constraint change, no new columns):

| Column | Type | Nullable | Change |
|---|---|---|---|
| `measure` | text | yes | None. Still the display fallback and the parser input. |
| `amount_value` | numeric | yes | None. For a `part` line it holds the part count (`3` for `3 parts`). |
| `amount_unit` | text | yes | Check widened from `oz, ml, cl, tsp, tbsp, cup` to also allow `shot, jigger, dl, l, pint, qt, gal, part`. |
| `amount_max_value` | numeric | yes | None. Still always null (ranges stay unparsed, AC-11). |

New table check on `recipe_ingredients`: `recipe_ingredients_amount_pair_check`, `check ((amount_value is null) = (amount_unit is null))`, in the same migration as the widened unit check. The migration first confirms no existing row breaks it (a `select count(*)` that must be 0), so the constraint never fails on apply.

`bar_recipe_ingredients`: no change.

Function `admin_upsert_recipe`: each ingredient in the JSON payload gains `amount_value` and `amount_unit`, and the function writes them in its `recipe_ingredients` insert (today it writes only `recipe_id, ingredient_id, measure, sort_order`).

**Shared types** (`packages/shared/src/units.ts`):
- `VOLUME_UNITS`: `oz, ml, cl, tsp, tbsp, cup, shot, jigger, dl, l, pint, qt, gal`. `VolumeUnit` is that union.
- `RECOGNIZED_UNITS` = `VOLUME_UNITS` plus `part`. `RecognizedUnit = VolumeUnit | "part"`.
- `toMl` and `convertAmount` accept only `VolumeUnit`, so passing a part is a type error.
- `BAR_FORM_UNITS`: the original six (`oz, ml, cl, tsp, tbsp, cup`), with `BarFormUnit` as its union. The bar recipe form picker iterates it and its default `"oz"` is typed as `BarFormUnit`. Bar mappers in `bar.ts` narrow stored bar units to `BarFormUnit` (unknown gives null), so bar data can never carry `part`.
- `toRecognizedUnit(raw: string | null): RecognizedUnit | null`: the runtime guard every client mapping uses when reading `amount_unit` from the database (AC-12). Unknown means null, and the line then counts as unparsed.

**Batch types** (`packages/shared/src/batch.ts`):
- `BATCH_UNITS` = `oz, ml, cl, l` (the old `liter` value becomes `l`).
- `BatchOptions` gains `partSize: { value: number; unit: "oz" | "ml" } | null` (null when the recipe has no part line).
- `computeBatch` dilution base = sum of every included scaled line's ml. `noAlcoholNote` is renamed `nothingToDiluteNote`.
- `validatePartSize(raw, unit)` mirrors `validateServings`.
- `convertPartSize(value, fromUnit, toUnit)` applies the AC-3 rounding and clamping.

**State transitions**: none.

**API surface**:

| Endpoint | Method | Key inputs | Key outputs | Auth | Key errors |
|---|---|---|---|---|---|
| `fetch_recipe_detail` (existing RPC) | RPC read | unchanged | unchanged; `amount_unit` may now hold the new values | public (unchanged) | none new |
| `admin_upsert_recipe` (existing RPC, changed) | RPC write | each ingredient adds `amount_value` (numeric, null), `amount_unit` (text, null) | unchanged | admin only (unchanged) | check constraint violation if a client sends an unknown unit |
| `reparse-measures` (new script, `packages/shared/scripts/reparse-measures.ts`) | CLI | `--dry-run` (optional) | counts before/after, rows changed | service role key, run by the engineer locally | exits non zero on any failed update, after printing what it did change |

**Value sourcing**:

| Action | Value produced / displayed | Source |
|---|---|---|
| Parse a measure (import, admin save, reparse) | `amount_value`, `amount_unit` | `parseMeasure(measure)` in `packages/shared/src/units.ts`, rules in AC-1 |
| Convert a shot, jigger, dl, l, pint, qt, gal | ml value | `toMl` constants, AC-2 |
| Admin save | per ingredient `amount_value`/`amount_unit` | parsed in `packages/shared/src/adminRecipes.ts` from the trimmed `measure` before calling `admin_upsert_recipe` |
| Show batch control | yes or no | any line where `toRecognizedUnit(amount_unit)` is non null and `amount_value` is non null |
| Show single serving toggle | yes or no | any line whose recognized unit is a `VolumeUnit` |
| Show part size input | yes or no | the recipe has at least one line with unit `part` |
| Part size unit | `oz` or `ml` | derived from the current batch unit (oz gives oz; ml, cl, l give ml) |
| Part size value | number | bartender input, default 1 oz or 30 ml, validated per AC-3; converted on family switch by `convertPartSize` |
| Part line batched ml | number | `amount_value × (part size in ml) × servings`; part size in ml = value × 29.5735 for oz, value for ml |
| Volume line batched ml | number | `toMl(amount_value × servings, amount_unit)` |
| Dilution base | ml | sum of every included scaled line's unrounded ml, before water (AC-5) |
| Water line | ml | dilution base × percent / 100 |
| Batch unit, initial | `oz`, `ml`, or `cl` | the toggle's current unit, held in recipe detail page state; overridden once the bartender picks a batch unit; reset when a different recipe opens |
| Displayed amount | string | `formatBatchAmount(ml, unit)`: tenth for oz/ml/cl, thousandth for l, trailing zeros trimmed, `<` floor per AC-7 |
| Unit label | `oz`/`ml`/`cl`/`l` | `BATCH_UNIT_LABELS`, same text in English and Spanish |
| Quick Build parts view value | number | parts only recipe: stored `amount_value`; mixed: existing smallest ml ratio for volume lines, `measure` text for part lines (AC-10) |
| Reparse counts | numbers | computed by the script from the rows it reads and the updates it makes |

**Line state matrix** (replaces spec 0022's; every line is in exactly one state):

| State | Rendered? | Scaled? | In total? | In dilution base? |
|---|---|---|---|---|
| Normal volume line (included) | yes | yes, by servings | yes | yes |
| Normal part line (included) | yes | yes, by part size and servings | yes | yes |
| Uncategorized (null category, under Alcohol only / Except citrus) | yes, flagged | yes | yes | yes |
| Unscaled (unparsed, range, count, unknown unit) | yes, flagged, `measure` text | no | no | no |
| Excluded by scope or Custom selection | no | no | no | no |

**Key invariants**:
- `amount_value` and `amount_unit` are both null or both set, on every write path (import, custom import, admin save, reparse), enforced by `recipe_ingredients_amount_pair_check`.
- Unit sizes (shot, jigger, US pint, quart, gallon) exist only in code. Changing one never needs a data migration.
- A `part` never reaches `toMl`; the type system enforces it.
- Every batch value is carried in unrounded ml and rounded once at display. The total is never a sum of displayed values.
- No batch amount displays as `0`.
- `measure` is never rewritten by any parser path.
- Clients never trust `amount_unit` blindly: unknown values degrade to unparsed.

**Security model**: no change. `recipe_ingredients` stays public read with writes only by the service role or the admin gated `admin_upsert_recipe`. The reparse script uses the service role key locally and is run by the engineer.

**Configuration required**: no new environment variable. The reparse script needs `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` locally, the same as the existing `classify-ingredients` script.

**Critical test scenarios**:
- Parser table test: every AC-1 example parses to the expected value and unit; `1 lime`, `2-3 oz`, `1 to 2 oz`, `1 oz to 2 oz`, `1 oz - 2 oz`, `1 oz or 2 shots`, `2 dashes`, `1`, `Juice of 1/2` stay null, verifies **AC-1**, **AC-11**.
- `1 shot` toggled to oz shows `1 1/2 oz`, to ml shows `44.4 ml`; `1 L` batched ×1 in l shows `1 l`, verifies **AC-2**.
- Afterglow style recipe (`4 parts`, `1 part`, `1 part`), 10 servings, oz batch, default part size: lines read `40 oz`, `10 oz`, `10 oz`; switching the batch to ml turns the part size into `30 ml`; a part size of `5 oz` shows an inline error and no batch, verifies **AC-3**.
- Afterglow shows the batch control and no toggle; a mixed recipe shows both, with its part line as text in the toggle, verifies **AC-4**.
- Dilution 20% on a batch of 60 oz spirit plus 30 oz lime shows an 18 oz water line; the same batch with Alcohol only scope gives 12 oz; Custom with every line unchecked shows the "nothing to dilute" note, verifies **AC-5**.
- Toggle set to ml, open the batch: it starts in ml; pick l in the batch, then change the toggle to oz: the batch stays l; open another recipe: the batch follows the toggle again, verifies **AC-6**.
- `1/8 tsp` × 1 serving in l shows `0.001 l`; a 0.2 ml line in l shows `< 0.001 l`; the total is never `0`, verifies **AC-7**.
- Admin save of a recipe with `1 1/2 oz` and `2 dashes` stores `1.5`/`oz` and null/null; saving again changes nothing, verifies **AC-8**.
- Reparse dry run reports changes without writing; the real run updates rows; a second run reports 0 changed, verifies **AC-9**.
- Quick Build: a parts only recipe (`4 parts`, `1 part`, `1 part`) shows `4`, `1`, `1` in the parts view; a recipe with `1/3 part` shows `0.33`, verifies **AC-10**.
- A row with `amount_unit = 'firkin'` (simulated in a unit test of the mapping) renders as unscaled text with no `NaN`, verifies **AC-12**.
- Spanish recipe page with a part line shows the part size label and error in Spanish, verifies **AC-13**.

## Build plan

Tracer Bullet: the first slice pushes one new unit (`shot`) through every layer, from parser to migration to live data to the batch panel, before the other rules thicken it.

1. [ ] **Thread: shot, end to end.** Migration widening `recipe_ingredients_amount_unit_check` to the full target list (all new units at once, since the constraint is the target). Split the shared unit types (`VolumeUnit`, `RecognizedUnit`, `BAR_FORM_UNITS`, `toRecognizedUnit`), switch the bar form picker to `BAR_FORM_UNITS`, and route every client mapping of `amount_unit` through `toRecognizedUnit` (or the bar narrowing). Known cast sites to replace: `packages/shared/src/bar.ts` (lines 629 and 666, `as RecognizedUnit | null`), `packages/shared/src/recipes.ts:123`, `apps/web/src/service/quick-build-page-client.tsx:215` and `apps/mobile/src/app/bartender-build/[kind]/[id].tsx:156` (both `as ConvertibleUnit`, already wrong for tsp, tbsp, and cup). Finish with a search confirming no `as RecognizedUnit` or `as ConvertibleUnit` casts remain. `packages/import-job/src/importCustomRecipes.ts` and `transform.ts` need only the widened type, no logic change. Add the `recipe_ingredients_amount_pair_check` constraint in the same migration. Parser learns the first token rule plus `shot`/`jigger`; `toMl` gets their constants. Write `reparse-measures.ts` with `--dry-run` and counts. Unit tests for all of it, satisfies **AC-1** (shot, jigger), **AC-2**, **AC-9**, **AC-12**.
2. [x] Remaining parser forms: `dl`, `l`, `tblsp`, `pint`, `qt`, `gal`, `1 ½`, unit followed by extra words, whole token matching; table tests including the negatives, satisfies **AC-1**, **AC-2**, **AC-11**.
3. [x] Parts: parser reads `part`/`parts`; `computeBatch` takes `partSize`; `validatePartSize` and `convertPartSize`; batch panel (web and mobile) shows the part size input with family following the batch unit; batch control and toggle visibility split per AC-4; toggle shows part lines as text, satisfies **AC-3**, **AC-4**.
4. [x] Dilution base on all included lines, note renamed to "nothing to dilute"; update the spec 0022 dilution tests, satisfies **AC-5**.
5. [x] Units and display: `BATCH_UNITS` becomes `oz, ml, cl, l`; liter rounding to the thousandth; `<` floor in `formatBatchAmount`; lift the toggle unit to the recipe detail page (web and mobile) so the batch unit follows it until picked, satisfies **AC-6**, **AC-7**.
6. [ ] Admin save: parse each measure in `adminRecipes.ts`; migration replacing `admin_upsert_recipe` to accept and write `amount_value`/`amount_unit`, satisfies **AC-8**.
7. [x] Quick Build parts view (web and mobile) per AC-10; oz and ml views show part lines as text, satisfies **AC-10**.
8. [x] Message catalog: new keys in `apps/web/messages/en.json` and `es.json` (and `messages.d.ts`); mobile copy alongside its existing batch strings, satisfies **AC-13**.
9. [ ] Live rollout, in this order: apply both migrations in the Supabase dashboard SQL editor; deploy web (and ship the mobile update) with the new client code; run `pnpm reparse-measures --dry-run`, then the real run with the real service role key set locally; run it once more to confirm 0 changes; check Afterglow and a shot recipe on the live site, satisfies **AC-9**.

## Migration plan

**Strategy**: fix in place, code before data.
**Phases**:
1. Apply the constraint migration and the `admin_upsert_recipe` migration. Safe on their own: widening a check never rejects existing rows, and the old admin client simply doesn't send the new fields (they stay null, as today).
2. Deploy web and ship the mobile build that understand the new units (with the `toRecognizedUnit` guard).
3. Run the reparse script. Only now do rows with `shot`, `part`, etc. exist.

The import job uses the same shared parser, so with the new code it writes new units just like the reparse does. The "code before data" rule covers it too: don't run the import job on the new code until phase 2 is done.

**Rollback**: the reparse is reversible by rerunning the previous parser version of the script (or setting the new unit rows back to null with one SQL update on `amount_unit in ('shot','jigger','dl','l','pint','qt','gal','part')`). The constraint can stay widened.
**Risks**: a mobile binary already installed from before step 2 has no `toRecognizedUnit` guard, and its `toMl` returns nothing for `shot`, which shows `NaN`. If any mobile build is in users' hands, ship the mobile update (store or over the air) before step 3. Web has no such risk once deployed.

## Consequences

**Positive**:
- Roughly 150 more lines parse (shots, parts, Tblsp, metric, US volumes, unit plus words), and the 25 parts only recipes gain a working batch.
- Dilution matches real batching practice, so batches stop coming out too strong.
- Admin saves stop silently breaking the unit toggle and batch panel.
- The unknown unit guard makes the next unit addition safe for old clients.

**Negative / tradeoffs**:
- The part size is a guess the bartender must set. A recipe meant for a 2 oz part reads small at the 1 oz default until they change it.
- "Unit then extra words" accepts some non liquids measured by volume (`1 cup ice`), which then count toward the total and dilution.
- Shot = 1.5 oz is a US convention. Recipes written with a 1 oz or 25 ml shot in mind batch slightly large.
- The batch panel grows a control (part size) and a fourth unit, on an already busy panel.
- Dashes, drops, and counted items still need manual adjusting.

**Neutral**:
- Spec 0022 AC-6's "alcohol only" dilution and its `noAlcoholNote` are retired; the ingredient `category` still drives the scope presets.
- Once phase 2 is out, any import job run also applies the new rules; the reparse script is what covers admin and custom rows, and what makes the change immediate.
- The scope row's "import job is rerun" wording is met by the reparse script, which covers every source.

## Follow-up

- [ ] Scale counted lines (`2 dashes` × 25 = `50 dashes`), kept unscaled here by choice.
- [ ] Batch ranges (`2-3 oz`) using `amount_max_value`, still unused.
- [ ] The catalog import job upserts `recipe_ingredients` and can overwrite admin edits made to a catalog recipe. This predates this spec; decide whether admin edits should win.
- [ ] Consider a method based dilution default (stirred, shaken, built) now that the base is the whole drink.
- [ ] Spec 0022 AC-1, AC-2, and AC-6, and spec 0021's parsing rules, now read as amended by this spec; `/sync` may want to flag them when this ships.

## Rationale

Reasoning and options: see [rationale.md](rationale.md).
