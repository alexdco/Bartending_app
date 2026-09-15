# 0021. Recipe ingredient unit conversion

**Date**: 2026-09-14
**Status**: In Progress

## Summary

Right now, every ingredient amount on a recipe page (like "1 1/2 oz") is just plain text copied from the source data, so it can never change format. This decision adds a one time parsing step during recipe import that pulls the number and unit out of that text (when possible) and stores them separately. The recipe detail page then gets a toggle to switch all ingredient amounts between ounces, milliliters, and centiliters, doing the math live in the browser or app. Amounts that cannot be understood as a number plus a unit (like "2 Dashes" or "a splash") always show their original text, unaffected by the toggle.

See [rationale.md](rationale.md) for context, options considered, and the reasoning behind the decision.

## Requirements

**User stories**:
- As a home bartender viewing a recipe, I want to switch ingredient amounts to the unit I measure in (oz, ml, or cl), so I don't have to convert them myself.

**Acceptance criteria** (the contract, each criterion is IDed and independently checkable):
- **AC-1**: A recipe detail page with at least one convertible ingredient shows a single oz / ml / cl toggle; switching it updates every convertible ingredient's displayed amount on that page.
- **AC-2**: A converted amount in ml or cl is shown as a decimal number rounded to the nearest tenth (e.g. "44.4 ml"). An amount in oz is shown in its original form (fraction or decimal, as parsed), never converted to decimal when oz is the selected unit.
- **AC-3**: An ingredient line whose measure text cannot be parsed into a single number plus a convertible unit (no number present, a range, or a non volume unit such as "Dashes", "sprig", "wedge") always renders its original `measure` text unchanged, regardless of the selected unit.
- **AC-4**: The toggle defaults to oz on first load of a recipe detail page, every time (no persistence across visits or recipes).
- **AC-5**: The import job (TheCocktailDB catalog and custom recipes alike) parses each ingredient's canonical (English) measure text into a structured amount and unit at import/reimport time; a value that fails to parse leaves the structured fields null with no error raised, and `measure` itself is never modified.
- **AC-6**: Re running the import job re parses every ingredient line's measure text and overwrites the previously stored structured amount and unit (so a parser fix or a source data change is reflected on the next scheduled reimport, with no manual backfill step).
- **AC-7**: A translated (non English) recipe detail view still supports the unit toggle and shows the same converted numbers as the English view; only the unit word (oz/ml/cl) is localized, never re parsed from the translated measure text.

## Decision

**Chosen option**: Option 1: Parse into structured columns at import time, convert client side. See [rationale.md](rationale.md) for the options considered and why.

## Feature design

**Data model sketch**:

`recipe_ingredients` (existing table, three new nullable columns, no other table changes):

| Column | Type | Nullable | Notes |
|---|---|---|---|
| `measure` | text | yes (existing) | Unchanged. Always the display fallback and the input to (re)parsing. |
| `amount_value` | numeric | yes (new) | The parsed leading number (e.g. `1.5` for "1 1/2 oz"). Null if unparseable. |
| `amount_unit` | text | yes (new) | One of `oz`, `ml`, `cl`, `tsp`, `tbsp`, `cup`, constrained by a `check` constraint. Null if unparseable or no recognized unit. |
| `amount_max_value` | numeric | yes (new) | Reserved for a future range feature (e.g. "1 to 2 oz"); always null under this spec, since AC-3 treats any range as unparseable. |

All three new columns null on a row means the parser could not extract a number plus a recognized unit from `measure`; the client renders `measure` as is and that line ignores the toggle (AC-3).

