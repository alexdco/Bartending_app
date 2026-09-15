# 0022. Batch cocktail conversion

**Date**: 2026-09-15
**Status**: In Progress

## Summary

Adds a "batch this recipe" tool to the recipe detail page: a bartender enters a number of servings, and every ingredient amount is scaled up into a single batch quantity, shown in ounces, milliliters, or liters. They can also add water to mimic the dilution a shaken or stirred drink normally gets, and choose whether to batch every ingredient, only the alcohol, everything except citrus, or a custom pick of ingredients. Builds directly on spec 0021's parsed ingredient amounts and conversion math; ingredients that could not be parsed are shown unscaled with a flag rather than silently dropped.

See [rationale.md](rationale.md) for context, options considered, and the decision rationale.

## Requirements

**User stories**:
- As a bartender prepping for an event, I want to enter a serving count for a recipe and see every ingredient scaled to a batch quantity in my preferred unit, so I don't have to do the multiplication by hand.
- As a bartender who wants a pre batched base, I want to choose whether to batch everything, only the alcohol, or exclude citrus, so my batch matches how I actually prep (citrus is often added fresh at service).
- As a bartender replicating how a drink tastes when shaken or stirred to order, I want to optionally add a dilution percentage, so the batch accounts for the water a shaken/stirred drink normally picks up from ice.

**Acceptance criteria** (the contract, each criterion is IDed and independently checkable):
- **AC-1**: On a recipe detail page with at least one convertible ingredient (non null `amount_value`/`amount_unit`), a "Batch this recipe" control is visible. A recipe with zero convertible ingredients shows no batch control at all.
- **AC-2**: Entering a whole number of servings from 1 to 500 and choosing a batch scope (everything / alcohol only / everything except citrus / custom selection) produces a batched amount for every eligible ingredient. Each line's amount is computed as `amount_value * servings` in the ingredient's own source unit, converted to unrounded milliliters, summed/manipulated in that unrounded ml form throughout, and rounded to its final display form only once, at display time: oz as a decimal to the nearest tenth (e.g. "312.4 oz", not a fraction), ml to the nearest tenth, liters to the nearest hundredth. An out of range or non whole servings value (empty, 0, 501+, a decimal, non numeric input) is rejected with an inline error and no batch is computed until corrected, the same handling as AC-6's dilution input.
- **AC-3**: An ingredient line with a null `amount_value`/`amount_unit` (unparseable at import time) is always shown in the batch output with its original `measure` text and a "not scaled, adjust manually" flag, regardless of scope or servings; it is never scaled, never counted in the total volume or the dilution alcohol base, and never silently omitted. It has no checkbox under Custom selection (AC-5); it always renders.
- **AC-4**: Choosing "Alcohol only" includes only ingredients whose category is `spirit` or `liqueur`. Choosing "Everything except citrus" includes every ingredient except those categorized `citrus`. An ingredient with a null category (not yet classified) is always included in the output (never silently dropped) and visibly flagged as uncategorized; it is excluded from citrus specific logic (never treated as citrus) and excluded from the dilution alcohol base (AC-6), since it is not a known spirit or liqueur. If every ingredient on a recipe has a null category, the "Alcohol only" and "Everything except citrus" scope options are still offered (not hidden), but their result is identical to "Everything" with every line flagged uncategorized, so the bartender can see the tool has nothing real to filter on yet.
- **AC-5**: Choosing "Custom ingredient selection" shows a checkbox per parseable ingredient line on the recipe (unparseable lines from AC-3 always render with no checkbox and are never part of this selection), checked by default; only checked ingredients are batched, unchecked ones are omitted from the output entirely (not shown flagged, since this is an explicit exclusion, not a parsing gap) and omitted from the total volume and the dilution alcohol base. The checked set resets to "all checked" whenever the scope selector is changed away from and back to Custom, or when a different recipe is opened; it is not persisted across page loads.
- **AC-6**: Selecting a dilution level (None, 15%, 20%, 25%, or Custom) adds a "Water" line to the batch output equal to that percentage of the batched alcohol volume **actually present in the current output** (the sum, in unrounded ml, of every included `spirit`/`liqueur` categorized line still in scope after AC-4/AC-5 filtering, before dilution is added); "None" adds no water line. If the current scope and selection exclude every alcohol categorized ingredient (e.g. a Custom selection with every spirit unchecked, or a recipe with no alcohol at all), no water line is computed regardless of the chosen dilution percentage, and a short note explains why ("no alcohol in this batch, no dilution added"). A Custom dilution value must be a whole or decimal number from 0 to 50; values outside that range are rejected with an inline error and no water line is computed until corrected.
- **AC-7**: The total batch volume is the sum, in unrounded ml, of every included ingredient's batched amount (post scope/selection filtering) plus the water line's unrounded ml value when present, excluding unscaled flagged (AC-3) and unchecked (AC-5) lines; the total is converted to the selected output unit and rounded once per AC-2's rule. The total is never computed by summing the already rounded, individually displayed line amounts (those are two different numbers and can legitimately differ by a small margin).
- **AC-8**: All batch math (scaling, dilution, unit conversion, rounding) runs client side from the already loaded recipe detail data; no network call is made when servings, scope, unit, or dilution change.
- **AC-9**: Every ingredient's category (`spirit`, `liqueur`, `citrus`, `other`) is populated by the import job (TheCocktailDB catalog and custom recipes alike) via a Claude Haiku classification call, from the ingredient name alone (no other source signal). The call constrains its response to a JSON object with a single `category` field restricted to exactly those four values (via a tool/structured output schema, not free text parsing); a response that fails to parse or names a value outside that set is treated as a classification failure, `category` is left null, and a warning is logged, mirroring `translateCatalog`'s existing non fatal error handling. The result is cached on the `ingredients` row and only re-classified when the ingredient's name changes (the same hash-of-name gate spec 0020 uses for translation). Existing ingredients are backfilled once via a dedicated script following the same pattern as spec 0020's translation backfill.
- **AC-10**: The batch tool is available to any visitor, signed in or guest, with no new access restriction.

