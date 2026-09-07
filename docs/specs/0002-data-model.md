# 0002. Core data model

**Date**: 2026-09-06
**Status**: Accepted

## Summary

This decision fixes the core database shape the whole app builds on: recipes and their canonical ingredients (imported from TheCocktailDB, a public cocktail recipe source), a pantry list and favorites owned by each user (guest or signed in), and tags for browsing beyond region. It is designed as one coherent target so later features (search, pantry matching, favorites, region browsing) do not force a breaking migration.

## Context

The product needs a working recipe library, a pantry a guest or signed in user can build, favorites, and browsing by region and tag, all sourced from one relational Postgres database (Supabase), per spec [0001](0001-stack-and-architecture.md). TheCocktailDB supplies recipes as 15 flat, inconsistently cased ingredient text fields per recipe with no region or tag data of its own, so a usable pantry matching feature (`packages/shared/src/pantryMatching.ts`, already written against a `recipeId` plus `ingredientIds[]` shape) needs canonical, deduplicated ingredient rows, not raw text.

Six planned features (scope rows 5 through 11) read or write this schema before any of them gets its own spec. Deciding the schema piecemeal, one feature at a time, risks a migration that breaks an already shipped feature once the next one's requirements surface. The consequence of not deciding this now is exactly the breaking migration spec 0001 and scope row 3 both call out to avoid.

## Requirements

**User stories**:
- As a home bartender, I want to search and view real cocktail recipes with instructions and images.
- As a home bartender, I want to keep a pantry list of ingredients I own, without needing an account.
- As a home bartender, I want to see which recipes I can make (or nearly make) from my pantry.
- As a home bartender, I want to favorite recipes and browse by region or tag.
- As an engineer, I want one coherent schema so later feature specs build on real structure instead of re deciding entities.

**Acceptance criteria**:
- **AC-1**: Recipes and canonical ingredients are queryable (search by name or ingredient, fetch detail with instructions and image) from our own imported Postgres tables, not live from TheCocktailDB.
- **AC-2**: A pantry item can be added or removed per user (anonymous or signed in), deduplicated by (user, ingredient); adding an already present item or removing an absent one is a no op, not an error.
- **AC-3**: A recipe can be favorited or unfavorited per user, deduplicated by (user, recipe).
- **AC-4**: Pantry to recipe matching computes missing ingredients per recipe using canonical ingredient IDs, matching the existing `matchPantryToRecipes` signature in `packages/shared`.
- **AC-5**: Recipes can be filtered or browsed by region and by tag.
- **AC-6**: Reimporting TheCocktailDB's catalog upserts on a stable source ID (no duplicate ingredient, recipe, or tag rows across import runs); a recipe no longer present in a *complete* import run is marked removed, and its removal cascades to dependent `recipe_ingredients` and `recipe_tags` rows without deleting any user's `favorites` history of it.
- **AC-7**: Every pantry and favorites read or write is scoped to the requesting user (`auth.uid()`) via row level security (a Postgres feature that restricts which rows a query can see or change); the imported catalog tables are publicly readable and not writable by any client role.

## Options considered

### Option 1: Fully normalized relational schema (ingredients, tags as their own tables)

Canonical `ingredients` and `tags` tables, each deduplicated by a natural key, joined to `recipes` through `recipe_ingredients` and `recipe_tags`. Pantry and favorites are their own small join like tables against `auth.users`.

**Pros**:
- Exact pantry matching against canonical ingredient IDs (no fuzzy text matching at query time), which is what `pantryMatching.ts` already assumes.
- Referential integrity: a renamed or removed ingredient/tag updates everywhere it is used, with no drift between recipes.
- Supports region and tag browsing and future filtering without touching `recipes` itself.

**Cons**:
- More tables and joins than a denormalized shape; every recipe read fans out to two or three joins.
- The import job is more code than a straight text dump: it must normalize, dedupe, and upsert ingredients and tags before linking them to recipes.

### Option 2: Denormalized recipes with array/JSON columns for ingredients and tags

Store ingredients as a JSON array on `recipes` (name, measure) and tags as a `text[]` column; skip `ingredients` and `recipe_ingredients` as separate tables.

