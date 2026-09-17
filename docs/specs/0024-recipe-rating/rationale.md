# 0024. Recipe rating — Rationale

## Context

Spec 0009 built `recommend_recipes`, a Postgres function that ranks recipes by shared ingredients with a user's pantry (weight 1.0), favorited recipes (weight 0.75, added in a follow up migration), and recently viewed recipes (weight 0.5). All three signals are implicit: none of them asks the user directly whether they liked a recipe. There is currently no explicit taste signal anywhere in the schema.

Adding a 1 to 5 star rating gives users a direct way to say "I liked this" or "I did not," and gives the recommendation engine a stronger, more deliberate signal than the implicit ones it has today. The main forces at play: ratings must be easy to secure (who can rate what, once or many times), they must slot into the existing weighted ingredient overlap formula without a rewrite, and a low rating should not accidentally punish a whole ingredient family the user might still want to see.

## Options considered

### Option 1: New `ratings` table, blended into `recommend_recipes` as a weighted signal

Add a `public.ratings` table (one row per user per recipe) and extend `recommend_recipes` to pull a signed in user's own 4 and 5 star rated recipes into the same weighted ingredient overlap formula spec 0009 already uses, alongside pantry, favorites, and recently viewed.

**Pros**:
- Reuses the exact scoring shape spec 0009 already established (a weighted ingredient set, unioned across signals, `max` per ingredient); no new scoring model to learn or maintain.
- Small, additive migration: one new table, one `create or replace function`, no changes to existing tables or existing signals.
- Matches the existing RLS pattern for owned rows (`pantry_items`, `favorites`): `user_id references auth.users`, RLS scoped to `auth.uid()`.

**Cons**:
- A fourth weighted signal in one formula is one more thing to keep straight when reasoning about why a recipe was recommended (mitigated by keeping `score` in the RPC output for debugging, as spec 0009 already does).
- Average rating display and scoring both read the same table; a very active rater could make their own average rating query slightly more expensive as their rating count grows (not a concern at current catalog size, per spec 0009's own scale note).

### Option 2: Separate similarity score blended in via a weighted sum

Compute a second, independent score per candidate recipe based on similarity to the user's highly rated recipes (its own ingredient overlap pass), then blend it with the existing `recommend_recipes` score using a tunable blend weight (e.g. `0.7 * ingredient_score + 0.3 * rating_similarity_score`).

**Pros**:
- More tunable long term: the blend weight can be adjusted independently of the ingredient overlap formula's internal weights.
- Keeps the "the user liked this" signal conceptually separate from "the user has this" and "the user recently looked at this," which could make future debugging or A/B testing of the rating signal specifically easier.

**Cons**:
- Adds a second scoring pass and a new blend weight to define and justify now, for a benefit (independent tuning) nothing in the current requirements asks for.
- Diverges from spec 0009's established formula shape, so a future reader has two different scoring patterns to understand instead of one consistent one.

## Rationale

Option 1 wins because it is a straight extension of a formula that already works and that the team already understands: spec 0009's weighted ingredient union pattern was built exactly so a new signal source could be unioned in without restructuring the query, and the favorites follow up migration already proved that pattern out once. Option 2's independent tunability is a real advantage in the abstract, but nothing in this feature's requirements calls for tuning a blend weight yet, and a second scoring pass is a second thing that can silently drift out of sync with the first (two `deleted_at` filters, two exclusion lists, two orderings to keep matching). Following the boring, already proven pattern here keeps the one `recommend_recipes` function as the single place recommendation logic lives, which is the more maintainable choice for a team of this size.

The specific weight choice, 1.0 for 5 stars and 0.6 for 4 stars, places a 5 star rating (an explicit, deliberate "I liked this") on par with owning the ingredient (pantry, 1.0), the strongest existing signal, since a person choosing to rate something 5 stars is at least as strong a signal of future interest as merely having the ingredients on hand. A 4 star rating sits just above recently viewed (0.5) and just below favorites (0.75) at 0.6, reflecting that it is a real but softer endorsement than either a full favorite or a top rating. Ratings of 3 and below contribute zero weight rather than a negative one, per the explicit decision to never let one bad experience with a recipe suppress an entire ingredient family the user might still want to see; this mirrors spec 0009's own conservative stance on not over fitting to sparse signals.
