# 0027. Recipe comments

**Date**: 2026-09-30
**Status**: In Progress

## Summary

This spec lets a signed in user post, edit, and delete comments on a drink recipe's detail page. Anyone, signed in or not, can read the comments. Comments are plain text, shown newest first, and a user can post more than one comment on the same recipe over time. There is no moderation tooling, threading, or rate limiting in this first version; those are called out as later work.

## Requirements

**User stories**:
- As a signed in user, I want to post a comment on a recipe, so I can share a tip, a variation, or my experience making it.
- As a signed in user, I want to edit my own comment after posting, so a typo or a change of mind is not permanent.
- As a signed in user, I want to delete my own comment, so I can remove something I no longer want posted.
- As any user (guest or signed in), I want to read a recipe's comments, so I can learn from other people's experience before I make the drink.
- As a guest, I want a clear prompt to sign in when I try to comment, so I understand why I cannot post yet.

**Acceptance criteria** (the contract, each criterion is IDed and independently checkable):
- **AC-1**: A signed in user can submit a comment (1 to 1000 characters) on a recipe from its detail page; the comment appears in the list without a page reload.
- **AC-2**: A signed in user can post more than one comment on the same recipe; each is its own row, none overwrite each other.
- **AC-3**: A signed in user can edit the text of their own comment; the edited text persists and the comment's `updated_at` changes so a "(edited)" marker can show it was changed after posting.
- **AC-4**: A signed in user can delete their own comment; once deleted, it is permanently removed (hard delete) and no longer appears to anyone.
- **AC-5**: A user can only edit or delete their own comment; an attempt to edit or delete someone else's comment is rejected by the database, not just hidden by the UI.
- **AC-6**: A guest (anonymous session) sees the full comment list and a disabled comment input with a sign in prompt; an attempted direct write from a guest session is rejected by the database, not just hidden by the UI.
- **AC-7**: The recipe detail page shows comments newest first, paginated (20 per page, load more) using a stable keyset (not offset), so a comment posted while a user is scrolling never shifts or duplicates already loaded rows; a "load more" affordance only shows when another page actually exists.
- **AC-8**: A recipe with zero comments shows a neutral "no comments yet" state instead of an empty blank area.
- **AC-9**: Each comment shows its author's display name (spec 0018's `display_name`), or "Anonymous" when the author has none set, plus when it was posted (and "(edited)" if applicable).
- **AC-10**: A malformed comment (empty, whitespace only, or over 1000 characters) is rejected by the database with a clear constraint violation, never silently truncated or stored; the client also pre validates length before submitting so an over length attempt never costs a round trip.
- **AC-11**: A soft deleted recipe (`deleted_at` set) can never be commented on (insert and edit are both rejected, not only hidden by the UI), never shows a comment UI, and its existing comments are excluded from any read, including a direct table query, not only the paginated read path.

## Decision

**Chosen option**: Option 1: New `comments` table, flat list, hard delete, read via direct PostgREST select (Option 0), author names exposed via a public view (Option 0b, Option A)

Add a `public.comments` table (`id`, `user_id`, `recipe_id`, `body`, `created_at`, `updated_at`) with a single row per comment (not per user per recipe pair). RLS follows the non anonymous, owner scoped shape `ratings` already established, extended two ways a cross check of this spec's first draft surfaced: the SELECT policy itself excludes comments on a soft deleted recipe (not just a read time function, so a direct table query cannot bypass it), and the INSERT/UPDATE policies both reject a write against a soft deleted recipe (the first draft only filtered reads, leaving writes unguarded). Editing is restricted to the `body` column only (column level grant), so an owner cannot repoint their own comment at a different recipe by PATCHing `recipe_id`. The `updated_at` trigger fires only when `body` actually changes, so the "(edited)" marker cannot be falsely triggered by an unrelated future column update. Pagination is keyset based (`before_created_at`, `before_id`), not offset, so a comment inserted while a user is scrolling never shifts or duplicates already loaded rows.

To show a comment author's name to any viewer, add `public.user_display_names`, a view over `user_preferences` selecting only `user_id` and `display_name`, granted `select` to `anon, authenticated`. The comments select embeds this view rather than `user_preferences` directly, so `theme` and any other preference column stay owner scoped exactly as spec 0018 left them; spec 0018's AC-10 is unaffected, since the table's own RLS never changes.

**Implementation skills**: `supabase-postgres-best-practices` (`supabase/agent-skills`, `.agents/skills/supabase-postgres-best-practices/`)