**Value sourcing**:
| Action | Value produced / displayed | Source |
|---|---|---|
| Import a TheCocktailDB recipe | `amount_value`, `amount_unit` | Parsed from the canonical `measure` by a new pure parsing function in `packages/shared`, run in `packages/import-job/src/transform.ts` |
| Import a custom recipe | `amount_value`, `amount_unit` | Parsed the same way in `packages/import-job/src/importCustomRecipes.ts` before calling `import_custom_recipes`; the two new fields are added to that function's JSON ingredient payload and written by its `insert` |
| Recipe detail page render (any locale) | Ingredient amount text | The already coalesced `measure` text (fallback, translated where available), or `amount_value` + `amount_unit` converted to the currently selected toggle unit when both are non null; parsing is never re run per locale (AC-7) |
| Toggle a unit | Converted amount per ingredient | Computed client side by a pure conversion function in `packages/shared`, from `amount_value`/`amount_unit` and the selected target unit; no network call. Always converts from the stored source value directly, never by re deriving one displayed unit from another already rounded one |
| Toggle default | Initially selected unit | Always `oz`, a client side constant, per AC-4 (no persistence) |
| Toggle visibility | Whether the toggle renders at all | At least one ingredient line on the page has non null `amount_value`/`amount_unit`; a recipe with zero convertible lines shows no toggle |
| oz display, when oz is selected | The oz text shown per line | For a line whose `amount_unit` is `oz`: the original `measure` text verbatim (preserves "1 1/2" exactly). For any other source unit converted into oz: `amount_value` converted to oz then formatted as a fraction rounded to the nearest eighth by one shared `formatOunces` function in `packages/shared`, never re parsed from `measure` |
| Unit word, per locale | The localized label for "oz"/"ml"/"cl" | A small fixed lookup table in `packages/shared`, keyed by locale, alongside the existing locale infrastructure from spec 0020; not machine translated |

**Key invariants**:
- `amount_value` and `amount_unit` are both null or both non null together; never one without the other.
- `amount_unit`, when set, is one of the fixed set `oz`, `ml`, `cl`, `tsp`, `tbsp`, `cup` (enforced by a `check` constraint); all six are volume units and all six convert into whichever of oz/ml/cl is the current toggle selection (not only oz sourced rows).
- `measure` (and its per locale translations in `recipe_ingredient_translations`) are never rewritten by the parser; parsing always reads the canonical English `measure`, never a translated string.
- The conversion function and the parsing function are pure: same input always produces the same output, no I/O.
- A conversion always starts from the stored `amount_value`/`amount_unit`, never from a previously displayed, already rounded number; this is what keeps toggling oz to ml and back lossless for the oz display.

**Parsing and formatting rules** (fixed here so the parser and formatter are unambiguous, not left for the build to invent):
- Recognized numeric forms: a plain integer or decimal (`2`, `1.5`), a mixed fraction with a space (`1 1/2`), a bare fraction (`3/4`), or a unicode fraction glyph (`1½`). A number with no unit word following it (e.g. a bare "1") does not parse; both `amount_value` and `amount_unit` stay null.
- Recognized unit spellings, case insensitive, mapped to the fixed set `oz`, `ml`, `cl`, `tsp`, `tbsp`, `cup`: `oz`/`oz.`/`ounce`/`ounces`/`fl oz`, `ml`/`mL`/`milliliter(s)`/`millilitre(s)`, `cl`/`centiliter(s)`/`centilitre(s)`, `tsp`/`teaspoon(s)`, `tbsp`/`tablespoon(s)`, `cup`/`cups`.
- A range ("1 to 2 oz", "1-2 oz") never parses, per AC-3; both fields stay null.
- Conversion constant: 1 US fluid ounce = 29.5735 ml; 1 ml = 0.1 cl.
- Rounding for ml/cl: `Math.round(value * 10) / 10`, trailing `.0` trimmed for display (e.g. `44` not `44.0`; `44.4` stays `44.4`).
- oz display formatting (`formatOunces`, used only for a non oz sourced line converted into oz): round to the nearest eighth, render as a mixed number with a space (`1 1/2`, not `1.5`); a value with no fractional remainder after rounding renders as a bare integer (`2`, not `2 0/8`).
- Unit label rendering: lowercase, a single space between the number and the unit (`1.5 oz`, `44.4 ml`).

**Security model**:
No change. The new columns live on `recipe_ingredients`, already public read data under spec 0002's row level security policy (open `SELECT` to `anon`/`authenticated`, writes only via the import job's service role key). No new access path is introduced.

