# 0023. Ranked search with bartender shorthand and ingredient list matching

## Summary

This is the search that powers the Service screen, the main way a bartender finds a recipe. It ranks a bar's own house recipes and menu first, then the bartender's personal pins and recent history, then exact name matches, then the wider public recipe catalog, and only then loose matches. It also understands two things plain substring search cannot: short bartender slang for a cocktail's name ("old f" for Old Fashioned), and a list of ingredients typed the way a bartender thinks about a drink ("gin campari vermouth" for Negroni).

## Requirements

**User stories**:
- As a bartender, I want to type a few letters of a cocktail's common nickname and see the right drink first, so I don't need to remember or type the full name.
- As a bartender, I want to type the ingredients a guest describes and see the cocktail they most likely mean, so I can serve them without guessing.
- As a bartender, I want my bar's own house recipes and tonight's menu to show up before anything else, so I never accidentally build the wrong (public) version of a drink my bar customizes.
- As a bartender, I want my pinned and recently viewed cocktails to surface quickly, so my personal shortlist is always close at hand.

**Acceptance criteria**:
- **AC-1**: Search results are ordered in these tiers, highest first, with no mixing across tiers: (1) the current bar's menu items, (2) the current bar's other house recipes (not on the menu), (3) the searching user's pinned cocktails, (4) the user's recently viewed cocktails, (5) exact catalog name matches, (6) other catalog matches (fuzzy name or trigram), (7) ingredient list / shorthand matches. Within a tier, results are ordered by the tier's own match quality score (named per tier below); ties broken by name ascending, then by `id`, so identical queries always return the same order. Each tier is capped at 10 results shown by default, with a "see more" affordance, so a large tier 6 cannot bury tier 7 off screen.
- **AC-2**: A known common abbreviation or nickname for a cocktail (e.g. "old f", "marg", "esp mart") returns that cocktail as a top result even though it shares no full word with the cocktail's name.
- **AC-3**: A space separated list of ingredient names (e.g. "gin campari vermouth", "bourbon aperol nonino lemon") returns the cocktail whose ingredient list best matches, ranked by a single combined overlap score (formula named below).
- **AC-4**: Search works with no bar membership; in that case tiers 1 and 2 (house/menu) are simply absent, not errored.
- **AC-5**: A query that is not a recognized shorthand and does not resolve as an ingredient list still falls back to today's existing name/trigram search, so no query returns zero results where the old search would have returned something.
- **AC-6**: "Exact catalog name match" (tier 5) means the query, trimmed and case folded, equals the recipe's name trimmed and case folded, ignoring punctuation differences (e.g. "old fashioned" matches "Old-Fashioned"); anything else that still scores well on name similarity falls into tier 6, not tier 5.

## Options considered

### Option 1: Ingredient overlap matching only, no alias table

Treat every query as a potential ingredient list first: tokenize it, fuzzy match each token against ingredient names, and rank recipes by overlap. Fall back to the existing `search_recipes` for anything that doesn't look like an ingredient list.

**Pros**:
- One mechanism, no new table, no content to seed or maintain.

**Cons**:
- Cannot resolve a name abbreviation like "old f" or "esp mart", since those tokens aren't ingredient names at all; two of the four examples named directly in the brief would not work.

### Option 2: Curated alias table plus a separate ingredient overlap RPC, merged results

Add a `recipe_aliases` table (seeded by an automated classification pass plus manual curation) matched by prefix/trigram for shorthand, and a distinct `search_recipes_by_ingredients` RPC scored by overlap. The search endpoint queries both, plus the existing name search, and merges into the tiered ranking.

**Pros**:
- Directly solves both example patterns named in the brief (name shorthand and ingredient lists), because they're genuinely different query shapes needing different matching logic.
- The alias table is inspectable and correctable by hand when the automated seeding gets one wrong, unlike a purely algorithmic guess.

**Cons**:
- More moving parts: a new table, a seeding job, and a second RPC to maintain alongside the existing search.
- Alias coverage is only as good as the seeding pass and any manual curation after it; an obscure or very new nickname might not be recognized until added.

## Decision

**Chosen option**: Option 2: alias table plus ingredient overlap RPC, merged into one ranked result.