**Build note (departure from the design above):** `public.user_display_names` is a view, not a table `comments` holds a foreign key to, so PostgREST cannot auto-embed it in the comments select as designed. The build fetches display names in a second query (`user_display_names?user_id=in.(...)`) and merges client side instead of a single embedded select. This costs one extra round trip per comments page, the same tradeoff Option 0b's Option B was rejected for, but here it is forced by a PostgREST limitation rather than a design choice. See `packages/shared/src/comments.ts`'s `fetchDisplayNames`.

## Feature design

**Data model sketch**:

| Entity | Field | Type | Nullable | Notes |
|---|---|---|---|---|
| `comments` | `id` | uuid | not null | primary key, `default gen_random_uuid()` |
| `comments` | `user_id` | uuid | not null | FK `auth.users(id)`, `on delete cascade` |
| `comments` | `recipe_id` | uuid | not null | FK `public.recipes(id)`, `on delete cascade` |
| `comments` | `body` | text | not null | `check (char_length(btrim(body)) between 1 and 1000)`, trimmed length so a whitespace only body is rejected (AC-10) |
| `comments` | `created_at` | timestamptz | not null | `default now()` |
| `comments` | `updated_at` | timestamptz | not null | `default now()`, bumped by a trigger that fires only `when (old.body is distinct from new.body)`, so an unrelated future column update never falsely marks a comment edited; drives the "(edited)" marker (AC-3, AC-9) |

Relationships: `comments.user_id` to `auth.users` is N:1; `comments.recipe_id` to `public.recipes` is N:1. Unlike `ratings`/`favorites`, there is no uniqueness constraint on `(user_id, recipe_id)`, since AC-2 allows more than one comment per user per recipe. Index on `(recipe_id, created_at desc, id desc)` for the paginated, newest first, keyset read path (AC-7); the `id` tiebreak keeps ordering deterministic when two comments share a `created_at` (same transaction or clock tick).

`public.user_display_names` is a view, not a table: `select user_id, display_name from public.user_preferences`, created `security_invoker` so it runs as the querying role rather than its owner, with `grant select on public.user_display_names to anon, authenticated`. It adds no new column or row, just a narrower, publicly readable projection of `user_preferences`.

**State transitions**: none beyond insert, update (edit, `body` only), and delete (by the owner), plus cascade delete on `recipe_id` or `user_id` removal; no comment specific state machine. Concurrent edits to the same comment are last write wins, no version column in v1 (explicit scoping, see Consequences); a PATCH or DELETE that affects zero rows (already deleted, or not owned) is treated by the client as "gone or not yours" and resolved by refetching the affected page, never by rolling an optimistic update back into a resurrected row.

**API surface**:
| Endpoint | Method | Key inputs | Key outputs | Auth | Key errors |
|---|---|---|---|---|---|
| `public.comments` (direct PostgREST insert) | POST | `recipe_id: uuid`, `body: text` (1 to 1000 chars, client pre validates before sending); `user_id` supplied as `auth.uid()` by the client, never trusted from the request body via RLS `with check` | the inserted row (`id`, `user_id`, `recipe_id`, `body`, `created_at`, `updated_at`) | signed in, non anonymous session required | RLS denial for a guest/anonymous session or a soft deleted `recipe_id`; `23514` check constraint violation for an empty, whitespace only, or over length `body` |
| `public.comments?id=eq.<id>` (direct PostgREST update, `body` column only) | PATCH | `body: text` (1 to 1000 chars) | the updated row (`body`, `updated_at`), via `Prefer: return=representation` so a zero row result is distinguishable from a successful no op | signed in, must own the row (`auth.uid() = user_id`); column level grant restricts the client to updating `body`, so `recipe_id`/`user_id` cannot be repointed | RLS denial for a non owner, a guest, or a soft deleted recipe's comment; `23514` for an invalid `body`; zero rows affected means "not yours or already gone", client refetches rather than treating it as a hard error |
| `public.comments?id=eq.<id>` (direct PostgREST delete) | DELETE | `id: uuid` | no content, `Prefer: return=representation` so zero rows affected is distinguishable from success | signed in, must own the row (`auth.uid() = user_id`) | RLS denial for a non owner or guest; zero rows affected means "not yours or already gone", client refetches |
| `public.comments` (direct PostgREST select) plus `public.user_display_names` (direct PostgREST select, `user_id=in.(...)`) | GET | `recipe_id: uuid` (filter), `order=created_at.desc,id.desc`, keyset filter `and=(or(created_at.lt.<before_created_at>,and(created_at.eq.<before_created_at>,id.lt.<before_id>)))` on every page after the first, `limit=21` (one more than the page size, trimmed client side to derive `has_more`); a second query against `user_display_names` for the page's distinct `user_id`s | up to 21 comments (`id`, `user_id`, `body`, `created_at`, `updated_at`), newest first, merged client side with the second query's `display_name` per `user_id` | none required (public read, matches `recipes`/`recipe_ingredients` today); the SELECT policy itself excludes a soft deleted recipe's comments, so this holds for any caller, not only a trusted read path; `user_display_names` is grant scoped to `anon, authenticated` so a guest sees author names too | an unknown or soft deleted `recipe_id` returns zero rows, not an error |

