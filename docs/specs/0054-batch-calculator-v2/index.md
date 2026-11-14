# 0054. Batch calculator v2: counted lines, ranges, and method dilution

**Date**: 2026-11-14
**Status**: In Progress
**Amends**: [0035](../0035-batch-calculator-correctness/index.md) (AC-1 range rejection, AC-5 default dilution, AC-11 ranges and counted lines, the line state matrix) · [0023 Quick Build](../0023-bartender-mode/0023-quick-build-mode.md) (method line text)

## Summary

The batch calculator still leaves three gaps that spec 0035 named. Counted lines (`2 dashes`) don't scale. Ranges (`2-3 oz`) don't batch. And every drink starts at no dilution, whatever its method. This spec closes all three on the same tables and the same parser. Dashes and splashes scale as a count plus a volume you can measure. Drops and plain item counts (`1` Lime) scale as counts. Ranges batch as ranges all the way to the total. A recipe's method (filled once by the existing Haiku classifier, and editable by an admin) picks its starting dilution: 20% stirred, 25% shaken, none for built or blended.

## Requirements

**User stories**:
- As a bartender batching a drink with bitters, I want `2 dashes` × 25 to tell me how much to pour, so I don't count out 50 dashes.
- As a bartender batching a recipe written as a range, I want to see the batched range and the total it implies, so I choose the strength knowingly.
- As a bartender, I want a batch to start at the dilution its method needs, so a stirred batch tastes like one stirred to order, without my knowing the number.
- As a bartender prepping garnish, I want `1` Lime × 25 to read `25`, so the prep count is done for me.
- As an admin, I want to set a recipe's method and have it stick, so a classifier rerun never undoes my fix.

**Acceptance criteria** (the contract, each criterion is IDed and independently checkable):