**Critical test scenarios**:
- Happy path: open a recipe whose ingredients are all in oz, toggle to ml, every amount updates to the correct rounded value, toggle back to oz, values return to their exact original text, verifies **AC-1**, **AC-2**, **AC-4**.
- Mixed line: a recipe with one parseable ingredient ("2 oz") and one unparseable ingredient ("2 Dashes bitters"); toggling the unit changes only the first line's displayed amount, the second stays "2 Dashes bitters" throughout, verifies **AC-3**.
- Non oz source unit: an ingredient parsed as `1 tsp` toggled to ml and to oz both produce correctly converted, correctly formatted values (oz shown as a fraction via `formatOunces`, not re derived from a rounded ml figure), verifies **AC-2**.
- Import idempotency, catalog path: run the import job twice against the same TheCocktailDB source data; `amount_value`/`amount_unit` are identical after both runs, and a manually corrupted value on an existing row is overwritten back to the parsed result on the second run (the upsert's `on conflict do update` actually fires), verifies **AC-5**, **AC-6**.
- Import idempotency, custom recipes path: re running `import_custom_recipes` against the same `customRecipes.json` produces the same `amount_value`/`amount_unit` as the first run, verifies **AC-5**, **AC-6**.
- Localized detail view: opening the same recipe in a non English locale shows the translated measure text when the toggle is off, and the same converted numbers as the English view when a unit is selected, with only the unit word localized, verifies **AC-7**.

## Build plan

1. [x] Add the migration: `amount_value` (numeric, nullable), `amount_unit` (text, nullable, `check` constrained to the fixed unit set), `amount_max_value` (numeric, nullable, reserved/unused) on `recipe_ingredients`; change the two existing upsert paths' conflict handling on `recipe_ingredients` (the catalog reconciliation upsert and the `import_custom_recipes` function's insert) from `on conflict do nothing` to `on conflict do update` on `measure`, `amount_value`, `amount_unit` so a reimport actually overwrites stale structured values. All three new columns start null for every existing row until the next import run backfills them, satisfies **AC-5**, **AC-6**. — `supabase/migrations/20260914000000_recipe_ingredient_unit_conversion.sql`, applied live to the `BartendingAppWeb` project (ctuzjhhpnkkhooneporu) and confirmed via schema introspection.
2. [x] Write the measure parsing function in `packages/shared` (plain text in, `{ value, unit } | null` out), following the parsing rules fixed above: recognizes a single leading number (integer, decimal, mixed or bare fraction) followed by one of the six convertible units including their spelling variants, returns null for anything else (no number, a range, a non volume unit, a vague phrase), satisfies **AC-3**, **AC-5**. — `packages/shared/src/units.ts` (`parseMeasure`), sanity checked against the spec's own examples (all passed, scratch test removed after verifying)
3. [x] Wire the parsing function into both import call sites: `packages/import-job/src/transform.ts` for the TheCocktailDB catalog source, and `packages/import-job/src/importCustomRecipes.ts` for custom recipes (parsed in TypeScript before calling `import_custom_recipes`; extend that function's JSON ingredient payload and its `insert` to accept and write `amount_value`/`amount_unit`). Both call sites parse only the canonical English `measure`, never a translated string, satisfies **AC-5**, **AC-6**, **AC-7**. — `packages/import-job/src/transform.ts`, `packages/import-job/src/importCustomRecipes.ts`, `packages/import-job/src/index.ts`
4. [x] Write the oz/ml/cl conversion function and the `formatOunces` fraction formatter in `packages/shared` (amount + source unit + target unit in, converted number out; ml/cl round to the nearest tenth per the rounding rule above, oz renders via `formatOunces` unless the source unit is already oz, in which case the original `measure` text is used verbatim), plus the per locale unit word lookup table, satisfies **AC-2**, **AC-7**. — `packages/shared/src/units.ts` (`convertAmount`, `formatOunces`, `formatConvertedAmount`, `UNIT_LABELS`/`unitLabel`)
5. [x] Add the unit toggle control and wire it into `apps/web/src/recipes/ingredient-list.tsx` and `apps/mobile/src/recipes/ingredient-list.tsx`: render only when at least one ingredient line is convertible, default to oz on mount, convert each ingredient's displayed amount through the shared conversion function when `amount_value`/`amount_unit` are present, fall back to the already coalesced (possibly translated) `measure` text otherwise, satisfies **AC-1**, **AC-3**, **AC-4**, **AC-7**. — both apps' `ingredient-list.tsx`, toggle built from the existing `Chip` component (mirroring the `PopularRegionPicker` single-select group pattern), `fetch_recipe_detail` extended in the same migration to surface `amount_value`/`amount_unit` alongside `measure`, `RecipeIngredientDetail`/`fetchRecipeDetail` updated in `packages/shared/src/recipes.ts`
6. [x] Run the import job once against the live catalog (a normal scheduled import run, not a special backfill mode) to populate `amount_value`/`amount_unit` for all existing recipes, satisfies **AC-5**. — migration applied live to `BartendingAppWeb` (ctuzjhhpnkkhooneporu); schema confirmed live via introspection (`amount_value`/`amount_unit`/`amount_max_value` present, check constraint in place); security advisors clean (only pre-existing findings); `pnpm --filter @bartendingapp/import-job import` run against the live TheCocktailDB catalog (426 recipes, 841 of 1665 `recipe_ingredients` rows parsed into structured amounts, the rest correctly left null for non volume units/vague phrases/bare numbers per spot check) and `pnpm --filter @bartendingapp/import-job import:custom` run against `customRecipes.json` (both custom recipes parsed correctly, "2 Dashes" correctly left unparsed). Also fixed along the way: `@bartendingapp/shared`'s barrel `export *` chain doesn't resolve named value exports at runtime under this environment's tsx/Node version (a pre-existing gap, not introduced by this spec — `catalog-translation` already worked around it the same way); added a `./units` subpath export to `packages/shared/package.json` and pointed `transform.ts`/`importCustomRecipes.ts` at `@bartendingapp/shared/units` instead of the barrel. Also fixed a pre-existing, unrelated invalid JSON entry in `customRecipes.json` (an in-progress "Adonis" recipe whose `instructions` field had an unescaped literal newline), with the engineer's confirmation, by writing the intended instructions text as a properly escaped string.

## Consequences

**Positive**:
- Ingredient amounts become genuinely convertible, not just displayed text, without duplicating parsing logic between web and mobile.
- A future parser improvement (a new unit spelling, a bug fix) reaches every existing recipe automatically on the next scheduled reimport, no manual backfill script needed.

**Negative / tradeoffs**:
- Any recipe not yet reimported after this ships shows no conversion (all three new columns null) until the backfill run in Build plan step 6 completes.
- The parser will not catch every real world phrasing on the first pass; some genuinely convertible measures will render as unparseable text until the parser is tuned, a known and accepted gap rather than a blocking one (AC-3 makes this the safe default).

**Neutral**:
- Ranges ("1 to 2 oz") are explicitly out of scope for conversion; `amount_max_value` exists in the schema for a possible future range feature but is unused and always null under this spec.
- A translated (non English) recipe never gets its own independently parsed amount; the number always comes from the canonical English `measure`, and only the unit word is localized. If a translator ever needs to write a genuinely different number for a locale, that is out of scope here.

## Follow-up

- [ ] If range conversion becomes a real user request later, `amount_max_value` is already in the schema; only the parser and the conversion function need extending, no new migration.

## Migration plan

**Strategy**: No migration needed for existing user data (guest and signed in pantry/favorites reference `ingredients`, not `recipe_ingredients`, so nothing user owned is touched). The migration itself is additive only: three new nullable columns with no default and no backfill required before deploy.

**Phases**:
1. Deploy the schema migration: the three new nullable columns, plus the `on conflict do update` change to the catalog reconciliation upsert and to `import_custom_recipes` (no constraint that could fail against existing rows).
2. Deploy the import job change (parsing wired into `transform.ts` and `importCustomRecipes.ts`).
3. Run the import job once (a normal scheduled run) to populate existing recipes (Build plan step 6).
4. Deploy the web and mobile toggle UI, which already tolerates null `amount_value`/`amount_unit` by falling back to `measure` text, so it is safe to ship before or after step 3 completes.

**Rollback**: Each phase reverts independently: the UI falling back to plain text is always safe to ship or roll back on its own; the import job change can be reverted without affecting already stored data; the migration can be reverted by dropping the three new columns, since nothing else depends on them yet.

**Risks**: A parser bug that silently mis converts a value (rather than failing to parse) would show a wrong number instead of falling back to text; mitigated by the critical test scenarios above covering both the happy path and the mixed parseable/unparseable case before shipping.
