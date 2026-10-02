# 0030. Admin recipe management

**Date**: 2026-09-30
**Status**: In Progress

## Summary

This decision adds an admin only page where you, the site's one admin, can create, edit, and soft delete recipes directly, without running the TheCocktailDB import job. It reuses the existing recipe tables and the `is_admin` check spec 0028 already built, and adds one new column so an admin made recipe can be told apart from an imported one. A new database function handles the multi table save (recipe plus its ingredients and tags) as one all or nothing step.

## Requirements

**User stories**:
- As the site admin, I want to add a new recipe by hand, so I am not limited to whatever TheCocktailDB happens to carry.
- As the site admin, I want to edit any recipe's fields, including ones the import job created, so I can fix mistakes or improve content.
- As the site admin, I want to remove a recipe I no longer want listed, so the catalog stays something I am willing to stand behind.
- As a non admin user or a guest, I should never be able to reach or affect this page, matching how comment moderation is already locked down.

**Acceptance criteria** (the contract, each criterion is IDed and independently checkable):
- **AC-1**: A signed in admin (`user_preferences.is_admin = true`) can open `/admin/recipes` and see a paginated, newest first list of recipes with name, glass, alcoholic status, and a source indicator (catalog vs admin), with a search box that filters the list by name.
- **AC-2**: From `/admin/recipes`, the admin can open an "add recipe" form with fields for name (required, up to 200 characters), instructions (required, up to 10,000 characters), image URL (optional), glass (optional), alcoholic status (required, one of the existing values), region (optional), at least one ingredient (name plus an optional measure), and any number of tags (name only); submitting it creates a new recipe visible immediately in search, browse, and the admin list, with its `source` column set to `admin`.
- **AC-3**: From `/admin/recipes`, the admin can open an edit form pre filled with an existing recipe's current fields and ingredients and tags (whether that recipe's `source` is `catalog` or `admin`); submitting it updates the recipe in place, and its `source` value is never changed by an edit.
- **AC-4**: Typing an ingredient or tag name that matches an existing one (case and whitespace insensitive, the same normalization the import job already uses) reuses that existing row instead of creating a duplicate; a name with no match creates a new one.
- **AC-5**: The admin can soft delete any recipe from the list or the edit form; it immediately stops appearing in search, browse, recommendations, and the admin list's default view, while any existing `favorites` row referencing it is left untouched.
- **AC-6**: A signed in user whose `is_admin` is not `true`, or a guest, who requests `/admin/recipes` (or any of its sub routes) is redirected to the home page before any admin markup or recipe data reaches them; no error message reveals that the page exists.
- **AC-7**: An attempt to insert, update, or soft delete a `recipes`, `recipe_ingredients`, or `recipe_tags` row from a non admin session, made directly against the database (bypassing the UI), is rejected by row level security.
- **AC-8**: Submitting the add or edit form with a missing required field, an over length name or instructions, or zero ingredients shows a validation error and does not save; the save either fully succeeds (recipe, its ingredients, and its tags all written) or fully fails, never a partial write.

## Decision

**Chosen option**: Option 1: RLS scoped writes plus one transactional Postgres function for the multi table save.

Add `source text not null default 'catalog' check (source in ('catalog', 'admin'))` to `recipes`. Add `is_admin` scoped `INSERT` and `UPDATE` policies to `recipes`, `ingredients`, `recipe_ingredients`, and `recipe_tags` (the same `exists (select 1 from public.user_preferences where user_id = auth.uid() and is_admin)` check spec 0028 already uses), alongside the existing public `SELECT` policies and the import job's own service role access, which are both unchanged.

A new `admin_upsert_recipe` Postgres function takes a recipe's full field set plus its ingredient and tag name lists, checks `is_admin`, and in one transaction: upserts the recipe row (inserting with a synthetic `source_id` of the form `admin-<uuid>` when creating, by the `recipe_id` when editing), resolves or creates each ingredient and tag by `normalized_name` (the same generated, deduplicating column spec 0002 defined), and replaces that recipe's `recipe_ingredients`/`recipe_tags` rows to match the submitted list. A second function, `admin_delete_recipe`, sets `deleted_at` after the same `is_admin` check.

