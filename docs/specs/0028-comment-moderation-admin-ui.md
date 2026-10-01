# 0028. Comment moderation admin UI

**Date**: 2026-09-30
**Status**: Accepted

## Summary

This spec adds a simple admin only page where you, the site's one admin, can see every comment posted across all recipes and delete any of them. It closes the moderation gap spec 0027 shipped without: today the only way to remove an abusive or spam comment is a hand run SQL command against the live database. It reuses the comment data and delete pattern spec 0027 already built, adding one new `is_admin` flag and one new, unlisted page.

## Context

Spec 0027 shipped recipe comments with no moderation path at all: a signed in user can post free text, and only that same user can edit or delete their own comment (enforced by row level security, the database layer rule that decides who can read or write a row). Its own Follow-up section flagged this directly: "Consider a report or flag mechanism, and any admin moderation tooling, if abusive content becomes a real problem."

The project has exactly one maintainer today and no existing concept of a role, permission tier, or elevated account anywhere in the schema or either app. Comments are public to read (signed in or guest) and go live immediately with no review step, so the only real safeguard against abusive or spam text is the 1000 character limit. The forcing question is narrow: how does the one admin get a safe, fast way to remove a bad comment, without building a general purpose role system the project does not otherwise need.

## Requirements

**User stories**:
- As the site admin, I want to see every comment posted across all recipes in one place, so I can spot abusive or spam content without visiting each recipe page.
- As the site admin, I want to delete any comment, not only my own, so I can remove content that should not be public.
- As a non admin user or a guest, I should never be able to reach or affect the admin page, so moderation stays admin only.