- **AC-1**: The shared parser (`parseMeasure`) recognizes three counted units, as whole tokens, case insensitive, with one optional trailing dot, under the same first token rule as spec 0035 AC-1: `dash`/`dashes` as `dash`, `splash`/`splashes` as `splash`, `drop`/`drops` as `drop`. A measure that is only a number in any spec 0035 number form, with nothing after it once trimmed, parses as unit `each` (`1`, `1/2`, `6`, `1 ½`), provided the value is greater than 0. Any character after the number, punctuation included (`2.`, `1 (optional)`), leaves the line unparsed. A number followed by a word that is not a recognized unit stays unparsed, as today (`1 whole`, `2 Wheels`, `1 lime`). Examples that must parse: `1 dash` → 1 dash, `2 Dashes` → 2 dash, `1 splash` → 1 splash, `3 Drops` → 3 drop, `1/2` → 0.5 each, `6` → 6 each. Bar recipe units (`BAR_FORM_UNITS`) do not change.
- **AC-2**: The parser reads a range into `value` (low) and `maxValue` (high) for any recognized unit (volume, `part`, counted, `each`). Range forms: `A-B unit`, `A - B unit`, `A–B unit` (en dash), `A to B unit`, `A or B unit`, `A unit - B unit`, `A unit to B unit`, `A unit or B unit` where both units normalize to the same unit (`1 oz - 2 ounces` qualifies), and the unitless `A-B`, `A to B`, `A or B` as `each`. A and B use any spec 0035 number form, including a mixed number low end (`1 1/2-2 oz` is 1.5 to 2, never `1` followed by a `1/2-2` range). Extra words after the unit are ignored, as for single amounts. A range parses only when B > A; otherwise the line is unparsed. Two different units (`1 oz or 2 shots`) stay unparsed. Examples: `2-3 oz` → 2 to 3 oz, `3/4-1 cup` → 0.75 to 1 cup, `1-2 shot` → 1 to 2 shot, `2-3 dashes` → 2 to 3 dash, `2 or 3` → 2 to 3 each, `1 oz to 2 oz` → 1 to 2 oz, `8-10 oz cold` → 8 to 10 oz, `1 1/2-2 oz` → 1.5 to 2 oz, `½-1 oz` → 0.5 to 1 oz, `1/2 - 3/4 cup` → 0.5 to 0.75 cup, `1 oz - 2 ounces` → 1 to 2 oz. Must stay unparsed: `3-2 oz`, `2-2 oz`, `1 oz or 2 shots`, `2-3 Wheels`, `3-4 crushed`, `4-5 whole green`. A single amount never sets `maxValue`.
- **AC-3**: Every write path stores `amount_max_value` beside `amount_value` and `amount_unit`, from the same parse: the catalog import (`transform.ts`), custom recipe import, import overrides, the admin save (`adminRecipes.ts` through `admin_upsert_recipe`), and the reparse script. The database accepts the units `dash`, `splash`, `drop`, `each`, and rejects an `amount_max_value` unless `amount_value` is set and the max is greater. `pnpm reparse-measures` compares all three columns, prints per unit counts plus a range count, supports `--dry-run`, and a second live run changes zero rows (null equals null, and numerics compare by value, so `2` equals `2.0`). The dry run also lists every row that would become `each`, with its `measure` and ingredient name, so split errors can be fixed before the live run. `fetch_recipe_detail` returns `amount_max_value` for each ingredient.
- **AC-4**: Batching counted lines:
  - **Dash and splash**: the shown count is the stored count × servings, rounded to the nearest whole number, never below 1. The line's volume is the unrounded count × servings × the unit size (dash = 1/8 tsp = 0.616115 ml; splash = 1/4 oz = 7.393375 ml), carried unrounded. The volume counts toward the total and the dilution base like any volume line. The line reads `<count> <word>`, followed by ` (≈ <amount>)` in the batch unit (through `formatBatchAmount`) when the unrounded volume is at least 7.393375 ml (1/4 oz), compared with a tolerance of 1e-9 ml so that exactly 1 splash qualifies.
  - **Drop**: the count scales and rounds the same way (whole, never below 1). There is no volume, and it is not in the total or the dilution base.
  - **Each**: the count is the stored value × servings, rounded to the nearest 0.5 (`Math.round(x × 2) / 2`, so ties go up), never below 0.5. It shows as the number alone (`25`), with no unit word, not in the total or the dilution base. Exception: an `each` line whose ingredient category is `spirit`, `liqueur`, or null stays in the unscaled state (flagged, `measure` text), because it means a share of a layered shot glass.
  - Counted lines follow the scope presets and Custom selection exactly as volume lines do, including a Custom checkbox. The shown count is display only: a line's volume always uses the unrounded count, so `1/2 dash` × 3 shows `2 dashes` while its volume uses 1.5 dashes.
- **AC-5**: Batching ranges: a range line scales its low and high ends separately, by the same rule its unit uses (AC-4 for counted units, spec 0035 for volume and part). A part range uses the same part size at both ends; with no valid part size it is unscaled, like a single part line. The dilution base, water line, and total are each computed twice: once with every range at its low end, once at its high end. Every range string (line, `≈` hint, water, total) follows one contract, `formatBatchRange(low, high, unit)` for amounts and its count equivalent:
  - Each end is first rounded and floored on its own (spec 0035 AC-6 and AC-7 for amounts, AC-4 for counts).
  - If the two end strings are then identical, one value shows (`2 oz`).
  - Otherwise it reads `<low>–<high> <unit>`: an en dash, no spaces, the unit once after the high end. A floored low end keeps its `<` (`< 0.1–2 oz`).
  - A counted range shows its plural word once, chosen by the high end's count (`2–3 dashes`).
  - The `≈` hint shows when the high end's volume reaches 1/4 oz, and it formats both ends by the same contract (`≈ < 0.1–0.3 oz` is allowed).
  - The "nothing to dilute" note (spec 0035 AC-5) shows only when the high end base is 0.
  - A batch with no range line looks exactly as it does today.