**Value sourcing** (every value each action produces, computes, or displays names where it comes from):
| Action | Value produced / displayed | Source |
|---|---|---|
| Submit a comment | The comment's owner | `auth.uid()` inside the RLS policy, never a client supplied `user_id` (same pattern as `pantry_items`/`favorites`/`ratings`) |
| Submit a comment | Whether the session may write at all | `(select auth.jwt() ->> 'is_anonymous') = 'false'`, the same non anonymous gate `bar_members` (spec 0023) and `ratings` (spec 0024) already use |
| Submit or edit a comment | Whether the target recipe accepts writes at all | the INSERT and UPDATE policies' `with check` includes `exists (select 1 from public.recipes r where r.id = recipe_id and r.deleted_at is null)`, so a write against a soft deleted recipe is rejected at the database layer, not only hidden by the UI (AC-11) |
| Edit or delete a comment | Whether this session may modify this row | `auth.uid() = user_id` in the RLS policy's `using`/`with check` clause (AC-5) |
| Edit a comment | Whether only `body` changed (and not `recipe_id`/`user_id`) | a column level `grant update (body)` to `authenticated`, so no other column is reachable via PATCH regardless of RLS |
| Show a comment's author name | The display name text, or the "Anonymous" fallback | a second query to `user_display_names` for the page's `user_id`s (the public view over `user_preferences`, readable by any viewer including a guest), merged client side; the client renders "Anonymous" when that value is null (AC-9), the same fallback shape spec 0018 already established for a user with no name set |
| Show a comment's timestamp and edited marker | The posted time, and whether it was edited | `created_at` for the posted time; the client shows "(edited)" when `updated_at` is later than `created_at`, which the conditional trigger (`when (old.body is distinct from new.body)`) guarantees only reflects a real text change (AC-3, AC-9) |
| Show "no comments yet" | The neutral empty state | client renders it when the first page's select returns zero rows (AC-8) |
| Show or hide "load more" | Whether another page exists | the client requests `limit + 1` rows and trims the extra one; if the extra row was present, `has_more` is true (AC-7) |
| List comments on a recipe | Exclusion of comments on a soft deleted recipe | folded into the SELECT policy itself (`exists (... recipes ... deleted_at is null)`), so this holds for the paginated list, a single comment fetch, or any other query against the table, not only one read path (AC-11) |
| Let a user tell their own comment apart for the edit/delete affordance | Whether a given row belongs to the viewer | the client compares the row's `user_id` to the signed in user's own `auth.uid()` (already held client side from the session); `user_id` is safe to return here since it is only used for this same viewer comparison, not to enumerate another user's comments elsewhere |

