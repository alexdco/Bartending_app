# 0022 · Rationale

## Context

Spec 0021 gave every parseable ingredient line a structured amount and unit (`amount_value`, `amount_unit` on `recipe_ingredients`) and pure oz/ml/cl conversion math in `packages/shared/src/units.ts`. That work solved single serving unit display. A bartender preparing for an event does a different job: they need one recipe turned into a large batch (a fixed multiple of servings), usually diluted with water to approximate the ice melt a shaken or stirred drink gets when made to order, and often split by ingredient type (all the alcohol pre batched, citrus kept separate since it degrades and is normally added fresh).

None of that math or ingredient classification exists yet. Scaling is simple multiplication once a serving count is set, but classifying an ingredient as alcohol, citrus, or neither has no existing data to draw on: the `ingredients` table has no category field. Dilution needs a fixed, explicit rule (what percentage of what volume the added water represents) or two bartenders reading "20% dilution" will expect different numbers. And because batch quantities can run into hundreds of ounces or several liters, the existing per serving rounding rules (nearest tenth for ml/cl, nearest eighth for oz) need to be confirmed as still appropriate, not assumed.

## Options considered

### Option 1: Client side batch calculator on the recipe detail page, ingredient category stored on `ingredients`

Add a `category` column to `ingredients`, populated by the import job via a cached Haiku call (mirroring spec 0020's translation pattern). Add a batch panel to the recipe detail page that reuses spec 0021's already loaded `amount_value`/`amount_unit`/`unit conversion` functions, doing all scaling, scoping, and dilution math client side in `packages/shared`.

**Pros**:
- No new network round trip for the actual batch math; instant feedback as the bartender adjusts servings, scope, or dilution.
- Reuses spec 0021's conversion functions and parsed data directly; no duplicate parsing or a second data pipeline.
- Ingredient category is a durable, reusable property (available to any future feature, e.g. a "spirits only" filter), not a one off computation.

**Cons**:
- Requires a schema migration and a one time classification backfill before the alcohol/citrus presets work correctly on existing recipes.
- Client side classification-driven filtering means the category values ship to the browser; not a concern here (they're already public recipe data) but worth naming.

### Option 2: Server side batch endpoint (a Postgres function or Edge Function) computing the batch on each change

Every serving count, scope, or dilution change calls a Supabase RPC that returns the computed batch.

**Pros**:
- Centralizes the math in one place shared identically by web and mobile without duplicating the calculation in two client codebases.
- Keeps the client thin.

**Cons**:
- Adds a network round trip (and loading state) to every slider or dropdown change on what is fundamentally simple multiplication and unit conversion; a worse interactive experience for no correctness benefit, since the same pure functions in `packages/shared` are already usable from both web and mobile without a server hop.
- No new I/O or side effect is actually needed; this contradicts the project's own "side effects pushed to the edges" rule for a computation that has none.

### Option 3: Keyword based ingredient classification at batch time, no schema change

Classify "alcohol" and "citrus" on the fly by matching ingredient names against a fixed keyword list, computed each time the batch panel runs, no new column.

**Pros**:
- No migration, no backfill script, ships faster.

**Cons**:
- Fragile: a keyword list misses real world naming variety ("Blanco tequila", "aged rum", "yuzu") and needs constant manual upkeep as new ingredients are added to the catalog.
- Duplicates classification logic if any future feature also needs an ingredient's category (recommendation filters, a "spirits" browse page); a stored column is the reusable version of the same information.

**A considered hybrid, rejected**: TheCocktailDB's own source data carries a per ingredient alcoholic boolean the import job already reads (`toAlcoholicStatus` in `transform.ts`, currently used for the recipe level `alcoholicStatus`, not per ingredient), which could seed the spirit/liqueur split cheaply for catalog ingredients. This is deliberately not used here: it only covers catalog recipes (custom recipes have no equivalent signal), and introducing a second, inconsistent classification path for the same column is worse than one Haiku call applied uniformly to both import sources. At 293 existing ingredients plus a slow trickle of new ones, the Haiku cost is small enough that the consistency is worth more than the savings.

## Rationale

The batch math itself (multiply, convert, round) has no side effects and nothing to fail over the network, so per the project's functional/immutable rule it belongs in `packages/shared` as pure functions, run client side, exactly like spec 0021's conversion functions. A server round trip (Option 2) would add latency and a loading state to what should feel like a live calculator, for a computation that is deterministic and cheap.

Ingredient category (Option 1 vs Option 3) is a property of the ingredient itself, not of a single batch calculation, so it belongs stored on `ingredients` and computed once, the same reasoning spec 0020 already applied to catalog translation: classify once at import time, cache the result, only redo it when the source name changes. A keyword list (Option 3) is cheaper to ship but degrades silently as new ingredients are added; the project already has a working Haiku-in-the-import-job pattern (`translateCatalog`), so reusing it costs little extra and produces a durable, reusable column instead of throwaway logic duplicated wherever ingredient type matters next.

Spec 0021's per serving rounding rules (nearest eighth for oz, nearest tenth for ml/cl) do not carry over unchanged to batch quantities: a 500 serving batch rendering "312 3/8 oz" is spurious precision that reads worse than at single serving scale, and a fraction is harder to measure at that volume besides. This spec deliberately defines batch specific display rules (decimal oz to the nearest tenth, ml to the nearest tenth, liters to the nearest hundredth, see Feature design) rather than reusing spec 0021's oz fraction formatting for batch output.