- **AC-6**: Outside the batch: a range on a volume unit counts as a volume line for the single serving oz/ml/cl toggle (it can make the toggle appear). In the toggle it shows both ends converted through the existing single serving formatting, joined by `–`, except that an oz sourced range keeps its `measure` text (as an oz line does under spec 0021). Counted and `each` lines show their `measure` text in the toggle. In Quick Build, range, counted, and `each` lines show their `measure` text in every view and are left out of the parts view ratio.
- **AC-7**: The batch control shows when at least one line adds volume at 1 serving under the Everything scope: a volume line, a part line, or a dash or splash line (the normal state with an ml amount). A recipe whose only parsed lines are counted lines with no volume (drops, `each`) shows no batch control, and neither does a layered shooter made only of `each` lines on spirits or liqueurs. `hasScalableIngredient` takes the unit, value, and category of each line.
- **AC-8**: `recipes.method` holds null or one of `shake`, `stir`, `build`, `blend`, `layer`, enforced by a check constraint. New column `recipes.method_source` holds null, `classifier`, or `admin` (check constraint), and it is null exactly when `method` is null. The `classify-method-and-aliases` classifier returns only those five values or null (the structured output schema is an enum). Its prompt maps swizzle to `build`, throw and roll to `stir`, dry shake and whip shake to `shake`, and anything unclear to null. It writes `method_source = 'classifier'` with a non null method. It never changes `method` or `method_source` on a recipe whose `method_source` is `admin`, even with `--all`, though it still writes straining and aliases there. A successful null result stamps the hash on purpose: an unclear recipe stays null until its instructions change or the script runs with `--all`. Under `--all`, a null result on a `classifier` row resets both `method` and `method_source` to null. A failed classification batch is logged and its recipes keep their old values and hash, so the next run retries them.
- **AC-9**: The classifier runs once over the live catalog. It prints counts per method, nulls, and failures. A second run classifies zero recipes (the hash gate).
- **AC-10**: Method dilution defaults, in shared code only: `stir` 20%, `shake` 25%, `build` none, `blend` none, `layer` and null none. When a recipe's batch panel opens, the dilution level starts at its method's default. For `stir`, `shake`, `build`, or `blend`, a hint below the dilution control reads "Default for a stirred drink" (or shaken, built, blended). The hint shows only while the level is still the starting default; once the bartender picks a level (any level, even the default itself), the hint hides and their pick holds until a different recipe opens, which resets to that recipe's default. The reset is keyed by recipe id only: a refetch of the same recipe (a locale switch, a background refresh) never resets the level or the flag. For built and blended drinks the hint explains why None is chosen. `layer` and null show no hint. The start level, the picked flag, and the reset live in one shared pure helper in `packages/shared/src/batch.ts` that both panels use. The "nothing to dilute" note from spec 0035 AC-5 still applies when a default level meets an empty dilution base.
- **AC-11**: The web admin recipe form has an optional Method picker (blank plus the five methods) that loads the recipe's current method. `admin_upsert_recipe` gains `p_set_method boolean default false` and `p_method text default null`. The method columns change only when `p_set_method` is true, so a caller that omits them (the old admin form during rollout) never touches a method. The new form always sends `p_set_method = true` with its picker value: a chosen method stores `method` with `method_source = 'admin'`; blank stores both as null, which leaves the recipe free for the classifier to fill on its next run.
- **AC-12**: Quick Build's method line shows a catalog recipe's method as a translated label in the current locale (`shake` → "Shake" in English, "Agitar" in Spanish, and so on). A bar recipe's free text method shows unchanged. Straining is unchanged.
- **AC-13**: Every new piece of copy comes from the message catalogs in all nine live locales (`en`, `es`, `pt`, `fr`, `ru`, `hi`, `ja`, `ko`, `zh`) on web (`apps/web/messages/*.json` and `messages.d.ts`) and in mobile's react-i18next resources: plural count words for dash, splash, and drop (web: ICU `plural` messages; mobile: i18next plural suffix keys `_zero`, `_one`, `_two`, `_few`, `_many`, `_other` as each locale needs; a range picks the form by its high end), the `≈` volume hint format, the four method hints, and the five method labels (Quick Build and the admin picker). Numbers keep today's formatting (locale aware separators are feature 58).