**Key invariants**:
- `body`, trimmed, is always 1 to 1000 characters, enforced by a check constraint, never validated only in application code (AC-10).
- Only a non anonymous, signed in session may insert a `comments` row, and only against a recipe that is not soft deleted; RLS enforces both at the database layer regardless of what the client UI allows (AC-6, AC-11).
- Only the owning `user_id` may update or delete a `comments` row, and an update can only ever change `body`; RLS plus the column level grant enforce this regardless of what the client UI allows (AC-5).
- A comment on a since soft deleted recipe never appears in any read of `public.comments`, because the exclusion lives in the table's own SELECT policy, not only in one query's join (AC-11).
- Ordering is always `created_at desc, id desc`; the `id` tiebreak keeps keyset pagination stable even when two comments share a `created_at` (AC-7).
- A delete is permanent; there is no tombstone or restore path (matches AC-4's "no longer appears to anyone").
- `body` is always rendered as a plain text node (React's default escaping on web, plain `Text` on mobile), never through `dangerouslySetInnerHTML`, markdown rendering, or automatic link detection in v1; this is a rendering contract, not a database constraint, and keeps a comment body inert even though it is untrusted user input.

**Security model**:
`comments` follows the same RLS shape as `ratings` combined with `favorites`'s ownership shape, with the soft delete guarantee folded directly into policy predicates rather than left to a read path to enforce: select is open to everyone, signed in or guest, with no session required, but scoped to `exists (select 1 from public.recipes r where r.id = comments.recipe_id and r.deleted_at is null)` (satisfies AC-6 and AC-7's "any viewer" read, and AC-11's exclusion, for every possible query shape against the table); insert requires `auth.uid() = user_id`, `(select auth.jwt() ->> 'is_anonymous') = 'false'`, and the same soft deleted recipe exclusion; update requires `auth.uid() = user_id` and the same soft deleted recipe exclusion, and is further restricted to the `body` column by a column level grant (no anonymous gate needed on update/delete, since only an existing owner, who by definition already passed the insert gate, can match `auth.uid() = user_id`); delete requires only `auth.uid() = user_id`. No compliance scope applies; `body` is user authored free text with no additional PII beyond what `display_name` already exposes under spec 0018's existing model, and `user_id` is only surfaced for the viewer's own ownership comparison, not as a way to enumerate another user's activity.

`public.user_display_names` is the one piece of this spec that touches a different table's exposure. `user_preferences` itself keeps its existing owner scoped RLS unchanged (spec 0008/0018's `auth.uid() = user_id` on select/insert/update); nothing here loosens it, so spec 0018's AC-10 ("a user cannot read another user's name") still holds for the `user_preferences` table directly. The view sits alongside it as a separate, narrower object exposing only `user_id` and `display_name`, granted `select` to `anon, authenticated`; a caller reading the view can see any user's display name (by design, the same way any viewer can already see who rated or favorited nothing in particular, but now can see who commented), but cannot see `theme` or any other preference column, and cannot write through the view at all (no insert/update/delete grant).

**Configuration required**: none, no new environment variables or credentials.

**Critical test scenarios** (each maps to an acceptance criterion in ## Requirements):
- Happy path: a signed in user posts a comment, sees it appear at the top of the list without a reload, verifies **AC-1**, **AC-7**
- Multiple comments: the same user posts a second comment on the same recipe; both rows exist independently, verifies **AC-2**
- Edit: the user edits their own comment's text; the new text persists and an "(edited)" marker appears, verifies **AC-3**, **AC-9**
- Edit does not reach other columns: a PATCH attempt that also tries to change `recipe_id` is rejected by the column level grant, verifies **AC-5**
- Delete: the user deletes their own comment; it is gone from the list for every viewer afterward, verifies **AC-4**
- Ownership denial: a signed in user's attempt to edit or delete another user's comment is rejected by RLS, verifies **AC-5**
- Guest blocked: an anonymous session's direct insert attempt against `comments` is rejected by RLS, and the UI shows a disabled input with a sign in prompt, verifies **AC-6**
- Live insert during scroll: a second comment is posted by another user while the first page is displayed; loading the next page via the keyset cursor neither repeats nor skips a row, verifies **AC-7**
- Cold start: a recipe with no comments shows the neutral "no comments yet" state, not a blank area, verifies **AC-8**
- Anonymous author: a comment from a user with no `display_name` set shows "Anonymous", verifies **AC-9**
- Invalid input: an insert or update attempt with an empty, whitespace only, or over 1000 character `body` is rejected with a constraint violation, verifies **AC-10**
- Soft delete write guard: an insert or edit attempt against a since soft deleted recipe's comment is rejected by RLS, not only hidden by the UI, verifies **AC-11**
- Soft delete read guard: a comment on a since soft deleted recipe is excluded from a direct table select, not only the app's own query shape, and the recipe's page shows no comment UI, verifies **AC-11**

## Build plan

1. Write the `comments` table migration: table, primary key, trimmed length check constraint, `(recipe_id, created_at desc, id desc)` index, a conditional `updated_at` trigger (`when (old.body is distinct from new.body)`) reusing the project's existing trigger function, a column level `grant update (body)` to `authenticated`, and RLS enabled with the select (soft delete scoped)/insert (non anonymous + soft delete scoped)/update (owner + soft delete scoped)/delete (owner) policies above; plus a second migration (or the same one) adding the `public.user_display_names` view (`security_invoker`, `select user_id, display_name from public.user_preferences`) with `grant select to anon, authenticated`, leaving `user_preferences`'s own RLS untouched; plus regenerate shared TypeScript types, satisfies **AC-1**, **AC-2**, **AC-3**, **AC-5**, **AC-6**, **AC-9**, **AC-10**, **AC-11**
2. Add a shared `comments.ts` module in `packages/shared` (pure helpers: body validation including the trimmed length check and a client side pre flight so an over length attempt never round trips, the insert/update payload shape, a `mapCommentError` helper translating a `23514` or an RLS/zero rows result into a typed, user facing error) plus a per app `useRecipeComments(recipeId)` keyset paginated query hook (requesting `limit + 1` per page, trimming the extra row to derive `has_more`) and `usePostComment`/`useEditComment`/`useDeleteComment` mutation hooks with optimistic update; a PATCH/DELETE that affects zero rows resolves by refetching the affected page rather than rolling the optimistic update back into a resurrected row, satisfies **AC-1**, **AC-2**, **AC-3**, **AC-4**, **AC-7**, **AC-10**
3. Build the comment list and composer UI on the recipe detail page (web and mobile): the keyset paginated newest first list with the neutral zero state and a real "load more" gated on `has_more`, author name with the "Anonymous" fallback, "(edited)" marker, `body` rendered as plain text only (no `dangerouslySetInnerHTML`, no markdown, no autolinking), and the composer gated on session (an enabled looking composer that routes a guest to sign in on focus or submit, not a disabled/unfocusable field, per accessibility), preserving the draft text on a failed post, satisfies **AC-1**, **AC-6**, **AC-7**, **AC-8**, **AC-9**
4. Build the edit and delete affordances on a user's own comment (inline edit form restricted to `body`, delete confirmation), satisfies **AC-3**, **AC-4**, **AC-5**
5. Cross platform parity check: confirm both apps share the same query keys, validation, keyset pagination cursor handling, and gating behavior for the comment UI, satisfies **AC-1** through **AC-11**

## Consequences

**Positive**:
- Gives recipe pages a real conversation surface for the first time, reusing three already proven patterns end to end (the `favorites`/`pantry_items` owned row shape, the `bar_members`/`ratings` non anonymous RLS gate, and the shared TanStack Query hook pattern), so the team is not learning anything structurally new.
- The read path needs no session, so guest users get full read access with zero extra gating logic on the client.

**Negative / tradeoffs**:
- No threading means a reply to a specific comment shows up as an unrelated new comment, which can read oddly once a recipe has many comments from different people; acceptable for a first version, flagged as Follow-up.
- No rate limiting or moderation means a signed in user could post many comments quickly, or post abusive text, with no automatic safeguard beyond the 1000 character cap; acceptable to ship without given the project's tracer bullet approach, but a real gap if usage grows.
- Hard delete means a removed comment leaves no audit trail; acceptable since comments carry no compliance or money relevant data, unlike the cases where the project's expert rules call an audit log mandatory.
- Concurrent edits to the same comment are last write wins, with no version column or conflict detection in v1; the rare case of two devices editing the same comment near simultaneously silently keeps whichever write lands last. Acceptable given how unlikely simultaneous self edits are; flagged as Follow-up if it ever proves otherwise.
- The comments read path costs two round trips (comments, then display names) instead of the single embedded select this spec designed, because `user_display_names` is a view with no foreign key PostgREST can auto-embed through; see the Build note under Decision.

**Neutral**:
- No changes to `recipes`, `pantry_items`, `favorites`, or `ratings`; this is purely additive (one new table, one new view, no new function), which keeps blast radius small and fully revertable by rolling back the migration(s).
- `user_preferences`'s own RLS is unchanged; `public.user_display_names` is a new, separate, narrower public object sitting alongside it, not a loosening of the table's existing owner scoped policies. Spec 0018's AC-10 still holds for `user_preferences` directly.

## Follow-up

- [ ] Add a per user rate limit or cooldown on posting comments once real usage shows this is needed; this spec ships with none, matching spec 0024's own precedent of shipping ratings without a rate limit first.
- [ ] Consider one level of replies (`parent_comment_id`) if real usage shows users want to respond to a specific comment rather than post a new top level one; this spec deliberately scoped that out as Option 2 above.
- [ ] Consider a report or flag mechanism, and any admin moderation tooling, if abusive content becomes a real problem; this spec ships with no moderation surface at all.
- [ ] Consider adding a `comment_posted` event to spec 0013's basic product analytics set, the same way `recipe_favorited` was added after the fact in spec 0015; this spec's Build plan does not instrument it, so it is explicitly out of scope for this build, not an oversight.
- [ ] Consider a version column (optimistic concurrency) if two devices editing the same comment near simultaneously ever proves to be a real problem; this spec ships with last write wins (see Consequences).
