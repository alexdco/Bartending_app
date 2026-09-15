# 0021. Recipe ingredient unit conversion — rationale

See [index.md](index.md) for the build spec (requirements, decision, feature design, build plan).

## Context

The recipe catalog (spec [0002](../0002-data-model.md)) stores each ingredient line's amount as `recipe_ingredients.measure`, a free text field copied directly from TheCocktailDB's `strMeasureN` fields (e.g. "1 1/2 oz", "2 Dashes", "1"), or hand typed the same way for custom recipes (`packages/import-job/src/customRecipes.json`, inserted via the `import_custom_recipes` database function). Both web (`apps/web/src/recipes/ingredient-list.tsx`) and mobile (`apps/mobile/src/recipes/ingredient-list.tsx`) render this text as is, unchanged, next to the ingredient name.

Since spec [0020](../0020-multi-language-support/index.md), a locale can also have a translated `measure` string in `recipe_ingredient_translations`, and the detail read already returns `coalesce(translated measure, canonical measure)` to the client. Any conversion feature has to decide whether it parses the canonical English text or a translated string that may not exist for every locale.

The scope's acceptance line for this feature asks for a toggle on the recipe detail page that switches every measured ingredient amount between oz, ml, and cl, rounded to the nearest tenth. A plain text field cannot support that: there is no number to convert, and no unit to know it is being converted from. The measure text is also inconsistent: some lines are a clean number plus unit ("2 oz"), some are counts with a non volume unit ("2 Dashes", "1 sprig"), and some are vague phrases with no number at all ("a splash", "to taste"). Any conversion feature has to draw a real line between what can be safely converted and what cannot, and be honest with the user about the difference rather than guessing.

## Options considered

### Option 1: Parse into structured columns at import time, convert client side (chosen)

The import job parses `measure` into a numeric amount and a recognized unit once, when a recipe is imported or reimported, and stores the result alongside the original text. The recipe detail page reads the structured value and does the oz/ml/cl math as a pure function in `packages/shared`, run again each time the user toggles.

**Pros**:
- Matches the project's existing pattern (spec [0002](../0002-data-model.md)) of normalizing TheCocktailDB's messy text once at import, not on every read.
- Query and render logic stay simple: the client already has a clean number and unit, no parsing at request time.
- Conversion math is a pure function with no side effects, fitting the "functional and immutable by default" rule in `AGENTS.md`.

**Cons**:
- Needs a schema migration and an import job change before any UI work can start.
- A parser bug found after launch needs a reimport to fix existing rows, not just a code deploy.

### Option 2: Parse on the fly at render time

Keep `measure` as the only stored field; parse it into a number and unit inside the web and mobile apps (or an edge function) each time a recipe detail page renders.

**Pros**:
- No migration or import job change needed to ship the first version.

**Cons**:
- The same fragile parsing logic must be written and kept in sync in both apps (or behind an extra network call to an edge function), duplicating logic the project's own rules say should live once in `packages/shared`.
- Re parses the same text on every page view instead of once at import, wasted work for a value that never changes between imports.

### Option 3: Re author all measures by hand into structured data

Manually type a number and unit for every ingredient line across the whole imported catalog, bypassing parsing.

**Pros**:
- No parser to build or get wrong; every value is exactly correct as entered.

**Cons**:
- A large one time manual effort across the full catalog, and it has to be repeated (or the catalog frozen) every time TheCocktailDB reimports, since spec [0002](../0002-data-model.md)'s reconciliation pass expects the import job, not a human, to keep the catalog in sync.

## Rationale

The project already treats the import job as the one place that turns TheCocktailDB's messy per recipe text into clean, canonical data (spec [0002](../0002-data-model.md) does exactly this for ingredient names via `normalized_name`). Parsing `measure` the same way, once, at import, keeps that pattern intact and keeps both apps free of duplicated parsing logic, per the shared package rule in `AGENTS.md` ("non UI logic lives once in `packages/shared`, imported by both apps"). Doing the actual oz/ml/cl math client side, not server side, avoids a network round trip on every toggle and keeps the conversion a pure function, matching the project's functional, side effect free convention.

Re authoring the catalog by hand (Option 3) does not survive the project's own reimport model: spec 0002's reconciliation pass already assumes the import job, run unattended, is the source of truth for the catalog, so a manual data entry step would either block that automation or drift out of sync with it immediately.