The page lives at `apps/web/src/app/[locale]/admin/recipes/page.tsx` (list) plus `apps/web/src/app/[locale]/admin/recipes/new/page.tsx` and `apps/web/src/app/[locale]/admin/recipes/[id]/edit/page.tsx`, each server gated exactly like `/admin/comments`: read the session with `createSupabaseServerClient`, check `is_admin`, redirect to the locale home otherwise. A small shared admin header/nav links `/admin/comments` and `/admin/recipes` so you can move between the two without knowing both URLs by heart.

**Implementation skills**: `supabase-postgres-best-practices` (`supabase/agent-skills`, `.agents/skills/supabase-postgres-best-practices/`) · `nextjs-app-router-patterns` (`wshobson/agents`, `.agents/skills/nextjs-app-router-patterns/`)

## Feature design

**Data model sketch**:

| Entity | Change | Notes |
|---|---|---|
| `recipes` | add `source text not null default 'catalog' check (source in ('catalog', 'admin'))` | `'catalog'` for every existing and future import job row; `'admin'` only for a recipe created through this feature. Editing a `'catalog'` recipe through this feature never changes its `source` (AC-3); only creation sets it. |
| `recipes` | no other column change | `source_id` stays required and unique; an admin created recipe gets a synthetic `admin-<uuid>` value, which can never collide with TheCocktailDB's own numeric `idDrink` values and is never matched by the import job's reconciliation pass (spec 0002), so an admin recipe is never soft deleted by a reimport. |
| `ingredients`, `tags` | no column change | Matched and created by `normalized_name` exactly as the import job already does; an admin typed name becomes a new row only when no existing row's `normalized_name` matches. |
| `recipe_ingredients`, `recipe_tags` | no column change | A save fully replaces these join rows for the recipe being saved, matching the submitted ingredient/tag list exactly. |

No new tables. Relationships, cardinalities, and every other constraint are exactly as spec 0002 defined them.

**State transitions**: `recipes.deleted_at` goes from `null` to a timestamp on admin delete, the same one way transition spec 0002 already defined for the import job's reconciliation; nothing here adds a restore path.

**API surface**:
| Endpoint | Method | Key inputs | Key outputs | Auth | Key errors |
|---|---|---|---|---|---|
| `/admin/recipes` (Next.js server route) | GET | `q` (search text, optional), keyset cursor | rendered paginated recipe list, or a redirect | `is_admin = true`; else redirected to locale home before data loads | no error state surfaced; unauthorized is a silent redirect (AC-6) |
| `public.recipes` (PostgREST select, admin list) | GET | `deleted_at is null` by default, `name ilike` for search, keyset filter, `limit + 1` | up to page size recipes, trimmed client side to derive "load more" | admin's own session; existing public select policy already allows this | empty result renders a neutral empty state |
| `admin_upsert_recipe` (Postgres function, RPC) | POST (via `supabase.rpc`) | `recipe_id` (null for create), `name`, `instructions`, `image_url`, `glass`, `alcoholic_status`, `region`, `ingredients: {name, measure}[]`, `tags: {name}[]` | the saved recipe's `id` | admin's own session; function checks `is_admin` itself | validation error (empty name/instructions, zero ingredients) raised inside the function as a Postgres exception, surfaced to the form as a save error (AC-8); RLS/function check rejects a non admin caller (AC-7) |
| `admin_delete_recipe` (Postgres function, RPC) | POST (via `supabase.rpc`) | `recipe_id` | none | admin's own session; function checks `is_admin` itself | rejects a non admin caller (AC-7); a missing `recipe_id` is a no op |