**Pros**:
- Simpler import (closer to TheCocktailDB's own shape); fewer tables and joins for a plain recipe read.
- Faster to build the first version of the recipe search and detail feature.

**Cons**:
- Pantry matching (AC-4) needs exact ingredient identity across recipes; a JSON blob has no natural dedup key, so "lime juice" on one recipe and "Lime Juice" on another stay unmatched unless normalized at query time, in every query, forever.
- No referential integrity: an ingredient rename touches every recipe's JSON blob individually instead of one row.

**This option is not chosen.** Pantry matching (Slice 2 and 3) is a stated near term feature this schema must support without a rebuild; a JSON shape defers the real cost to that feature instead of removing it.

## Decision

**Chosen option**: Option 1: Fully normalized relational schema.

Seven entities: `recipes`, `ingredients`, `recipe_ingredients` (join), `tags`, `recipe_tags` (join), `pantry_items`, `favorites`, plus Supabase's built in `auth.users` for identity. No separate profile table and no AI generation cache table are added now; neither is needed by a currently spec eligible feature (see Follow-up).

**Implementation skills**: `supabase-postgres-best-practices` (`supabase/agent-skills`, `.agents/skills/supabase-postgres-best-practices/`)

## Rationale

The deciding force is `pantryMatching.ts`'s existing shape: it takes `ingredientIds: string[]` and matches by set membership, which only works if two recipes referencing "lime juice" resolve to the same ID. TheCocktailDB has no such ID of its own for ingredients (only free text per recipe), so canonicalizing at import time (Option 1) is what makes AC-4 correct rather than approximate. Deferring normalization to query time (Option 2) would mean re solving the same fuzzy matching problem on every pantry match call instead of once, at import.

Region and tags are the app's own data, not TheCocktailDB's (spec 0001), so both get first class columns/tables rather than being bolted onto a JSON blob later. Cascading deletes (`ON DELETE CASCADE` on every child foreign key) follow from treating the imported catalog as the source of truth: when a reimport removes a recipe or ingredient, dependent pantry and favorite rows should not silently reference a row that no longer exists (`AC-6`).

## Feature design

**Data model sketch**:

| Entity | Primary key | Fields | Foreign keys | Cardinality |
|---|---|---|---|---|
| `recipes` | `id` (uuid, default `gen_random_uuid()`) | `name` (text, required), `instructions` (text, required), `image_url` (text, nullable), `region` (text, nullable), `glass` (text, nullable), `alcoholic_status` (text, required, `check in ('alcoholic','non_alcoholic','optional','unknown')`, default `'unknown'`), `source_id` (text, unique, required, TheCocktailDB's own ID), `deleted_at` (timestamptz, nullable, set when a reimport no longer sees this recipe), `created_at`, `updated_at` (timestamptz, `updated_at` maintained by a trigger) | — | 1 : N `recipe_ingredients`, N `recipe_tags`, N `favorites` |
| `ingredients` | `id` (uuid, default `gen_random_uuid()`) | `name` (text, required, display form), `normalized_name` (text, required, unique, **generated column**: `lower(btrim(regexp_replace(name, '\s+', ' ', 'g')))`, diacritics/punctuation not stripped), `image_url` (text, nullable), `created_at`, `updated_at` (timestamptz) | — | 1 : N `recipe_ingredients`, N `pantry_items` |
| `recipe_ingredients` | (`recipe_id`, `ingredient_id`) | `measure` (text, nullable, display only, e.g. "1 1/2 oz"), `sort_order` (int, required) | `recipe_id` → `recipes` (cascade), `ingredient_id` → `ingredients` (restrict) | N:M `recipes` ↔ `ingredients` |
| `tags` | `id` (uuid, default `gen_random_uuid()`) | `name` (text, required, display form), `normalized_name` (text, required, unique, same generated rule as `ingredients`), `created_at`, `updated_at` (timestamptz) | — | 1 : N `recipe_tags` |
| `recipe_tags` | (`recipe_id`, `tag_id`) | — | `recipe_id` → `recipes` (cascade), `tag_id` → `tags` (restrict) | N:M `recipes` ↔ `tags` |
| `pantry_items` | (`user_id`, `ingredient_id`), unique | `created_at` (timestamptz) | `user_id` → `auth.users` (cascade), `ingredient_id` → `ingredients` (restrict) | N:M `auth.users` ↔ `ingredients` |
| `favorites` | (`user_id`, `recipe_id`), unique | `created_at` (timestamptz) | `user_id` → `auth.users` (cascade), `recipe_id` → `recipes` (restrict) | N:M `auth.users` ↔ `recipes` |
| `auth.users` | Supabase managed | anonymous or signed in, per spec 0001 | — | — |

Unique constraints: `ingredients.normalized_name`, `recipes.source_id`, `tags.normalized_name`, `pantry_items(user_id, ingredient_id)`, `favorites(user_id, recipe_id)`.

**Why `restrict`, not `cascade`, from `ingredients`/`recipes` into user data**: `recipe_ingredients` and `recipe_tags` are purely derived data, so cascading their deletion is safe. `pantry_items` and `favorites` are a user's own data; cascading their deletion off a third party catalog change (a re-tagged or removed ingredient/recipe) would silently destroy it with no trace. Reconciliation (Build plan) marks a removed `recipes` row via `deleted_at` instead of deleting it, so `favorites` survives and the UI can show it as unavailable; `ingredients` are never deleted by the import job at all (orphan ingredients are harmless; deleting one would empty pantries).

Indexes: `recipe_ingredients(ingredient_id)`, `recipe_tags(tag_id)`, `pantry_items(ingredient_id)` (the trailing FK column of every join table, needed for the ingredient-search and pantry-match query directions), `recipes(region) where region is not null`, plus the search indexes in the Build plan.

**State transitions**: none; every entity here is a plain owned row, no lifecycle states.

**API surface**: not applicable, this spec fixes the schema and its access policies; the endpoints/actions that read and write it belong to each consuming feature's own spec (recipe search and detail, guest pantry, and so on).

**Value sourcing**:
| Action | Value produced / displayed | Source |
|---|---|---|
| Import job run | `recipes.source_id` | TheCocktailDB's `idDrink` field |
| Import job run | `ingredients.normalized_name` | Generated column on `ingredients.name` (DB is the single normalization authority, not the importer, so two importer versions can never disagree) |
| Import job run | `recipes.region` | Hand or LLM assisted tagging during import (per spec 0001; the tagging method itself is decided in the recipe search and detail feature's own spec) |
| Import job run | `recipes.alcoholic_status` | TheCocktailDB's `strAlcoholic` field, mapped to `alcoholic`/`non_alcoholic`/`optional`; `unknown` when absent |
| Import job run | `tags.name` / `recipe_tags` rows | TheCocktailDB's `strTags` (comma split, trimmed) plus `strCategory`; the deferred hand/LLM tagging process (Follow-up) augments this, it is not the only source |
| Import job run | `recipe_ingredients.sort_order` | The 1 to 15 position index of TheCocktailDB's `strIngredientN` fields for that recipe |
| Import job run | which `recipes` rows get `deleted_at` set | Every existing `source_id` not present in the current run's fetched set, only applied when the run completed without a fetch error (see Key invariants) |
| Pantry add | `pantry_items.user_id` | The requesting user's `auth.uid()` (anonymous or signed in session) |
| Pantry match | candidate recipe set | Recipes with at least one `recipe_ingredients` row whose `ingredient_id` is in the caller's pantry, `deleted_at is null`, capped at 200 |
| Pantry match | missing ingredient list per recipe, and result order | Derived: `recipe_ingredients` for each candidate minus the caller's `pantry_items`, via `matchPantryToRecipes`; tiebreak on equal missing count is `recipes.name asc` (the function's own sort is not stable) |
| Recipe search | result order | `ts_rank` of the `recipes.name` full text match, descending, then `recipes.name` ascending |
| Ingredient search | result order | Trigram similarity on `ingredients.name` descending, joined to `recipe_ingredients` for distinct matching recipes |
| Recipe detail page | ingredient list order | `recipe_ingredients.sort_order` ascending |
| Region/tag browse | result order | `recipes.name` ascending, until real popularity counters exist (spec 0001 defers popularity to usage data) |

**Key invariants**:

- `ingredients.normalized_name` and `tags.normalized_name` are generated, unique columns; the import job upserts with `ON CONFLICT (normalized_name) DO UPDATE set name = excluded.name returning id` (the `DO UPDATE` form always returns a row; `DO NOTHING` does not, a known importer bug this avoids when re-selecting the id).
- `recipes.source_id` is unique; a reimport of the same TheCocktailDB recipe updates the existing row (`ON CONFLICT (source_id) DO UPDATE`, bumping `updated_at`, clearing `deleted_at` if previously set), it never creates a second row.
- `pantry_items(user_id, ingredient_id)` and `favorites(user_id, recipe_id)` are each unique; the insert path uses `ON CONFLICT DO NOTHING` so a duplicate add is a no op (AC-2, AC-3); a delete affecting 0 rows is also a no op, not an error, since the client cannot distinguish "wasn't there" from "not yours" under RLS.
- The import job runs inside one transaction; the reconciliation pass that sets `recipes.deleted_at` on rows no longer present upstream runs only when every recipe in the catalog was fetched successfully, never on a partial or failed run. `ingredients` and `tags` are never deleted or marked deleted by reconciliation, only `recipes`.
- `recipe_ingredients`/`recipe_tags` cascade with their parent `recipes` row; `ingredients`/`tags` restrict deletion (never deleted by the app), so `pantry_items`/`favorites` never lose a row to a catalog change.
- The import job takes a Postgres advisory lock for its duration so two scheduled runs cannot overlap.

**Security model**:
- `recipes`, `ingredients`, `recipe_ingredients`, `tags`, `recipe_tags`: row level security enabled, `SELECT` open to the `anon` and `authenticated` roles (public recipe data, needed for both guest use and web SSR/SEO; `recipes` reads exclude `deleted_at is not null` rows by default), no `INSERT`/`UPDATE`/`DELETE` policy for any client role, and `INSERT`/`UPDATE`/`DELETE` grants explicitly revoked from `anon`/`authenticated` on these tables (defense in depth: a policy gap alone should not be the only thing standing between a client and a write). Only the import job, using the Supabase service role key (which bypasses row level security and grants), writes to these tables.
- `pantry_items`, `favorites`: row level security enabled. `SELECT` and `DELETE` use `USING ((select auth.uid()) = user_id)`; `INSERT` uses `WITH CHECK ((select auth.uid()) = user_id)` (the `select` wrapped form avoids re-evaluating `auth.uid()` per row, per the supabase-postgres-best-practices skill). No `UPDATE` policy: neither table has a field worth updating, and an `UPDATE` policy with only a `USING` clause would let a caller rewrite `user_id` to someone else's, planting a row in another user's pantry or favorites. No public read.

**Configuration required**: none new; this spec reuses the Supabase project and credentials already provisioned under spec 0001.

**Critical test scenarios**:
- Happy path: search recipes by name and by ingredient name (via the `recipe_ingredients(ingredient_id)` index), open a detail page showing instructions, image, and ingredients ordered by `sort_order`, verifies **AC-1**.
- Happy path: add two ingredients to a pantry, request matches against the capped candidate set, see recipes ranked by fewest missing ingredients then name, verifies **AC-4**.
- Failure case: reimporting the same TheCocktailDB catalog twice produces no duplicate `ingredients`, `tags`, or `recipes` rows; a recipe missing from a *complete* reimport is marked `deleted_at` (not deleted) and drops out of search while a user who favorited it keeps that `favorites` row; a *failed* reimport run marks nothing removed, verifies **AC-6**.
- Auth/permission: a signed out (anonymous) user can add/remove their own pantry items but cannot read, write, or reassign another user's `pantry_items` or `favorites` rows (including via a crafted `UPDATE`, which has no policy at all); no client role can insert into `recipes` or `ingredients`, verifies **AC-7**.

## Build plan

1. Write the Supabase CLI migration creating `recipes`, `ingredients`, `recipe_ingredients`, `tags`, `recipe_tags`, `pantry_items`, `favorites` with the fields, generated columns, keys, and cascade/restrict rules above, plus the `updated_at` maintenance trigger on `recipes`/`ingredients`/`tags`, satisfies **AC-1**, **AC-2**, **AC-3**, **AC-5**, **AC-6**.
2. Add the join table and lookup indexes (`recipe_ingredients(ingredient_id)`, `recipe_tags(tag_id)`, `pantry_items(ingredient_id)`, `recipes(region) where region is not null`), satisfies **AC-1**, **AC-4**, **AC-5**.
3. Enable row level security and add the policies from the Security model (public read on catalog tables plus revoked write grants, `auth.uid()` scoped SELECT/INSERT/DELETE on `pantry_items`/`favorites`, no UPDATE policy), satisfies **AC-7**.
4. Add a generated `tsvector` column and index on `recipes.name` (full text search) and a `pg_trgm` GIN index on `ingredients.name` (fuzzy ingredient search), satisfies **AC-1**.
5. Add generated TypeScript types for these tables into `packages/shared` (via the Supabase CLI's type generator) so both apps consume one typed schema, satisfies **AC-1** through **AC-5**.
6. Write the import job: one transaction per run, an advisory lock for the run's duration, `ON CONFLICT ... DO UPDATE ... RETURNING id` upserts for `recipes`/`ingredients`/`tags` (never `DO NOTHING`, so the id is always returned), and a reconciliation pass that sets `recipes.deleted_at` for any `source_id` absent from a run that completed without a fetch error, satisfies **AC-6**.

This is the whole schema in one migration (not sliced), since the tracer bullet approach's first thin thread (recipe search and detail, Slice 1) still needs `recipes`, `ingredients`, and `recipe_ingredients` together to show a real detail page, and creating `pantry_items`/`favorites`/`tags` alongside them now is what avoids the breaking migration this spec exists to prevent.

## Consequences

**Positive**:
- One coherent schema supports all six near term features (search, pantry, matching, favorites, region, tags) with no anticipated breaking migration.
- Exact, canonical pantry matching from day one, matching the algorithm already written in `packages/shared`.
- Row level security gives pantry and favorites data a solid default security posture without per feature policy design.

**Negative / tradeoffs**:
- More tables and joins than a denormalized shape; every recipe detail read costs two or three joins instead of one row fetch.
- The import job is more code than a straight dump: it must normalize and dedupe ingredients and tags, run in one transaction with an advisory lock, and reconcile removals, not just copy TheCocktailDB's fields.
- Creating all seven tables now, ahead of most of their consuming features, means some (`tags`, `recipe_tags`) sit unused until Slice 7 (popular drinks by region) or a later tagging feature ships.
- Soft deleting `recipes` (rather than hard deleting on cascade) means every catalog read must filter `deleted_at is null`; forgetting that filter in a later feature's query would leak removed recipes back into search or browse.

**Neutral**:
- `recipes.region` and `recipe_tags` are populated by a tagging process (hand or LLM assisted) not yet designed; this spec only fixes where that data lives, not how it is produced.
- The generated TypeScript types in `packages/shared` become a new artifact both apps depend on; regenerating them is a required step whenever this schema changes.
- `ingredients.id`/`tags.id` are uuid surrogate keys even though `normalized_name` is already a unique natural key; kept for type uniformity with every other table's id shape, not because the natural key is insufficient.

## Follow-up

- [ ] Decide the region/tag tagging method (hand curated vs LLM assisted) in the recipe search and detail feature's own spec; this spec only fixes that `recipes.region` and `recipe_tags` exist.
- [ ] The AI generated drink ideas feature (scope row 8) will need its own cache table (keyed by a hash of the sorted pantry ingredient set, per spec 0001); deliberately not added here since no spec-eligible feature needs it yet.
- [ ] A user profile table (`public.profiles`, 1:1 with `auth.users`) was considered and deferred; add it in whichever feature first needs a display name, avatar, or stored preference.
- [ ] The 30 day idle anonymous user cleanup job (spec 0001's own follow up) should confirm its cascade (through `auth.users` → `pantry_items`/`favorites`) behaves as expected once it is designed; this is a different cascade path than the `recipes`/`ingredients` soft delete above.
- [ ] `ingredients.normalized_name`/`tags.normalized_name` strip whitespace and casing but not diacritics or punctuation (e.g. "Crème de Cacao" and "Creme de Cacao" stay distinct rows); revisit with `unaccent` if duplicate near matches turn out to be common once real data is imported.
