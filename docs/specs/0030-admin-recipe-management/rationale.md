## Context

Today the only way a recipe enters the database is the import job in `packages/import-job`, which pulls from TheCocktailDB and writes with the Supabase service role key (a privileged key that bypasses row level security, the database feature that decides which rows a request can see or change). There is no path for you to add a recipe by hand, fix a typo in an imported one, or remove a bad recipe, short of running SQL directly against the live project.

Spec [0002](../0002-data-model.md) locked `recipes`, `ingredients`, `recipe_ingredients`, `tags`, and `recipe_tags` down hard: every client write grant was revoked, and only the import job's service role key can write to them. That was the right call when the only writer was a trusted batch job, but it means this feature needs a new, narrower write path for your own signed in session, not a reuse of the import job's privileged one.

Spec [0028](../0028-comment-moderation-admin-ui.md) already solved the adjacent problem of letting you, and only you, reach a hidden admin page and act on data other users cannot touch: an `is_admin` flag on `user_preferences`, checked server side before any admin markup renders. This feature reuses that same flag and the same server gated page pattern, rather than inventing a second notion of who the admin is.

## Options considered

### Option 1: RLS scoped writes plus one transactional Postgres function for the multi table save

Add `is_admin` scoped `INSERT`/`UPDATE` row level security policies directly to `recipes`, `ingredients`, `recipe_ingredients`, and `recipe_tags`, mirroring the `OR` clause pattern spec 0028 already used for the `comments` delete policy. The admin's own browser session writes through these policies via Supabase's client library. The multi step part of a save (resolve or create each ingredient and tag by its normalized name, then replace the recipe's join rows) runs inside one new Postgres function, `admin_upsert_recipe`, called via RPC (a function call over the same API, as opposed to a plain table read or write) under the admin's own session; the function checks `is_admin` itself and runs as one transaction.

**Pros**:
- One authorization primitive (`is_admin` via `user_preferences`) across both admin features; nothing new to reason about for "who can do admin things."
- The multi table write is atomic: a dropped connection or a bad ingredient name mid save cannot leave a recipe with half its ingredients linked.
- No new credential exposure: the service role key stays exactly where it is today, used only by the standalone import job process, never reachable from the web app's runtime.

**Cons**:
- Four new or widened RLS policies (`recipes`, `ingredients`, `recipe_ingredients`, `recipe_tags`) plus one new function is more migration surface than a single policy change.

### Option 2: Next.js Server Actions using the service role key

A set of Server Actions (functions that run only on the server, callable from a form) in `apps/web` call Supabase with the service role key, bypassing row level security entirely; each action checks `is_admin` itself before doing anything.

**Pros**:
- No new RLS policies to write or test; the existing policies stay untouched.

**Cons**:
- The service role key, today confined to the standalone import job, becomes reachable from the web app's own server runtime; a bug in one action's admin check, or a future action added without one, is a direct path to writing or deleting any row in the database, not just recipes. This is a materially larger blast radius for a single admin feature.

## Rationale

Option 2's service role key exposure is the deciding force against it: spec 0002 deliberately confined that key to one standalone batch process specifically so a client side bug could never reach the catalog tables directly, and routing a new web app code path through it reverses that decision for a feature that does not need to. Option 1 costs more migration surface (four policies and two functions, instead of none), but it keeps every write bound to the same `is_admin` check already proven out by spec 0028, through the same kind of session the rest of the app already uses, which is the simpler thing to operate and audit a year from now.

The transactional function (rather than several separate client side upserts) follows directly from AC-8: a recipe, its ingredients, and its tags must save together or not at all, and Postgres's own transaction guarantee is the natural place to enforce that, not a sequence of round trips from the browser hoping none of them fails partway through.
