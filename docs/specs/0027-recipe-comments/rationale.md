# 0027. Recipe comments — rationale

## Context

Recipe detail pages currently have no way for users to talk about a recipe: no comments, only a star rating (spec 0024) and a favorite toggle (spec 0015). The app already has a working pattern for signed in only writes with public reads: `ratings` and `favorites` are both owned rows gated by a non anonymous session check in row level security (RLS, the database's per row access control), with the client never trusted to supply its own `user_id`. Comments differ from rating in one structural way: a rating is one editable slot per (user, recipe) pair, but a comment section is a real conversation, so a user can leave more than one comment on the same recipe over time. That means comments need their own primary key (an `id`) rather than the `(user_id, recipe_id)` composite key `ratings` and `favorites` use.

Comments also surface a second party's `display_name` for the first time. Spec 0018 added `display_name` to `user_preferences` for the nav badge, and deliberately kept it owner scoped (AC-10: a user cannot read another user's name), since the badge only ever reads the caller's own row. `user_preferences`'s SELECT policy is `auth.uid() = user_id`, with no cross user or guest read path at all. A comment's author name is read by every viewer, signed in or guest, so this spec cannot lean on that existing policy as is; it needs its own narrow, public facing exposure of `display_name` alone, addressed in the Decision below.

## Options considered

### Option 0: Direct PostgREST select vs. a dedicated read function

Before the data model options, one read path choice: expose reads through a `fetch_recipe_comments` Postgres function, or through a direct PostgREST select (`comments?select=...&recipe_id=eq.X&order=...`) with the soft delete filter folded into the table's own SELECT policy. A cross check of this spec's first draft flagged that a dedicated function adds a migration, a signature to version, and (if left `security invoker` with an open table level SELECT policy) an easy way to bypass the function's own soft delete guarantee by querying the table directly. A direct select needs none of that: the soft delete predicate lives once, in the SELECT policy, and applies no matter how the client reads. This spec chooses the direct select (folded into the Decision and Feature design below); a dedicated function is only worth it if a computed value needs server side logic no client side select can express, which this feature does not have.

### Option 0b: Exposing a comment author's display name publicly

`user_preferences.display_name` is owner scoped only (spec 0018, AC-10), so a comment's public read path needs its own narrow exposure. Two shapes considered:

**Option A: A public view selecting only `user_id, display_name`**

Add `public.user_display_names`, a view over `user_preferences` selecting just `user_id` and `display_name`, with its own grant to `anon, authenticated`. The comments select embeds this view (PostgREST can embed a view exactly like a table) instead of `user_preferences` directly.

**Pros**:
- The narrowest possible public surface: only the two columns a comment ever needs are exposed, `theme` and any future preference column stay owner scoped.
- One embedded select, same shape and round trip count the spec already designed (Option 0's direct select), no extra network call.
- `user_preferences`'s own RLS is untouched; spec 0018's AC-10 (a user cannot read another user's full preferences row) still holds, because the view, not the table, is what's public.

**Cons**:
- One more object to maintain (a view plus its grant), though it is a single small migration.

**Option B: A `security definer` function returning display names for a list of user ids**

A `fetch_comment_authors(user_ids uuid[])` function, called as a second request alongside the comments select, mirroring the `recipe_rating_summary` function pattern already in the codebase.

**Pros**:
- Mirrors an existing, proven pattern (function plus revoke/grant) in the codebase.

**Cons**:
- Adds a second round trip per comments page (fetch comments, then fetch their authors), where Option A stays a single embedded select.
- This spec's own Option 0 already rejected a dedicated function for the comments read path itself, for the same reason (an extra migration and signature to version, when a direct select already expresses the need); the same reasoning applies here.

### Option 1: New `comments` table, flat list, hard delete

One row per comment (`id`, `user_id`, `recipe_id`, `body`, `created_at`, `updated_at`), no parent/reply relationship, RLS gated exactly like `ratings`. A user can post many comments on the same recipe; deleting one removes the row permanently.

**Pros**:
- Reuses the project's proven owned row RLS shape (`ratings`/`favorites`/`bar_members`'s non anonymous gate) with no new pattern to learn.
- Simplest data model and UI that still satisfies a real comment section (multiple posts, edit, delete).

**Cons**:
- No threading means a reply to a specific comment reads as a new top level comment; acceptable for a first version, a real limitation if the app grows a heavier community feel.

### Option 2: `comments` table with one level of replies (`parent_comment_id`)

Adds a nullable `parent_comment_id` self reference so a comment can be a direct reply to another, rendered nested one level deep.

**Pros**:
- Lets a reply visibly attach to the comment it responds to, useful once a recipe accumulates many comments.

**Cons**:
- Doubles the UI work (nested rendering, reply composer, reply specific empty states) and the query complexity (fetching a page of top level comments plus their replies) for a first version with no evidence yet that users want threaded conversation on a recipe page.

### Option 3: Soft delete (`deleted_at`) instead of hard delete

Matches the `recipes` table's own soft delete pattern (used for catalog reconciliation) by keeping a tombstone row instead of removing it.

**Pros**:
- Consistent with one existing pattern in the schema (`recipes.deleted_at`).

**Cons**:
- `recipes` soft deletes because an import job reconciles the catalog and might restore a recipe later; a user deleting their own comment has no equivalent restore story, so the tombstone buys nothing and adds a `deleted_at is null` filter to every read for no benefit.

## Rationale

Option 1 wins because it is the smallest model that satisfies every acceptance criterion and it costs the team nothing new to learn: the non anonymous RLS gate, the owner scoped policy shape, and the shared TanStack Query hook pattern are all already proven by `ratings` (spec 0024) and `favorites` (spec 0015). Option 2's threading is a real product idea but has no signal yet that it is needed, and it roughly doubles the surface area (schema, query, and UI) for a feature that is otherwise a thin, well understood slice; threading is recorded in Follow-up instead of built speculatively. Option 3's soft delete only pays off when there is a reconciliation process that might restore a row, as `recipes` has with its import job; a user's own comment has no such process, so soft delete would only add a permanent `deleted_at is null` filter to every future read for no corresponding benefit, and a hard delete matches what a user expects "delete" to mean.

Option 0 (direct select over a dedicated function) wins because nothing in this feature needs server side computation a client side select cannot express once the soft delete predicate lives in the SELECT policy itself; a function would only add a migration to maintain and, if left with an open table level SELECT policy underneath it (as the first draft did), a way to defeat its own guarantee by querying the table directly instead of calling the function.

Option 0b's Option A (a public view) wins over Option B (a function) for the same shape of reason as Option 0 itself: it keeps the comments read path a single embedded select instead of adding a second round trip, and it exposes only the two columns (`user_id`, `display_name`) a comment ever needs, leaving `user_preferences`'s table level RLS and spec 0018's AC-10 completely untouched. A `security definer` function was the closer runner up since it mirrors `recipe_rating_summary`'s existing pattern, but that pattern earns its extra round trip by doing real aggregation (averaging scores); a display name lookup does no computation a plain view can't express just as well.

**Build time addendum:** the embedded select assumed by Option A did not work as designed — PostgREST requires a foreign key relationship to auto-embed a resource, and `comments` has no FK to `user_display_names` (it is a view over `user_preferences`, not a table `comments` references). The build fell back to a second query merged client side, landing at the same round trip cost Option B was rejected for, but for a different reason (a PostgREST mechanics limitation, not an aggregation need). See the Build note in `index.md`'s Decision section.