## Decision

**Chosen option**: Option 1: extend in place. New `amount_unit` values and the existing `amount_max_value` carry counts and ranges, the batch math learns both, and `recipes.method` becomes a checked list filled by the existing Haiku classifier, with an admin override protected by `method_source`.

**Implementation skills**: `supabase-postgres-best-practices` (`supabase/agent-skills`, `.agents/skills/supabase-postgres-best-practices/`) · `vitest` (`antfu/skills`, `.agents/skills/vitest/`) · `react-native-best-practices` (`callstackincubator/agent-skills`, `.agents/skills/react-native-best-practices/`)

Decisions made during design without a separate question (pick, why, runner up):
- **`isVolumeUnit` becomes a membership check on `VOLUME_UNITS`.** Today it is `unit !== "part"`, so a `dash` would reach `toMl` and come back undefined (NaN on screen). Runner up: add each counted unit to the negation, rejected because the next unit would repeat the bug.
- **Counted units live in their own list, `COUNTED_UNITS` (`dash`, `splash`, `drop`, `each`).** `RecognizedUnit` = volume, `part`, and counted. Sizes for dash and splash live in a `COUNTED_UNIT_ML` map next to `toMl`, never in data. Runner up: give dash and splash entries in `toMl`, rejected because then they would count as volume units for the toggle.
- **The shooter share check reads the category inside `computeBatch`.** It sits where scope filtering already reads category. Runner up: a separate pre pass, rejected as two places reading the same field.
- **Ranges carry a second unrounded ml (`amountMlMax`) on `BatchLine`.** The total and water are summed separately at each end. Runner up: a midpoint, rejected by the engineer's choice of ranges all the way.
- **Clients only trust a max value that is a number greater than the low value.** The mapper drops anything else and treats the line as a single amount. That matches spec 0035's "never trust stored values blindly" invariant.
- **The method hint tracks "untouched", not "equal".** The panel keeps a `dilutionPicked` flag instead of comparing the level to the default, so picking the default level by hand also hides the hint. Runner up: compare values, rejected because the hint would flicker back.
- **`admin_upsert_recipe` gains `p_set_method` (default false) and `p_method` (default null).** A flag, not a sentinel string, because an absent method and a cleared one must be told apart. Changing the signature means dropping and recreating the function in one migration, plus regenerating `database.types.ts`. Runner up: a `'keep'` sentinel value, rejected as a magic string inside a checked column's input.
- **Method labels share one key set** (`methods.shake`, and so on) between Quick Build and the admin picker on web, and mirror keys on mobile.

## Feature design

**Data model sketch**:

`recipe_ingredients` (existing, constraints only):

| Column | Type | Nullable | Change |
|---|---|---|---|
| `amount_unit` | text | yes | Check widened to also allow `dash`, `splash`, `drop`, `each` |
| `amount_value` | numeric | yes | No change. Holds the low end of a range |
| `amount_max_value` | numeric | yes | Now written for ranges. New check `recipe_ingredients_amount_max_check`: `amount_max_value is null or (amount_value is not null and amount_max_value > amount_value)` |
| `measure` | text | yes | No change, never rewritten |

`recipes` (existing):

| Column | Type | Nullable | Change |
|---|---|---|---|
| `method` | text | yes | New check: null or `shake`, `stir`, `build`, `blend`, `layer`. All 492 rows are null today, so it applies cleanly; the migration still asserts zero violating rows first |
| `method_source` | text | yes | New. Check: null, `classifier`, or `admin`. Pair check: `(method is null) = (method_source is null)` |

No new tables or relationships. `bar_recipes` and `bar_recipe_ingredients` are unchanged.