## Rationale

The brief names two distinct bartender behaviors as core examples, not edge cases: shortening a cocktail's own name, and describing a drink by its ingredients. These are different problems with different correct algorithms; a single mechanism strong enough for one is weak for the other, which Option 1's test against the brief's own examples shows directly. The alias table's maintenance cost is accepted because it is the same shape of cost the project already pays for `difficulty` and taste tags (an automated classification pass at import time, human correctable afterward), not a new kind of operational burden.

## Feature design

**Data model sketch**:

| Entity | Key fields | Notes |
|---|---|---|
| `recipe_aliases` | `id` (pk), `recipe_id` (fk `recipes`), `alias` (text, required), `source` (`generated` \| `manual`), `created_at` | index on `alias` (trigram) for fast prefix/fuzzy match |

No changes to `bar_recipes` are needed for aliasing in MVP; a house recipe is found by its own name via the existing name search tier, not by alias (see Follow-up).

**API surface**:

| Endpoint | Method | Key inputs | Key outputs | Auth | Key errors |
|---|---|---|---|---|---|
| `search_bartender` | RPC | `query` (text), `bar_id` (uuid, nullable), `recent_recipe_ids` (uuid[], client supplied) | ranked array of `{ kind: 'bar_recipe' \| 'recipe', id, name, tier, score }` | any authenticated user (linked or anonymous) | 400 empty query |
| `search_recipes_by_ingredients` | RPC (called internally by `search_bartender`, not directly by clients) | `ingredient_tokens` (text[]) | recipes ranked by overlap score | internal | n/a |

**Value sourcing**:

| Action | Value produced / displayed | Source |
|---|---|---|
| `search_bartender` | Which bar's menu/house recipes count as tier 1/2 | `bar_id` param, passed by the client from the currently selected bar (see the data model spec's "current bar" value sourcing); null when the user has no bar. The RPC still independently re-verifies `auth.uid()` is a member of `bar_id` before returning any tier 1/2 row (see Security model); the param only tells the RPC which bar to check, it does not grant access by itself. |
| `search_bartender` | The user's pinned cocktails (tier 3) | `pinned_recipes` rows where `user_id = auth.uid()`, derived server side inside the RPC, never taken from a client supplied user id |
| `search_bartender` | The user's recently viewed cocktails (tier 4) | The `recent_recipe_ids` param, sourced from the existing client side `recentlyViewed.ts` list; the RPC does not read this from the server since it is not server persisted, but ranking/tier membership never depends on this param for anything requiring authorization (it is just a list of ids to prioritize, all subject to the same RLS as everything else) |
| `search_recipes_by_ingredients` | The overlap score for ranking (feeds tier 7's sort and AC-3) | Computed in SQL from `recipe_ingredients` joined against the matched `ingredient_tokens`, as `score = 2 * precision * recall / (precision + recall)` (the harmonic mean, F1 score), where `precision = matched_ingredients / recipe_ingredient_count` and `recall = matched_ingredients / query_token_count`; a recipe with zero matched ingredients is excluded, never scored as 0 and shown |
| `search_bartender` | Tier 6's sort key (fuzzy/trigram catalog matches) | The `pg_trgm` similarity score already computed by the existing `search_recipes` RPC, reused as is; a token below a similarity of `0.3` (the project's existing implicit threshold in `search_recipes`, confirmed unchanged) is not considered a match at all, consistent with today's behavior |
| `search_recipes_by_ingredients` | Which `ingredients` row a query token matches | `pg_trgm` similarity against `ingredients.normalized_name`, same `0.3` threshold as above, so "gin" does not spuriously match "gin blossom syrup" style near misses unless they clear that bar |
| `recipe_aliases` seeding | The initial alias list per recipe | Generated by a Haiku classification pass over each recipe's name at import/backfill time, same pattern as the existing `difficulty` and taste tag classification jobs, gated by a `source_name_hash` column so re-running only reclassifies changed names |

