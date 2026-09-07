# 0006. Drink ideas from pantry — rationale

## Context

Spec 0005 (guest pantry) deliberately left recipe matching out of scope, and built a pure client side helper, `matchPantryToRecipes` in `packages/shared`, as a placeholder for the idea without committing to how matching would actually run at scale. That function assumes every recipe's ingredient list is already loaded on the client, which does not hold once matching runs against the full 426 recipe catalog (spec 0002) rather than a small pantry sized slice.

The forces at play: the match has to run against every recipe's ingredient list (`recipe_ingredients`, spec 0002) compared with the caller's own pantry (`pantry_items`, spec 0005), it has to avoid shipping that whole join set to every client on every visit, and it has to respect the same row level security isolation pantry data already has, so one user's match results can never leak from or depend on another user's pantry. The project already solved a shaped version of this problem twice, `search_recipes` and `search_ingredients` (specs 0004 and 0005), both Postgres functions that filter and rank server side and are granted to `anon`/`authenticated`. This feature follows that same shape rather than inventing a new one. At 426 recipes and roughly 4 ingredients each, computing every recipe's `missing_ratio` before ranking is cheap; this is not yet a performance sensitive path, and no index or query plan work is warranted until the catalog is materially larger than today's import.

## Options considered

### Option 1: One Postgres function call returning both sections, split client side

A single function mirroring `search_recipes`/`search_ingredients`: it joins `recipes`, `recipe_ingredients`, `ingredients`, and the caller's own `pantry_items` rows (found via `auth.uid()`, the same identity RLS already uses), computes each recipe's missing ingredients and ratio, and returns every recipe at or under the near match cutoff in one ranked, paginated result. The page splits that one result into "you can make now" (`missing_ratio = 0`) and "almost there" (everything else returned) client side.

**Pros**:
- One round trip, one query key, one pagination cursor; no risk of the same recipe being fetched twice or an exact match crowding a near match page out (the two sections share the same underlying ranked list, they just render into two buckets).
- Matching still runs once, in the database, next to the data it needs; no need to ship the whole `recipe_ingredients` join set (1662 rows and growing) to every client.
- Reuses the project's own established pattern (`search_recipes`, `search_ingredients`) instead of inventing a third way to expose search/filter logic.
- `auth.uid()` read internally means the client can never pass someone else's pantry, by mistake or on purpose; the isolation guarantee is structural, not something every caller has to get right (AC-9).

**Cons**:
- The two sections share one pagination cursor: "load more" advances both at once rather than letting a user page through "almost there" independently of "you can make now". Acceptable given most pantries will produce a modest combined result set.

### Option 2: Two separate function calls, one per section

Call the same kind of function twice, once with a cutoff of exactly `0` for exact matches and once with a cutoff of `0.25` for near matches, giving each section its own independent pagination.

**Pros**:
- Each section paginates independently; a user can page deep into "almost there" without it being coupled to how many exact matches exist.

**Cons**:
- The near match call's results overlap the exact match call's (every exact match also satisfies "at most 25% missing"), so the client must discard exact matches from the near match page after fetching it; a page can come back mostly overlap and render as a near empty section with a misleading "load more".
- Two round trips, two query keys to keep in sync on every pantry mutation, more surface for the two sections to disagree after a partial invalidation.

### Option 3: Fetch all recipes and their ingredients client side, run `matchPantryToRecipes` in memory

Keep using the existing pure function from spec 0005: load every recipe's `recipe_ingredients`, load the pantry, and run the match locally on each client.

**Pros**:
- Zero new backend work; the matching logic already exists and is already tested as a pure function.

**Cons**:
- Ships the full recipe to ingredient join set to every client on every visit, which does not scale past a small catalog and gets worse as more recipes are imported.
- Duplicates ranking/pagination logic on both mobile and web instead of once in the database, against `AGENTS.md`'s own rule against duplicating non UI logic (this pushes filtering logic into UI code instead of keeping it out).

## Rationale

The catalog is 426 recipes today and only grows with future imports; shipping every recipe's ingredient list to the client on every visit (Option 3) is the kind of unpaginated, unbounded read the project has already avoided twice by building `search_recipes` and `search_ingredients` instead. Between the two server side options, calling the function twice (Option 2) looks like it gives each section independent pagination, but the near match cutoff (`missing_ratio <= 0.25`) mathematically includes every exact match, so the near match call always needs its exact matches discarded client side, which skews pagination exactly when a pantry has several exact matches. One call (Option 1) removes that overlap entirely: the database returns one ranked, deduplicated list, and the client only needs to know where to draw the section boundary (`missing_ratio = 0`), not which rows to discard. This also settles AC-9 structurally: because the function finds the pantry itself rather than accepting it as a parameter, there is no path for a client to pass, or accidentally leak, another user's pantry contents into a match request. `matchPantryToRecipes` stays in `packages/shared`, unused by this feature; removing it is unrelated cleanup, not part of shipping drink ideas (see Consequences).
