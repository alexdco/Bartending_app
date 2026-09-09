# 0015. Recipe favoriting — rationale

## Context

The `favorites` table (spec 0002) has existed since the data model was designed, with row level security (a Postgres feature restricting which rows a query can see or change) already scoping it to the requesting user, but no feature has ever read or written it. Two later specs surfaced this as a real gap rather than a hypothetical one: spec 0009 (recipe recommendations) dropped favorites from its scoring signal set specifically because favoriting did not exist yet, and spec 0013 (basic product analytics) deferred a `recipe_favorited` event for the same reason. Both left an explicit Follow-up item pointing back here.

The consequence of not building this is that two shipped features (recommendations, analytics) stay permanently short of a signal the product was always meant to have, and users have no way to keep a personal list of drinks they like across sessions, beyond what their pantry or recent views happen to capture.

Every screen this touches already assumes a live session (anonymous or signed in) per spec 0005/0008's bootstrap, so this feature adds no new session handling of its own; it reuses the pantry mutation pattern (optimistic update, rollback on error, query invalidation) already proven in production.

## Options considered

### Option 1: Bulk favorited-IDs fetch, cross-referenced client side; extend `recommend_recipes`

Add a shared `favorites.ts` (fetch the current user's favorited recipe IDs in one call, add, remove), a `useFavoriteRecipeIds()` query hook that each list screen fetches once and cross-references per card, and a `useFavoriteRecipes()` paginated hook for the dedicated list page. Extend `fetchRecipeDetail` to include the single recipe's favorited state in its existing query. Migrate `recommend_recipes` to add the favorites weight and exclusion (AC-7).

**Pros**:
- No change to `search_recipes`, `match_recipes_to_pantry`, or `popular_recipes_by_region`; a user's favorited set is small and naturally cacheable, so one bulk fetch per list is cheap and keeps those four functions focused on their own concern.
- Reuses the exact mutation and hook pattern already proven for pantry (optimistic update, rollback, invalidation), so there is no new pattern to learn or maintain.
- Closes spec 0009's Follow-up completely in one pass instead of leaving it open again.

**Cons**:
- A card needs two pieces of client state (the list's own rows, plus the separate favorited-IDs set) instead of one flat row shape; a missed invalidation between the two could show a stale favorite icon for a moment.
- `recommend_recipes` grows a third weighted signal and a new exclusion clause, adding to the SQL surface spec 0009 already flagged as "more to keep consistent" if the scoring approach changes later.

### Option 2: Add `is_favorited` to every list-returning function

Modify `search_recipes`, `match_recipes_to_pantry`, `recommend_recipes`, and `popular_recipes_by_region` to each `LEFT JOIN favorites` and return an `is_favorited` boolean per row, so every card gets its state from the same query that fetched the row.

**Pros**:
- One flat shape per row; no second query or client side cross-referencing to keep in sync.

**Cons**:
- Four Postgres functions touched instead of one, each needing a new join and a regenerated return type, for data (a user's own favorited set) that is naturally small and does not need to be joined per row across four different query shapes.
- Couples every future list-returning function to the favorites table forever; a fifth list feature would need the same join repeated again.

**This option is not chosen.** The favorited set is a small, personal, frequently-reused piece of state; fetching it once per screen and cross-referencing client side (Option 1) is simpler and touches far less SQL surface for the same result.

## Rationale

The deciding force is the shape of the favorited set itself: it belongs to one user, stays small in practice, and is reused across every list screen in the app (search, drink ideas, popular, recommendations, and the new favorites list). Fetching it once per screen and cross-referencing client side (Option 1) matches how the app already treats pantry, another small per-user set consulted across multiple screens without being joined into every query that touches a recipe.

Extending `recommend_recipes` (AC-7) is not a new decision, it directly executes spec 0009's own Follow-up, which already named the shape of the change (a scoring weight and an exclusion) and left only the exact weight open, now set to `0.75`, between pantry's `1.0` (the strongest signal: ingredients the user actually owns) and recently viewed's `0.5` (the weakest: passive browsing). Favoriting sits between the two: a deliberate signal of taste, stronger than a passive view, weaker than "I have this in my kitchen right now."