**Shared types**:
- `units.ts`: `COUNTED_UNITS = ["dash", "splash", "drop", "each"]`, `CountedUnit`; `RECOGNIZED_UNITS` = volume, `part`, counted. `ParsedMeasure` gains `maxValue: number | null`. `isVolumeUnit` and a new `isCountedUnit` are membership checks. `COUNTED_UNIT_ML: { dash: 0.616115, splash: 7.393375 }`.
- `batch.ts`: `BatchIngredientInput` gains `amountMaxValue: number | null`. `BatchLine` gains `amountMlMax: number | null` and a new state `counted` (rendered, scaled count, no ml contribution: drop and `each`). Dash and splash lines stay `normal` with a count display. `BatchResult` gains `totalDisplayAmount` and `waterLine.displayAmount` as range strings when they differ. A new `hasScalableIngredient` (unit, value, category) replaces `hasConvertibleIngredient` for the control's visibility (AC-7); `hasPartIngredient` and `hasVolumeIngredient` count range lines too. New `formatBatchRange(lowMl, highMl, unit)` and a count equivalent implement the AC-5 contract. New `defaultDilutionFor(method: RecipeMethod | null): DilutionLevel`, plus the pure dilution state helper from AC-10 (start level, picked flag, reset by recipe id).
- `recipes.ts`: `RECIPE_METHODS` = `shake, stir, build, blend, layer`, `RecipeMethod`, `toRecipeMethod(raw)` (unknown → null), and the recipe detail mapper reads `amount_max_value`.

**State transitions**: none.

**API surface**:

| Endpoint | Method | Key inputs | Key outputs | Auth | Key errors |
|---|---|---|---|---|---|
| `fetch_recipe_detail` (existing RPC, changed) | RPC read | unchanged | each ingredient adds `amount_max_value`; `method` may now be one of the five values | public (unchanged) | none new |
| `admin_upsert_recipe` (existing RPC, changed) | RPC write | each ingredient adds `amount_max_value`; new `p_set_method` (boolean, default false) and `p_method` (text, default null) | unchanged | admin only (unchanged) | check violation on an unknown method or unit, or a bad max |
| `reparse-measures` (existing script, changed) | CLI | `--dry-run` | counts per unit, range count, rows changed | service role key, local | exits non zero on any failed update |
| `classify-method-and-aliases` (existing script, changed) | CLI | `--all` | counts per method, nulls, failures, admin rows skipped | service role and Anthropic keys, local | exits non zero only on a config error; batch failures are logged and retried next run |

**Value sourcing**:

| Action | Value produced / displayed | Source |
|---|---|---|
| Parse a measure | `value`, `maxValue`, `unit` | `parseMeasure` in `packages/shared/src/units.ts`, rules in AC-1 and AC-2 |
| Store a parsed measure | `amount_value`, `amount_max_value`, `amount_unit` | the parse, on every write path in AC-3 |
| Dash, splash volume | ml per count | `COUNTED_UNIT_ML` constants (AC-4) |
| Counted line count shown | number | stored value × servings, rounded per unit (AC-4) |
| Counted line volume | unrounded ml | unrounded count × servings × `COUNTED_UNIT_ML` |
| Volume hint shown or not | yes or no | unrounded (high end) volume ≥ 7.393375 ml |
| Shooter share check | unscaled or counted | `each` unit plus `ingredients.category` (already in `fetch_recipe_detail`) |
| Range ends | two unrounded ml (or counts) | `amount_value` and `amount_max_value`, each scaled by its unit rule |
| Total and water | one value or a range | sums over the low ends and the high ends, rounded once at display |
| Plural count word | text | message catalog, ICU plural by the shown count and locale (AC-13) |
| Recipe method | `RecipeMethod` or null | `recipes.method` via `fetch_recipe_detail`, narrowed by `toRecipeMethod` |
| Starting dilution level | `DilutionLevel` | `defaultDilutionFor(method)` (AC-10) |
| Method hint shown | yes or no | method is stir, shake, build, or blend, and the panel's `dilutionPicked` flag is false |
| Method written by classifier | `RecipeMethod` or null | Haiku structured output (enum), skipped when `method_source = 'admin'` |
| Method written by admin | `RecipeMethod` or null | admin form picker → `p_method`, applied only when `p_set_method` is true |
| Range display string | text | `formatBatchRange` and its count equivalent (AC-5) |
| `method_source` | `classifier`, `admin`, or null | set by whichever path writes the method; null with a null method |
| Quick Build method text | label or free text | catalog recipe: translated `methods.<value>` label; bar recipe: stored free text |

