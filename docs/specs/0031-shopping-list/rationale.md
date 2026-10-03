# 0031. Shopping list — rationale

## Context

The pantry (spec 0005) lets a user track what they have. It has no answer for what they are missing and want to buy. Today a user has to remember, outside the app, which ingredients a recipe calls for that they do not yet own. The recipe detail page already marks which ingredients are in the pantry (spec 0005, AC-4), so the missing ones are already visible, there is just no action tied to them.

The pantry feature already solved the two hard problems a feature like this would otherwise have to solve again: every guest gets a real anonymous Supabase session, and pantry style tables are small, single writer per user, and safe to read and write live against Postgres with no local cache. A shopping list is the same shape of data (a user owns a set of ingredient references), so the open question is not how to build this kind of feature, it is only whether anything about "things I want to buy" instead of "things I have" changes that shape, and how the two connect at the one point they share, the recipe detail page and the act of buying something.

## Options considered

### Option 1: New `shopping_list_items` table, live queried the same way as `pantry_items`

A new table shaped exactly like `pantry_items` (owning user, referenced ingredient, nothing else), read and written live through Postgres via TanStack Query, with the same optimistic update and rollback pattern spec 0005 already built, plus one new Postgres function for the atomic buy action.

**Pros**:
- Zero new architecture: the session bootstrap, RLS pattern, query key strategy, and optimistic update/rollback code are all already proven in production by the pantry feature; this is mechanical reuse, not new design.
- The buy action's atomicity need (AC-4) is solved the same way spec 0026's `submit_quiz_attempt` already solved a similar "more than PostgREST can express in one request" problem: one `security invoker` Postgres function.

**Cons**:
- A second table with the same shape as `pantry_items` (owning user, ingredient) duplicates structure, though not logic; the shared `pantry.ts`-style module is still one implementation reused by both apps.

### Option 2: A single `want_to_buy: boolean` column added to `pantry_items`

Instead of a second table, add a boolean flag to the existing `pantry_items` row (or a `status` enum: `owned` / `wanted`), so a shopping list item is just a pantry row not yet owned, and "buying" is one `UPDATE` flipping the flag.

**Pros**:
- One table, one buy action becomes a single column update with no cross table move, genuinely the smallest possible atomic buy implementation.

**Cons**:
- A pantry row and a shopping list row are conceptually different (AC-8 requires an ingredient to be in the pantry AND on the shopping list at once, e.g. "I have one lime but want to buy more"), which this option cannot represent without a second row per ingredient per user anyway, defeating the single column's simplicity. It also couples two features' RLS and query invalidation into one table, so every future shopping list change risks touching pantry code and vice versa.

## Rationale

Option 2's single column saves one table but fails the one requirement (AC-8) that actually distinguishes a shopping list from the pantry: the two must be able to disagree for the same ingredient (owned and still wanted, e.g. restocking). A boolean or status flag on `pantry_items` cannot express "both" without already needing a second row, at which point the "one table" saving is gone and the schema is now harder to reason about, not easier. Option 1's duplication is structural only, not logical: the shared `pantry.ts`-shaped module (fetch/add/remove) is one small piece of code the project already knows how to write twice (once per table) without duplicating business rules, consistent with this project's own rule against duplicating logic, which is about logic, not table shape. The atomic buy action is the one genuinely new piece of work, and it has a direct precedent in spec 0026's `submit_quiz_attempt`: a `security invoker` Postgres function is this project's already established way to do a multi step write PostgREST cannot express in one request.