**Value sourcing**:
| Action | Value produced / displayed | Source |
|---|---|---|
| Open `/admin/recipes` | whether this session may view the page at all | server side read of `user_preferences.is_admin` for `auth.uid()`, checked before any recipe query runs (AC-1, AC-6) |
| List recipes | the source indicator shown per row | `recipes.source` column, new in this spec |
| Create a recipe | `recipes.source_id` | generated as `admin-<uuid>` inside `admin_upsert_recipe` when `recipe_id` is null (create path); never regenerated on edit |
| Create or edit a recipe | `recipes.source` | `admin_upsert_recipe` sets `'admin'` only on the create path (no `recipe_id` given); left untouched on the edit path (AC-3) |
| Save ingredients/tags | which `ingredient_id`/`tag_id` each submitted name resolves to | `admin_upsert_recipe` looks up each submitted name's `normalized_name` against the existing table first, creating a new row only on no match (AC-4) |
| Save a recipe | whether the save is allowed at all | `admin_upsert_recipe`'s own `is_admin` check against the caller's `auth.uid()` (AC-7) |
| Delete a recipe | `recipes.deleted_at` | set to `now()` by `admin_delete_recipe` (AC-5) |

**Key invariants**:
- `recipes.source` is set once, at creation, and never changed by an edit; only `admin_upsert_recipe`'s create path (no `recipe_id` given) writes `'admin'`, every other write path leaves it as is (AC-3).
- `admin_upsert_recipe` either commits the recipe row and all of its ingredient/tag join rows, or commits nothing; no partial save is observable (AC-8).
- `recipe_ingredients`/`recipe_tags` rows for a saved recipe always exactly match that save's submitted ingredient/tag list afterward; a name omitted from a later edit's list is unlinked from that recipe (its `ingredients`/`tags` row itself is never deleted, matching spec 0002's restrict-on-delete rule).
- Only a caller whose own `user_preferences.is_admin` is `true` may call `admin_upsert_recipe` or `admin_delete_recipe`, or insert/update a row in `recipes`, `ingredients`, `recipe_ingredients`, or `recipe_tags`; this is enforced inside the functions and by RLS, not only by hiding the UI (AC-7).
- A soft deleted recipe's existing `favorites` rows are never touched by `admin_delete_recipe`, matching spec 0002's existing restrict-on-delete behavior for `recipes` → `favorites` (AC-5).
- An admin edit to a `'catalog'` sourced recipe's content can be overwritten by a later reimport of that same `source_id`, since the import job's own upsert (spec 0002) unconditionally overwrites `name`/`instructions`/etc. on every run; this spec does not change that behavior (see Consequences).

**Security model**:
Read access to `recipes`, `ingredients`, `recipe_ingredients`, `tags`, `recipe_tags` is unchanged: open to any viewer, scoped to `deleted_at is null` where that applies. The only change is new `INSERT`/`UPDATE` policies on these five tables, each gated on the caller's own `user_preferences.is_admin`, exactly mirroring spec 0028's existing `comments` delete policy shape. `DELETE` is not granted via RLS at all; the one delete path is `admin_delete_recipe`'s own `is_admin` check, which performs a soft delete (`UPDATE`), never a hard `DELETE`, so no new `DELETE` policy is needed. The import job's service role access is unchanged and untouched by these new policies, since the service role bypasses RLS entirely. `user_preferences.is_admin` itself remains excluded from the `authenticated` update grant (spec 0028), so nothing here creates a new way to self grant admin. No compliance scope applies.

**Configuration required**: none; no new environment variables or credentials.

**Critical test scenarios** (each maps to an acceptance criterion in ## Requirements):
- Happy path: the admin opens `/admin/recipes`, creates a recipe with two new ingredient names and one existing tag name, and sees it appear in the list with `source = admin` and in public search, verifies **AC-1**, **AC-2**, **AC-4**.
- Happy path: the admin edits an existing catalog sourced recipe's instructions and saves; the recipe's `source` stays `catalog` and the new instructions show on its public page, verifies **AC-3**.
- Failure case: the admin submits the add form with instructions over 10,000 characters; the form shows a validation error and no row is written, verifies **AC-8**.
- Failure case: `admin_upsert_recipe` is called with a recipe name but zero ingredients; the function raises and nothing is written, not even the recipe row, verifies **AC-8**.
- Auth/permission: a signed in non admin user, and separately a guest, request `/admin/recipes` directly by URL and are redirected to the locale home with no admin content ever rendered, verifies **AC-6**.
- Auth/permission: a non admin session's direct `insert` into `recipes`, and a direct `rpc` call to `admin_upsert_recipe`, are both rejected, verifies **AC-7**.
- Delete: the admin soft deletes a recipe that another user has favorited; it disappears from search and the admin's default list view, while that user's `favorites` row still references it without erroring, verifies **AC-5**.

## Build plan

1. Write the migration: add `recipes.source`, add the `is_admin` scoped `INSERT`/`UPDATE` policies to `recipes`, `ingredients`, `recipe_ingredients`, `recipe_tags`, add the `admin_upsert_recipe` and `admin_delete_recipe` functions, and regenerate shared TypeScript types, satisfies **AC-2**, **AC-3**, **AC-4**, **AC-5**, **AC-7**, **AC-8**.
2. Add a shared admin recipes query module in `packages/shared` (keyset paginated list with search, a single recipe fetch for the edit form, and thin wrapper functions for the two RPCs), satisfies **AC-1**, **AC-2**, **AC-3**, **AC-5**.
3. Build the server gated list page (`apps/web/src/app/[locale]/admin/recipes/page.tsx`), reusing the `is_admin` redirect pattern from `/admin/comments`, with the search box, source indicator, and a delete action per row, satisfies **AC-1**, **AC-5**, **AC-6**.
4. Build the add and edit form pages, sharing one client form component that takes an optional existing recipe to pre fill, with client side validation matching AC-8's limits before calling `admin_upsert_recipe`, satisfies **AC-2**, **AC-3**, **AC-4**, **AC-8**.
5. Add the small shared admin nav linking `/admin/comments` and `/admin/recipes`, and link it from both pages.
6. Confirm end to end against the live project: create, edit, and soft delete a recipe as the admin; confirm a non admin and a guest are redirected; confirm a direct RPC/insert attempt from a non admin session is rejected, satisfies **AC-1** through **AC-8**.

## Consequences

**Positive**:
- Closes the real gap this feature exists for: you can add, correct, or remove a recipe in a few clicks instead of hand running SQL or waiting on the next import job run.
- Costs one column, four narrowly scoped RLS policies, and two functions, all reusing patterns (the `is_admin` check, keyset pagination, normalized name matching) already proven out by specs 0002 and 0028.

**Negative / tradeoffs**:
- An admin edit to a `catalog` sourced recipe's content is not protected from being silently overwritten the next time the import job reimports that same `source_id`; the import job's existing unconditional upsert (spec 0002) is unchanged by this spec. Flagged as Follow-up rather than solved now.
- No audit trail for who changed or deleted what, matching the same tradeoff spec 0028 already accepted for comment deletes.
- The admin recipe form has no autocomplete against existing ingredient or tag names; a near duplicate (different punctuation or a typo that normalizes differently) still creates a new row, same limitation TheCocktailDB imports already have.

**Neutral**:
- `recipes.source` sits unused by any public facing feature at launch; it exists for the admin list's own benefit and as a safety marker for future tooling, not for end user display.
- Mobile (`apps/mobile`) is out of scope, matching spec 0028's own web only precedent for admin surfaces.

## Follow-up

- [ ] Decide whether `catalog` sourced recipes an admin has edited should be protected from a later reimport overwriting them; out of scope here, flagged as a known tradeoff.
- [ ] Consider ingredient/tag autocomplete on the admin form if near duplicate rows (different casing or punctuation that normalizes differently) become a real problem.
- [ ] Consider an audit trail for admin recipe changes and deletes if disputes or mistaken edits ever become a real concern, matching spec 0028's identical open follow up for comment deletes.
- [ ] The "user submitted recipes" item already listed as Deferred in `docs/scope/scope.md` would need its own `source` value (e.g. `'user'`) and its own moderation design; this spec's `check` constraint would need widening if that is ever picked up.
