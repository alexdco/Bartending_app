# 0009. Recipe recommendations — rationale

## Context

The scope for this slice asks for rules based "you may also like" suggestions using pantry contents, favorites, and recently viewed recipes, working for guests (no account) as well as signed in users. `pantry_items` (spec 0002's data model, read through the requesting session via row level security, a Postgres feature that restricts which rows a query can see) and `match_recipes_to_pantry` (spec 0006, the existing function that ranks recipes by shared ingredients with the pantry) already exist and this feature builds directly on both.

> ⚠️ Premise note: the scope wording also names favorites as a signal, but no favoriting feature exists yet anywhere in the app (no UI control, no mutation hook, no writes to the `favorites` table spec 0002 created). Building AC's around a signal the codebase cannot yet produce would leave three acceptance criteria unbuildable. This spec narrows to pantry contents and recently viewed recipes only; favoriting as a signal is called out in Follow-up as a prerequisite for a later revision of this feature, once favoriting itself ships.

Recently viewed recipes have no server side representation anywhere in the app today; nothing tracks them yet. Guests keep their whole experience on device (spec 0001, spec 0005), so a mechanism that works without an account has to exist regardless of what a signed in user later gets.

`recipe_tags` (spec 0002) exists in the schema but is populated by a tagging process the project has explicitly deferred to a later feature; most recipes carry no tags today. A recommendation signal that depends on tags would rank on mostly empty data right now. Spec 0002 also flagged that no real popularity signal exists yet ("spec 0001 defers popularity to usage data"); this spec's cold start fallback has to work with that gap, not around it.

## Options considered

### Option 1: New Postgres function scoring by ingredient overlap (recommended)

A `recommend_recipes` function, modeled on `match_recipes_to_pantry`, reads the requesting session's `pantry_items` server side, takes recently viewed recipe IDs as a parameter (since those have no server representation), and scores candidate recipes by shared ingredients with the union of those signals.

**Pros**:
- Reuses a pattern the codebase already has and the team already understands (spec 0006).
- Scoring happens where the ingredient graph already lives; no need to ship it to the client.
- Consistent RLS story: pantry stays session scoped exactly like every other read of it.

**Cons**:
- Another SQL function to maintain alongside `match_recipes_to_pantry`; some overlap in shape between the two, though the ranking goal differs (near matches to cook now, vs. broad similarity).

### Option 2: Relax `match_recipes_to_pantry` into a shared function

Extend `match_recipes_to_pantry` itself with a relaxed `max_ratio` parameter (e.g. 0.6 missing ratio) and a widened signal set (pantry plus recently viewed ingredients), rather than writing a second function. Spec 0006's own Follow-up flags this as worth considering.

**Pros**:
- One function to maintain instead of two with a similar shape.
- No new SQL to write and verify from scratch.

**Cons**:
- `match_recipes_to_pantry`'s contract (spec 0006) is "can make now or close to it," returning `missing_ingredient_ids`; broadening it to a general similarity ranking changes its meaning for its existing caller (the drink ideas screen) and risks a behavior change there. A dedicated function keeps each screen's contract stable and easier to reason about independently.

### Option 3: Client side scoring using data already fetched

Fetch candidate recipes and their ingredient lists, then score and sort in `packages/shared` as a pure function, similar in style to `matchPantryToRecipes`.

**Pros**:
- Keeps scoring logic in plain, easily unit tested TypeScript.

**Cons**:
- Requires pulling a much larger slice of the ingredient graph to the client to score against, growing with the catalog size; the existing pantry matching function avoids exactly this by scoring server side.

### Option 4: Tag based similarity (shared tags between recipes)

Score similarity by shared `recipe_tags` rather than shared ingredients.

**Pros**:
- Conceptually simple, "recipes with the same tags are similar."

**Cons**:
- `recipe_tags` is mostly unpopulated today (spec 0002's own follow up defers real tagging); ranking on it now would produce weak or empty results for most of the catalog.

## Rationale

Option 1 wins because it extends a pattern the project already runs in production (spec 0006's `match_recipes_to_pantry`), keeping ranking logic where the ingredient graph already lives and where RLS already scopes pantry correctly per session, without changing an existing function's contract (Option 2's risk to the drink ideas screen). Option 3 would work but reintroduces a data shipping problem the project deliberately avoided when it built pantry matching server side. Option 4 is ruled out for now not on principle but on data readiness: spec 0002 explicitly flagged `recipe_tags` as populated by a deferred tagging process, so a tag based signal would rank on near empty data until that process ships; ingredient overlap is the one signal that is fully populated today. Favorites is dropped from this revision's signal set entirely (see the Premise note in Context): the feature it would need does not exist yet, so scoring against it, excluding by it, or invalidating on it are all currently unbuildable.