**Key invariants**:
- Tiers never mix: every result belongs to exactly one tier, and tier order is fixed regardless of match strength (a strong ingredient match never outranks a weak house menu match).
- `search_recipes_by_ingredients` only considers a recipe a candidate if at least one query token matches at least one of its ingredients above the `0.3` similarity threshold; it never returns a recipe with zero overlap just to fill results.
- Result order is fully deterministic for a given query and caller: identical inputs always produce identical output order, via the named per tier score plus the name/id tie break.

**Security model**:
- `search_bartender` is `SECURITY DEFINER` (it must read across `bar_members` and `pinned_recipes` scoped to the caller) with `search_path` pinned. It derives the caller strictly from `auth.uid()`, never from a client supplied parameter; there is no `user_id` input at all (removed per the fix above), which is what makes the pin (tier 3) and bar (tier 1/2) scoping actually safe rather than merely claimed.
- `search_bartender` only returns bar scoped results (tiers 1 to 2) for a `bar_id` the calling `auth.uid()` is actually a member of, re-checked inside the function body against `bar_members` on every call; a user cannot read another bar's house recipes by passing an arbitrary `bar_id`, and cannot read another user's pins since there is no way to specify a different user.
- No new PII or compliance scope.

**Configuration required**: none.

**Critical test scenarios**:
- Happy path: a bar member searches "esp mart" and gets Espresso Martini as the top catalog result (tier 5/6, since it is not house recipe or pinned), verifies **AC-2**.
- Happy path: a bar member searches "gin campari vermouth" and gets Negroni ranked above any recipe sharing only one of those three ingredients, verifies **AC-3**.
- Failure case: a query with no alias match and no meaningful ingredient overlap still returns the existing trigram/name search results rather than an empty list, verifies **AC-5**.
- Auth/permission: a user not a member of `bar_id` calls `search_bartender` with that bar's id anyway and receives zero tier 1/2 results (not an error, not another bar's data), verifies AC-1's bar scoping guarantee.
- Edge case: the same query run twice in a row (no data change in between) returns results in the exact same order both times, verifies **AC-1**'s determinism guarantee.
- Edge case: "old fashioned" and "Old-Fashioned." both land in tier 5 (exact match) for the same recipe, not tier 6, verifies **AC-6**.

## Build plan

1. Migration: `recipe_aliases` table plus trigram index; classification job (script or edge function) to seed aliases for existing catalog recipes, following the `difficulty` backfill pattern. Satisfies **AC-2**.
2. `search_recipes_by_ingredients` RPC. Satisfies **AC-3**.
3. `search_bartender` RPC (`SECURITY DEFINER`, `search_path` pinned, `auth.uid()`-derived caller) combining alias match, ingredient overlap (F1 scored), the existing `search_recipes` (tier 6, reusing its trigram score), and the bar/pin/recent tiers, each tier capped at 10 with the name/id tie break, and the re-check of `bar_members` server side. Satisfies **AC-1, AC-4, AC-5, AC-6**.
4. `packages/shared`: a thin typed wrapper (`searchBartender(query, barId, recentRecipeIds)`) and the tier/result types. Satisfies **AC-1 through AC-6**.
5. `apps/mobile`: the Service screen's search input wired to `searchBartender`, debounced, rendering tiered sections with a "see more" affordance per tier. Satisfies **AC-1 through AC-6**.

## Consequences

**Positive**:
- Solves the two named bartender query patterns (shorthand, ingredient list) with mechanisms suited to each, rather than stretching one algorithm to cover both poorly.
- Reuses the project's existing classification job pattern, so the team already knows how to operate and re-run it.

**Negative / tradeoffs**:
- Alias coverage has a cold start gap: a brand new or very obscure nickname won't resolve until it's added, either by a future classification re-run or manual entry.
- Two extra SQL code paths (alias match, ingredient overlap) to maintain and keep performant as the catalog grows, beyond the one search path that existed before.

**Neutral**:
- House recipes are not aliased in MVP; a bartender must search a house recipe by something close to its actual name. Given house recipes are usually named plainly by the bar's own staff, this is a reasonable scope cut, not a real gap.

## Follow-up

- [ ] Consider extending `recipe_aliases` (or an equivalent) to `bar_recipes` if bars start giving house drinks their own internal nicknames.
- [ ] Monitor alias classification quality after the first seeding pass; add a simple admin correction path if the automated aliases are frequently wrong.