## Decision

**Chosen option**: Option 1: client side batch calculator on the recipe detail page, with ingredient category stored on `ingredients` and populated by a cached Haiku call in the import job. See [rationale.md](rationale.md) for the alternatives considered and why.

## Feature design

**Data model sketch**:

`ingredients` (existing table, two new nullable columns):

| Column | Type | Nullable | Notes |
|---|---|---|---|
| `category` | text | yes (new) | One of `spirit`, `liqueur`, `citrus`, `other`, constrained by a `check` constraint. Null until classified. |
| `category_source_name_hash` | text | yes (new) | sha256 of the ingredient name last classified, the hash gate for re-classification (added during the build; the same pattern as spec 0020's `source_name_hash`). |

No other table changes. Batch computation itself is never persisted (no new table): it is derived client side from the recipe's already loaded ingredient list plus the bartender's current servings/scope/unit/dilution selections.

**State transitions**: none (no new entity lifecycle; `category` is set once at import/backfill time and only overwritten if the ingredient's name changes, mirroring spec 0020's hash gated re translation).

**API surface**:
No new endpoint. The recipe detail read (`fetch_recipe_detail`, spec 0020/0021) is extended to also return each ingredient's `category` alongside the existing `amount_value`/`amount_unit`/`measure`.

| Endpoint | Method | Key inputs | Key outputs | Auth | Key errors |
|---|---|---|---|---|---|
| `fetch_recipe_detail` (existing RPC, extended) | RPC (read) | recipe id/slug (existing params) | adds `category` per ingredient | public (existing) | none new |

**Value sourcing**:
| Action | Value produced / displayed | Source |
|---|---|---|
| Show/hide the batch control | Whether the "Batch this recipe" control renders | At least one ingredient line on the page has non null `amount_value`/`amount_unit` (same signal spec 0021 uses for its own toggle) |
| Enter servings | Servings count used in scaling | Bartender input, validated as a whole number 1 to 500; out of range or non whole input rejected inline, no batch computed until corrected |
| Pick scope | Which ingredient lines are included | Everything: all parseable lines. Alcohol only: `category` in (`spirit`,`liqueur`). Except citrus: `category` != `citrus` (null category included, flagged). Custom: the bartender's checked ingredient ids (default all checked, unparseable lines never checkboxed) |
| Pick output unit | Unit each batched amount and the total are shown in | Bartender selection, one of `oz`/`ml`/`liter`, a client side selection state (no persistence, mirrors spec 0021's toggle default behavior) |
| Batched amount per ingredient | The scaled, converted, rounded amount shown per line | Pipeline, in order: `amount_value * servings` in the source unit → convert to unrounded ml → convert to the output unit → round once (oz: nearest tenth decimal; ml: nearest tenth; liter: `ml / 1000`, nearest hundredth). Never rounds at an intermediate step. |
| Unscaled flag | Whether a line shows "not scaled, adjust manually" | `amount_value`/`amount_unit` both null on that `recipe_ingredients` row (AC-3) |
| Uncategorized flag | Whether a line shows "uncategorized" under Alcohol only / Except citrus scope | `category` is null on that ingredient (AC-4) |
| Dilution water line amount | The added "Water" line's amount | `(sum, in unrounded ml, of every included spirit/liqueur line's batched amount post scope/selection filtering, before dilution) * dilutionPercent / 100`, converted to the output unit and rounded once; 0 when no alcohol categorized line is currently included (AC-6) |
| Dilution percent, Custom | The percent used above | Bartender input, validated 0 to 50 (inclusive), rejected outside that range with no water line computed until corrected |
| Total batch volume | The displayed total | Sum, in unrounded ml, of every included ingredient's batched amount (post scope/selection filtering) plus the water line's unrounded ml value when present, excluding unscaled (AC-3) and unchecked (AC-5) lines; converted to the output unit and rounded once (never the sum of already rounded per line displays) |
| Ingredient category | `spirit` / `liqueur` / `citrus` / `other` / null | `ingredients.category`, set by the import job's Haiku classification call (structured output constrained to the 4 values, ingredient name only, no other input signal), or the one time backfill script for pre existing rows; null on any classification failure |

**Line state matrix** (every ingredient line on a batched recipe is in exactly one of these states):

| State | Rendered? | Scaled? | In total volume? | In dilution alcohol base? |
|---|---|---|---|---|
| Normal (parseable, included by scope/selection) | yes | yes | yes | yes, if `category` is `spirit`/`liqueur` |
| Unscaled (AC-3: `amount_value`/`amount_unit` null) | yes, flagged, original `measure` text | no | no | no |
| Uncategorized (AC-4: `category` null, under Alcohol only / Except citrus) | yes, flagged, scaled normally | yes | yes | no (not a known spirit/liqueur) |
| Excluded by Custom selection (AC-5: unchecked) | no | no | no | no |
| Excluded by Alcohol only / Except citrus scope | no | no | no | no |

**Key invariants**:
- Batch math always starts from each ingredient's stored `amount_value` (the single serving amount), never from a previously displayed, already rounded batch number; this keeps switching servings or unit lossless, the same rule spec 0021 established for per serving conversion.
- Every intermediate batch calculation (per line scaling, the dilution alcohol base, the total volume) is carried in unrounded milliliters and converted/rounded to the output unit exactly once, at final display; no step rounds and then feeds that rounded value into a further calculation.
- `category`, when set, is one of the fixed set `spirit`, `liqueur`, `citrus`, `other` (enforced by a `check` constraint); a Haiku response outside that set is treated as a classification failure, never coerced to a default category.
- The water line is computed fresh from whichever alcohol categorized lines are actually present in the current scope/selection (never from the full recipe's alcohol content regardless of what was filtered out); zero alcohol in the current output means no water line, whatever the dilution percent.
- A recipe with zero convertible ingredients never shows the batch control, matching spec 0021's own toggle visibility rule.
- All batch computation (scaling, filtering, dilution, conversion, rounding) is a pure function of servings, scope, unit, dilution, and the already loaded recipe data; no network call is made when any of these change.

**Security model**:
No change. `category` lives on the existing public read `ingredients` table (spec 0002's row level security: open `SELECT` to `anon`/`authenticated`, writes only via the import job's service role key). The batch tool itself performs no writes and requires no authentication (AC-10).

**Configuration required**:
- No new environment variable. The import job's classification call reuses the existing `ANTHROPIC_API_KEY` secret already required by spec 0007/0020's Haiku integrations; if unset, the import job skips classification and logs a warning (mirroring `translateCatalog`'s existing non fatal handling), leaving `category` null rather than failing the import.

**Critical test scenarios**:
- Happy path: open a recipe with parseable ingredients, enter 50 servings, scope "Everything", unit oz; every ingredient's batch amount equals its single serving `amount_value` times 50, correctly converted (via the unrounded ml pipeline) and rounded once to the nearest tenth oz, and the total volume equals the unrounded sum converted and rounded once (not the sum of the displayed per line values), verifies **AC-1**, **AC-2**, **AC-7**, **AC-8**.
- Servings = 1 equivalence: batching a recipe at 1 serving with no dilution and "Everything" scope produces, per ingredient, the same value as spec 0021's own single serving conversion (before its oz fraction formatting), verifying the batch pipeline agrees with the existing conversion math at the trivial case.
- Boundary inputs: servings of 0, 501, and a decimal are all rejected inline with no batch computed; servings of 1 and 500 both compute successfully; a custom dilution of exactly 0 and exactly 50 both compute successfully, values below 0 or above 50 are rejected, verifies **AC-2**, **AC-6**.
- Mixed parseable/unparseable: a recipe with one parseable ingredient and one "2 Dashes bitters" line; batching scales only the parseable line and shows the bitters line unscaled with the "not scaled" flag, excluded from the total volume, verifies **AC-3**.
- Scope filtering: the same recipe batched under "Alcohol only" shows only `spirit`/`liqueur` lines; under "Everything except citrus" a `citrus` categorized lime juice line is excluded while everything else (including a null category ingredient, shown flagged as uncategorized and included) remains, verifies **AC-4**.
- Custom selection: unchecking one ingredient in "Custom ingredient selection" removes it from the output entirely (no flag, not counted in the total or the dilution alcohol base); switching scope away from Custom and back resets every checkbox to checked, verifies **AC-5**.
- Dilution, normal case: selecting 20% dilution on a batch whose included spirit + liqueur lines sum to 100 oz adds a "Water" line equal to 20 oz (computed from unrounded ml) and includes it in the total; a custom dilution value of 60 is rejected with an inline error and computes no water line, verifies **AC-6**, **AC-7**.
- Dilution with no alcohol in scope: a Custom selection with every `spirit`/`liqueur` line unchecked, dilution set to 20%, produces no water line and a "no alcohol in this batch" note, rather than a water line computed from excluded ingredients, verifies **AC-6**.
- Classification backfill and failure handling: running the one time backfill script against the existing 293 ingredients populates `category` for each (or leaves it null on a malformed/out of range Haiku response, never coerced to a default) and re running it does not reclassify unchanged names, verifies **AC-9**.
- No convertible ingredients: a recipe whose every ingredient line is unparseable shows no "Batch this recipe" control at all, verifies **AC-1**.

## Build plan

1. [x] Add the migration: `category` (text, nullable, `check` constrained to `spirit`/`liqueur`/`citrus`/`other`) on `ingredients`; extend `fetch_recipe_detail` to also return `category` per ingredient, satisfies **AC-4**, **AC-9**. A second migration added `category_source_name_hash` for the hash gate. Applied live to `BartendingAppWeb` (`ctuzjhhpnkkhooneporu`) via `supabase/migrations/20260915000000_batch_cocktail_conversion.sql` and `20260915000100_ingredient_category_source_hash.sql`.
2. [x] Write the ingredient classification call in the import job (new module alongside the existing `catalog-translation` pattern): a cached, hash gated Haiku call per distinct ingredient name (name only, no other input signal), using a structured output schema constrained to the 4 category values; any parse failure or out of range response leaves `category` null and logs a warning (not a failure), skipped entirely with a warning when `ANTHROPIC_API_KEY` is unset, satisfies **AC-9**. `packages/shared/src/ingredientClassification.ts`, exposed via the `@bartendingapp/shared/ingredient-classification` subpath (kept out of the main barrel, mirroring `catalog-translation`).
3. [x] Wire the classification call into both import call sites (`packages/import-job/src/index.ts` for the TheCocktailDB catalog, `packages/import-job/src/importCustomRecipes.ts` for custom recipes), so every newly imported or renamed ingredient gets classified on the next import run, satisfies **AC-9**.
4. [x] Write the one time backfill script (mirroring spec 0020's translation backfill) to classify the 293 existing ingredients, satisfies **AC-9**. `packages/shared/scripts/classify-ingredients.ts`, run via `pnpm classify-ingredients` (`--all` to reclassify every row).
5. [x] Write the batch computation functions in `packages/shared` (scaling, scope/selection filtering, the dilution alcohol base computed from the post filter scope, a `liter` case added to the existing unit conversion math, one rounding pass at final display per the batch specific rules above), pure and side effect free, carrying every intermediate value in unrounded milliliters per the line state matrix and key invariants, satisfies **AC-2**, **AC-3**, **AC-4**, **AC-6**, **AC-7**, **AC-8**. `packages/shared/src/batch.ts`, 15 unit tests in `batch.test.ts`.
6. [x] Build the "Batch this recipe" panel on the recipe detail page (web and mobile): servings input (1 to 500, whole numbers, inline validation), scope picker (with the custom checkbox list, reset on scope re-entry), output unit picker (oz/ml/liter), dilution picker (with custom percent input and its 0 to 50 validation, and the "no alcohol in this batch" note when applicable), the batched ingredient list with unscaled/uncategorized flags per the line state matrix, and the total volume display; visible only when at least one ingredient is convertible, satisfies **AC-1**, **AC-3**, **AC-4**, **AC-5**, **AC-6**, **AC-7**, **AC-10**. `apps/web/src/recipes/batch-panel.tsx`, `apps/mobile/src/recipes/batch-panel.tsx`.
7. [ ] Run the classification backfill script once against the live catalog, satisfies **AC-9**. Not yet run in this environment: needs `ANTHROPIC_API_KEY`/`SUPABASE_SERVICE_ROLE_KEY` set locally by the engineer (no MCP tool exposes the real service role key here, the same constraint spec 0020's backfill hit).

## Consequences

**Positive**:
- Bartenders get a real batching tool built entirely on data the app already has (spec 0021's parsed amounts), with no new backend surface beyond one column and one read field.
- Ingredient category is durable and reusable by any future feature that needs to reason about ingredient type (browse filters, recommendations), not a one off computation.

**Negative / tradeoffs**:
- Batching accuracy is capped by spec 0021's parsing coverage: a recipe with many unparseable lines produces a batch output that is mostly "not scaled" flags, which is correct behavior but limited value until the parser improves.
- Alcohol only / except citrus presets are only as accurate as the Haiku classification call; a misclassified ingredient (e.g. an unusual liqueur name) shows up in the wrong scope until corrected. No manual override UI is included in this spec.

**Neutral**:
- Dilution water is computed from whichever spirit/liqueur lines are actually present after scope and custom selection filtering, never from the full recipe's alcohol content regardless of exclusions; if a bartender expects "20% of the total" rather than "20% of the currently included alcohol," this is a deliberate, documented choice, not an oversight, and a batch with no alcohol in scope simply gets no water line.
- Batch display uses its own rounding rules (decimal oz to the nearest tenth, ml to the nearest tenth, liters to the nearest hundredth), not spec 0021's per serving oz fraction formatting; batch quantities are large enough that a fraction reads worse than a decimal.
- The custom dilution bound (0 to 50%) and the servings bound (1 to 500) are product guardrails, not physical limits; both can be loosened later without a schema change.

## Follow-up

- [ ] No manual override exists yet for a misclassified ingredient's category; if classification errors turn out to be common, a follow up feature could let an engineer or bartender correct a category directly.
- [ ] `amount_max_value` (added in spec 0021, currently always null) is still unused; batching a range measure ("1 to 2 oz") is out of scope here, same as spec 0021's own toggle.