**Line state matrix** (replaces spec 0035's; every line is in exactly one state):

| State | Rendered? | Scaled? | In total? | In dilution base? |
|---|---|---|---|---|
| Normal volume or part line, single or range | yes | yes | yes | yes |
| Normal dash or splash line, single or range | yes, count plus optional `≈` volume | yes, count and volume | yes, by volume | yes, by volume |
| Counted (drop, or `each` on a non alcohol category) | yes, count | yes, count only | no | no |
| Uncategorized (null category under Alcohol only or Except citrus, non `each`) | yes, flagged | yes | yes, if it has volume | yes, if it has volume |
| Unscaled (unparsed, unknown unit, `each` on spirit, liqueur, or null category) | yes, flagged, `measure` text | no | no | no |
| Excluded by scope or Custom selection | no | no | no | no |

**Key invariants**:
- `amount_max_value` is set only with `amount_value`, and only when greater (database check).
- Unit sizes (dash, splash, and spec 0035's) exist only in code.
- No counted unit ever reaches `toMl`; `isVolumeUnit` is a membership check, enforced by the type.
- Every batch value is carried unrounded and rounded once at display, at both range ends. A count's rounding is display only; its volume uses the unrounded count.
- No batch amount displays as `0` (spec 0035 AC-7 holds at both range ends).
- `measure` is never rewritten.
- The classifier never overwrites an `admin` method. `method_source` is null exactly when `method` is.
- Clients narrow stored values: unknown unit → unparsed, unknown method → null, invalid max → single amount.

**Security model**: no change. `recipes` and `recipe_ingredients` stay public read; writes go only through the service role (scripts, import) or the admin gated `admin_upsert_recipe`. Both scripts run locally with the service role key.

**Configuration required**: no new variable. The classifier needs `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and `ANTHROPIC_API_KEY` locally (existing). The reparse needs the first two (existing).

**Critical test scenarios**:
- Parser table: every AC-1 and AC-2 example parses as listed; every listed negative stays null; spec 0035's parser table still passes, verifies **AC-1**, **AC-2**.
- `2 dashes` × 25 servings, oz batch: line reads `50 dashes (≈ 1 oz)`; the total includes 30.8 ml. `2 dashes` × 1 reads `2 dashes` with no `≈`, verifies **AC-4**.
- `1/2 dash` × 3: shows `2 dashes` (1.5 rounds to 2) and its volume uses 1.5 dashes, verifies **AC-4**.
- `3 drops` × 10: `30 drops`, not in the total, verifies **AC-4**.
- `1/2` Lime (citrus) × 25: `12.5`; `1/3` Baileys (liqueur) × 25: unscaled, flagged; B-52 style recipe of three liqueur `each` lines: no batch control, verifies **AC-4**, **AC-7**.
- `2-3 oz` gin plus `1 oz` lime × 10, oz batch, 20% dilution: line `20–30 oz`; water `6–8 oz`; total `36–48 oz`, verifies **AC-5**.
- A range whose two ends round to the same value in l shows one value; `1/2-1 dash` × 1 floors both ends to 1 and shows `1 dash`; a `2-3 parts` line at the default part size × 10 in oz reads `20–30 oz`, and with an invalid part size it is unscaled; a range under Alcohol only is excluded when its category is citrus, verifies **AC-5**.
- A recipe of only `3 drops` and `1` Lime shows no batch control, verifies **AC-7**.
- The old admin form (no `p_set_method`) saves a recipe whose method is `stir`/`classifier`: the method is unchanged, verifies **AC-11**.
- A classifier null result on a recipe stamps its hash, and the next normal run skips it; `--all` with a null on a `classifier` row clears both columns, verifies **AC-8**.
- Toggle on a recipe with `2-3 cl` set to ml: `20–30 ml`; `2 dashes` in the toggle shows `2 dashes` text; Quick Build shows `2-3 cl` as text, verifies **AC-6**.
- Reparse dry run reports ranges and new units; the live run writes them; a second run changes 0 rows; a write of max ≤ value is rejected by the database, verifies **AC-3**.
- Classifier with a mocked Haiku response: enum values written with `classifier`; an `admin` row keeps its method under `--all`; a thrown batch leaves its hashes unchanged, verifies **AC-8**.
- Live classifier run prints counts; the rerun classifies 0, verifies **AC-9**.
- A stirred recipe opens at 20% with "Default for a stirred drink"; pick 15%: the hint hides; pick 20% again: it stays hidden; open a shaken recipe: 25% with its hint; a recipe with null method opens at None with no hint, verifies **AC-10**.
- Admin sets Build on a recipe, then the classifier runs with `--all`: still `build`/`admin`; admin clears it: both null, verifies **AC-11**, **AC-8**.
- Quick Build in Spanish shows the translated method for a catalog recipe and the free text for a bar recipe, verifies **AC-12**.
- Japanese and Russian batch panels show localized plural words and the method hint; a message catalog key check finds every new key in all nine files, verifies **AC-13**.

## Build plan

Tracer Bullet: the first slice pushes `dash` through every layer (constraint, parser, reparse, live data, batch math, web panel, copy) before the other units, ranges, and methods thicken it.

1. **Thread: dash, end to end.** Migration on `recipe_ingredients`: widen `recipe_ingredients_amount_unit_check` to the full target (`dash`, `splash`, `drop`, `each` at once) and add `recipe_ingredients_amount_max_check` (assert zero violators first). Split `COUNTED_UNITS` out in `units.ts`, make `isVolumeUnit` a membership check, add `COUNTED_UNIT_ML`; parser learns `dash`/`dashes`. `computeBatch` scales dash lines with count plus volume and the 1/4 oz hint threshold. Web batch panel renders the count line with the `dash` plural key in `en` and `es`. Run `pnpm reparse-measures --dry-run` then live on dashes. Unit tests, satisfies **AC-1** (dash), **AC-3** (unit constraint, reparse), **AC-4** (dash).
2. Remaining counted units: `splash`, `drop`, `each` in the parser; the counted state and the shooter share rule in `computeBatch`; `hasScalableIngredient` drives the control on web and mobile; mobile batch panel renders count lines, satisfies **AC-1**, **AC-4**, **AC-7**.
3. Ranges: parser range forms and `maxValue`; every write path stores `amount_max_value` (`transform.ts`, `importCustomRecipes.ts`, `overrides.ts`, `adminRecipes.ts`); migration replacing `admin_upsert_recipe` to write `amount_max_value` and `fetch_recipe_detail` to return it; mappers narrow the max; `computeBatch` two ended lines, water, and total; toggle and Quick Build per AC-6; reparse compares three columns and counts ranges, satisfies **AC-2**, **AC-3**, **AC-5**, **AC-6**.
4. Method data: migration adding the `recipes.method` check and `method_source` with its checks; classifier switches its schema to the enum, updates the prompt mapping, skips `admin` methods, writes `method_source`, keeps failed batches unstamped; `toRecipeMethod` and the detail mapper, satisfies **AC-8**.
5. Method defaults: `defaultDilutionFor`; web and mobile batch panels start at the default, track `dilutionPicked`, show and hide the hint, reset on a new recipe, satisfies **AC-10**.
6. Admin method picker: `p_method` on `admin_upsert_recipe` (drop and recreate, regenerate types), the picker in `admin-recipe-form.tsx`, `adminRecipes.ts` sends it, satisfies **AC-11**.
7. Quick Build method label on web and mobile (catalog translated, bar free text), satisfies **AC-12**.
8. Copy: every new key in all nine web catalogs plus `messages.d.ts`, and mobile resources; plural forms per locale, satisfies **AC-13**.
9. Live rollout, in this order: apply the migrations in the Supabase dashboard SQL editor; deploy web and rebuild the mobile dev client; run `pnpm reparse-measures --dry-run`, then live, then once more to confirm 0 changes; run `pnpm classify-method-and-aliases`, then once more to confirm 0 classified; check a dash recipe, a range recipe, a stirred recipe, and a layered shooter on the live site, satisfies **AC-3**, **AC-9**.

## Migration plan

**Strategy**: extend in place, code before data.
**Phases**:
1. Apply the migrations (unit and max checks; `admin_upsert_recipe` and `fetch_recipe_detail` replacements; the method check and `method_source`). Each is safe alone: widening a check never rejects existing rows, no row has a max or a method yet, and the old admin client doesn't send the new fields.
2. Deploy web and rebuild mobile with the new code.
3. Run the reparse (ranges and counted units appear), then the classifier (methods appear).

**Rollback**: set the new rows back with one SQL update (`amount_unit in ('dash','splash','drop','each')` → null pair; `amount_max_value` → null; `method` and `method_source` → null where `method_source = 'classifier'`). The checks can stay.
**Risks**: a client older than phase 2 ignores `amount_max_value` and would batch `2-3 oz` as `2 oz`, silently. Today no mobile build is in users' hands (only dev builds), so phase order alone covers it. If a build ships before this lands, it must update before phase 3. The classifier run also inserts generated search aliases (long pending from spec 0023); review a sample after the run.

## Consequences

**Positive**:
- About 80 dash, drop, and splash lines and about 20 range lines start batching; bitters batches become measurable.
- Batches start at a dilution that fits the drink, instead of none for everything.
- Quick Build's method line finally shows, translated, and the pending search aliases land with the same run.
- An admin can correct a method, and it stays corrected.

**Negative / tradeoffs**:
- Dash and splash sizes are conventions: real dashers vary, and a splash is loose. The volume is a guide, marked with `≈`.
- A range batch shows a range total, more to read than one number, and the bartender still picks the strength.
- Some bare numbers are data errors from earlier splits (`2` with the name `–3 Dashes Worcestershire Sauce`) and will now scale as plain counts. They need catalog fixes.
- The method default changes what a bartender sees on open: a returning user who expects None now sees 20% or 25%.
- The classifier costs about 50 Haiku calls per full run, and its method picks are model judgments until an admin checks them.
- Nine locales of plural words is real translation work, with ICU plural rules that differ per language (Russian has four forms).

**Neutral**:
- Spec 0035's "ranges and counted lines stay unscaled" (AC-11) and its "default dilution None" (AC-5) are replaced here; its parser rule that refused `or` and `to` after the unit now reads ranges instead.
- Whole items with a word (`1 wedge`, `2 slices`) stay unscaled by choice.
- Straining stays free English text.

## Follow-up

- [ ] Fix bare number lines that are split errors (`2` + `–3 Dashes Worcestershire Sauce`, `3` + `–4 Fresh Raspberries`), likely under feature 59 or a catalog pass.
- [ ] Whole items with a word (`wedge`, `slice`, `twist`, `sprig`) could scale as prep counts later.
- [ ] Translate straining the same way as method (a checked list plus labels).
- [ ] Classified methods are model output; an admin spot check of a sample (especially build vs stir) is worth doing after the live run.
- [ ] Spec 0035 AC-1, AC-5, AC-11, and its line state matrix, and spec 0023's Quick Build method line, now read as amended by this spec; `/sync` may want to flag them when this ships.

## Rationale

Reasoning and options: see [rationale.md](rationale.md).