**Acceptance criteria** (the contract, each criterion is IDed and independently checkable):
- **AC-1**: A signed in user whose `user_preferences.is_admin` is `true` can open `/admin/comments` and see a list of comments across all recipes, newest first, each showing the comment body, author display name (or "Anonymous"), the recipe it belongs to (name, linking to the recipe's detail page), and when it was posted.
- **AC-2**: The admin list paginates with the same keyset (not offset) pattern spec 0027 used, so a comment posted while the admin is scrolling never shifts or duplicates already loaded rows; a "load more" affordance only shows when another page actually exists.
- **AC-3**: The admin can delete any comment from the list, including one they do not own; the delete is a hard delete, identical in effect to a user deleting their own comment under spec 0027, and the comment disappears from the list and from the recipe's own comment list for every viewer.
- **AC-4**: A signed in user whose `is_admin` is not `true`, or a guest, who requests `/admin/comments` is redirected to the home page before any admin markup or comment data reaches them; no error message reveals that an admin page exists.
- **AC-5**: An attempt by a non admin session to delete a comment it does not own, made directly against the database (bypassing the UI), is rejected by row level security, exactly as spec 0027's AC-5 already requires; this spec only adds an additional, admin scoped allowance to that same policy, it does not loosen it for anyone else.
- **AC-6**: A recipe with zero comments shows a neutral empty message on the admin list the same way spec 0027's AC-8 handles it on the recipe page; an admin list with zero comments overall doesn't error.

## Options considered

### Option 1: `is_admin` column on `user_preferences`, server gated Next.js route, RLS OR clause

Add a boolean `is_admin` column (default `false`) to the existing `public.user_preferences` table, set manually via SQL for the one admin account. The comments table's existing owner scoped delete policy gets an added `OR` clause allowing a row where the caller's own `user_preferences.is_admin` is `true`. The admin page is a Next.js server component at `/admin/comments` that reads the session, checks the flag, and redirects non admins before rendering.

**Pros**:
- No new table, no new auth mechanism; reuses the per user profile row and RLS pattern the project already has for `comments`, `ratings`, and `favorites`.
- The flag lives next to other per user settings (`theme`, `display_name`), consistent with where spec 0008/0018 already put personal state.

**Cons**:
- `user_preferences` is otherwise owner scoped by its own RLS (a user can read and write their own row); the admin flag must never be exposed to a column the owner can write themselves, so the column needs an explicit column level grant restriction (no `update` grant on `is_admin` to `authenticated`), one more thing to get right in the migration.

### Option 2: Separate `admin_users` allowlist table

A tiny table with just `user_id` as its primary key, no RLS select grant to `authenticated` at all (only readable by the service role or by a security definer function used inside policies). Membership in the table means admin.

**Pros**:
- Fully isolated from `user_preferences`; there is no way an admin flag could leak through that table's own select policy, because it is not in that table at all.
- Trivial to audit: the entire admin list is `select * from admin_users`.

**Cons**:
- A new table and a new RLS object for a single boolean's worth of information, when the project has exactly one admin today; more schema surface than the decision warrants.

### Option 3: Supabase custom JWT claim via auth hook

Set a custom claim (e.g. `app_metadata.is_admin`) through a Postgres auth hook, checked in RLS via `auth.jwt()` with no table read at all inside the policy.

**Pros**:
- No table read inside the RLS policy at request time; this is the pattern Supabase's own docs recommend for role based access at larger scale.

**Cons**:
- Requires wiring and testing an auth hook, a new moving part with its own failure mode (a hook misconfiguration silently leaves every session without the claim); meaningfully more setup than a column check for a single admin account, and the project has no other use for custom claims yet.

## Decision

**Chosen option**: Option 1: `is_admin` column on `user_preferences`, server gated Next.js route, RLS OR clause

Add `is_admin boolean not null default false` to `public.user_preferences`. Grant `update` on `user_preferences` to `authenticated` for only the columns it already allows (`display_name`, `theme`); `is_admin` is excluded from that grant, so no owner, admin or not, can set their own flag through the API. The value is set once, manually, via a SQL statement run directly against the project (matching the project's existing precedent of a manual step for data only the maintainer should touch, the same shape as the Supabase Vault secret placeholder convention already in use).

The `comments` table's existing delete policy (`using (auth.uid() = user_id)`) gets an `OR` clause: `using (auth.uid() = user_id OR exists (select 1 from public.user_preferences where user_id = auth.uid() and is_admin))`. No other `comments` policy changes: select stays exactly as spec 0027 left it (open to everyone, scoped to non soft deleted recipes), and insert/update stay owner only, since this spec adds no admin editing capability.

The admin page is a Next.js App Router server component (`apps/web/src/app/admin/comments/page.tsx`) that reads the session server side, checks `is_admin`, and redirects to `/` immediately if false or absent, before any query against `comments` runs. The route carries no nav link; it is reached only by its direct URL.

**Implementation skills**: `supabase-postgres-best-practices` (`supabase/agent-skills`, `.agents/skills/supabase-postgres-best-practices/`) · `nextjs-app-router-patterns` (`wshobson/agents`, `.agents/skills/nextjs-app-router-patterns/`)

## Rationale

Option 1 wins because the project's actual load is one admin, for the foreseeable future, and every other per user flag (`display_name`, `theme`) already lives in `user_preferences`; adding a table (Option 2) or an auth hook (Option 3) solves a scale problem this project does not have, at a real cost in new schema objects or new infrastructure to operate correctly. The column's one real risk, an admin accidentally granting themselves (or anyone) admin through the normal profile update path, is closed directly by excluding `is_admin` from the `authenticated` update grant, which is a one line migration detail, not an architectural tradeoff. The RLS `OR` clause keeps the change inside the same policy spec 0027 already wrote and reviewed, rather than introducing a second, separate delete policy object to reason about (Postgres ORs multiple permissive policies together regardless, so the two forms are behaviorally identical; the single policy form was marginally preferred by you for readability).

## Feature design

**Data model sketch**:

| Entity | Field | Type | Nullable | Notes |
|---|---|---|---|---|
| `user_preferences` | `is_admin` | boolean | not null | new column, `default false`; no `update` grant to `authenticated`, settable only via a direct SQL statement or the service role |

No new table. No change to `comments`'s columns; only its delete policy predicate changes (see Decision).

**State transitions**: none; `is_admin` is a static flag, not a lifecycle, set once outside the application.

**API surface**:
| Endpoint | Method | Key inputs | Key outputs | Auth | Key errors |
|---|---|---|---|---|---|
| `/admin/comments` (Next.js server route) | GET | none (session read server side) | the rendered admin comment list, or a redirect | signed in with `is_admin = true`; a non admin or guest is redirected to `/` before any data loads | no error state surfaced; unauthorized is a silent redirect (AC-4) |
| `public.comments` (direct PostgREST select, admin list query) | GET | `order=created_at.desc,id.desc`, keyset filter on subsequent pages, `limit=<page size + 1>`; embeds `public.recipes(name)` for the recipe column and a second query to `user_display_names` for author names, matching spec 0027's existing pattern | up to `page size + 1` comments across all recipes, trimmed client side to derive `has_more` | runs under the signed in admin's own session; relies on the existing public select policy, no new read grant needed | an admin page with zero comments overall returns zero rows, rendered as the neutral empty state (AC-6) |
| `public.comments?id=eq.<id>` (direct PostgREST delete) | DELETE | `id: uuid` | no content, `Prefer: return=representation` so zero rows affected is distinguishable from success | signed in; allowed when `auth.uid() = user_id` OR the caller's `user_preferences.is_admin` is true | RLS denial for a non admin, non owner session (AC-5); zero rows affected means already gone, client refetches the page |

**Value sourcing**:
| Action | Value produced / displayed | Source |
|---|---|---|
| Open `/admin/comments` | Whether this session may view the page at all | server side read of `user_preferences.is_admin` for the current `auth.uid()`, checked before any comment query runs (AC-1, AC-4) |
| List comments | The recipe name and link next to each comment | `comments.recipe_id` joined to `public.recipes(id, name)`, a foreign key PostgREST can embed directly (unlike the `user_display_names` view) |
| List comments | The author display name, or "Anonymous" | the same `user_display_names` view and client side merge spec 0027 already built (`fetchDisplayNames` in `packages/shared/src/comments.ts`), reused unchanged |
| Delete any comment | Whether this session may delete this specific row | the RLS policy's own `OR` clause: ownership (`auth.uid() = user_id`) or admin (`exists (... is_admin)`); the client never decides this, it only reacts to the API's accept or reject (AC-3, AC-5) |
| Show or hide "load more" | Whether another page exists | the client requests `limit + 1` rows and trims the extra one, identical to spec 0027's existing pattern (AC-2) |

**Key invariants**:
- Only a row where `user_preferences.is_admin = true` for the caller's own `auth.uid()` may delete a comment it does not own; this is enforced by the RLS policy itself, not only by hiding the admin page's delete button (AC-5).
- `is_admin` can never be set by any authenticated user acting on their own row through the normal API, because the column is excluded from `user_preferences`'s `update` grant to `authenticated`; it can only be set by a direct SQL statement or the service role.
- The admin page never queries or renders comment data before confirming `is_admin` server side; the check and the redirect happen in the same server render pass, so no admin markup or data is ever sent to a non admin browser (AC-4).
- An admin delete is identical in effect to a user's own delete under spec 0027: permanent, no tombstone, no restore path (matches this spec's AC-3 and 0027's existing Consequences).

**Security model**:
Read access to `comments` is unchanged from spec 0027: open to any viewer, signed in or guest, scoped to non soft deleted recipes. The only change is to the delete policy, which gains one additional allowance: a caller whose own `user_preferences.is_admin` is `true` may delete any comment, in addition to the existing owner only allowance. Insert and update policies are untouched; this spec adds no admin editing capability, matching the "list and delete only" scope decided for this first version. `user_preferences`'s own select/update RLS (owner scoped, from spec 0008/0018) is unchanged; the new `is_admin` column is simply excluded from what an owner can write, the same technique spec 0027 already used to restrict comment edits to the `body` column only. No compliance scope applies.

**Configuration required**: none; no new environment variables. The single admin account's `is_admin = true` value is set once by running a SQL statement directly against the live project after the migration lands (a manual step, not a configuration value, since there is exactly one admin and no UI to grant the role).

**Critical test scenarios** (each maps to an acceptance criterion in ## Requirements):
- Happy path: the admin opens `/admin/comments`, sees comments across multiple recipes with recipe name, author, body, and timestamp, verifies **AC-1**
- Pagination: a comment is posted on any recipe while the admin is viewing a loaded page; loading the next page via the keyset cursor neither repeats nor skips a row, verifies **AC-2**
- Admin delete: the admin deletes a comment they do not own; it disappears from the admin list and from that recipe's own public comment list for every viewer, verifies **AC-3**
- Unauthorized route access: a signed in non admin user, and separately a guest, request `/admin/comments` directly by URL and are redirected to `/` with no admin content ever rendered, verifies **AC-4**
- RLS denial bypassing the UI: a non admin session's direct DELETE request against another user's comment is rejected by RLS, verifies **AC-5**
- Empty state: the admin list with zero comments across the whole app shows a neutral empty message, not a blank area or an error, verifies **AC-6**

## Build plan

1. [x] Write the migration: add `is_admin boolean not null default false` to `public.user_preferences`, confirm the column is excluded from `user_preferences`'s existing `update` grant to `authenticated`, and update the `comments` table's delete policy to add the admin `OR` clause; regenerate shared TypeScript types, satisfies **AC-3**, **AC-5**
2. [x] Adopt `@supabase/ssr` per spec 0029 (three client factories, middleware cookie refresh, one time anonymous session carry over), satisfying this feature's own **AC-4**
3. [x] Add an `isAdmin(client, userId)` helper and an admin scoped comments query (`fetchAllComments`, keyset paginated, joined to `recipes(name)`, reusing the existing `fetchDisplayNames` helper) to `packages/shared/src/comments.ts`, satisfies **AC-1**, **AC-2**, **AC-6**
4. [x] Build `apps/web/src/app/[locale]/admin/comments/page.tsx` (path corrected per spec 0029): a server component that reads the session via `createSupabaseServerClient`, redirects to the locale home when `is_admin` is not true, and otherwise renders the paginated comment list with a delete action per row (reusing the existing `deleteComment` function from spec 0027, which already allows any row the caller's RLS permits), satisfies **AC-1**, **AC-2**, **AC-3**, **AC-4**, **AC-6**
5. [ ] Manually set `is_admin = true` for your own account via a SQL statement against the live project, and confirm end to end: the page loads for you, a non admin/guest is redirected, and a delete from the admin page removes the comment from the recipe's own page too, satisfies **AC-1** through **AC-6**

## Consequences

**Positive**:
- Closes the one real safety gap spec 0027 shipped with: an abusive or spam comment can now be removed in a few clicks instead of a hand run SQL command against the live database.
- Costs almost nothing structurally: one boolean column, one widened policy clause, and one new page, all reusing patterns (keyset pagination, the owner scoped RLS shape, the display name view) spec 0027 already proved out.

**Negative / tradeoffs**:
- No audit trail for an admin delete, same as a user's own delete under spec 0027; if a dispute ever arises over why a comment was removed, there is no record of who deleted it or what it said. Acceptable for a solo admin project; flagged as Follow-up if it ever needs revisiting.
- No way to grant a second admin without running SQL by hand; acceptable today (one admin, for the foreseeable future, per your own answer), but means adding a second moderator later is a manual, undocumented-in-UI step.
- The admin list has no search or filter by recipe or author in this version; fine at today's comment volume, would need revisiting if volume grows enough that scrolling a single newest first list stops being practical.

**Neutral**:
- No change to `comments`'s select, insert, or update policies; this is purely a widened delete policy plus one new column, keeping blast radius small and fully revertable by rolling back the migration.
- The admin route is unlisted (no nav link), consistent with the decision that a single admin reaching it by direct URL is sufficient; this can be revisited if that stops being true.

## Follow-up

- [ ] Add a way to grant `is_admin` to a second account without running SQL by hand, if a second moderator is ever added; out of scope for this spec, which assumes exactly one admin.
- [ ] Consider an audit trail (who deleted what, when) for admin deletes if disputes or false positive removals ever become a real concern; this spec ships with no audit trail, matching spec 0027's existing hard delete, no audit trail stance for user deletes.
- [ ] Consider search or filter by recipe or author on the admin list if comment volume grows enough that a single newest first scroll becomes impractical.
- [ ] Consider a report or flag mechanism so moderation can be reactive to user reports rather than only the admin proactively scanning the list; spec 0027 flagged this and it remains unaddressed by this spec.
