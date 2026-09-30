# Verify: recipe comments · spec 0027 · updated 2026-09-30

_Steps derived from spec 0027 acceptance criteria. `/check verify` runs these; `/test` locks the durable ones._

## UI / manual

- [ ] As a signed in user, open a recipe detail page, type a comment (1 to 1000 chars), submit → it appears at the top of the list without a page reload → AC-1
- [ ] As the same user, post a second comment on the same recipe → both comments exist as separate rows, neither overwrote the other → AC-2
- [ ] Edit one of your own comments' text and save → the new text persists, and an "(edited)" marker now shows next to it → AC-3
- [ ] Delete one of your own comments → it disappears from the list immediately, and stays gone after a refresh, for every viewer → AC-4
- [ ] Open the same recipe as a different signed in user; confirm there is no edit/delete affordance on another user's comment; attempt a direct PATCH/DELETE against another user's comment id via the REST API → rejected by RLS → AC-5
- [ ] Open the recipe page signed out (anonymous/guest session) → the full comment list is visible, the composer routes to sign in (not a disabled/unfocusable field) → AC-6
- [ ] As a guest, attempt a direct POST to `comments` via the REST API → rejected by RLS → AC-6
- [ ] Post more than 20 comments (or seed via SQL) on one recipe; load the page → only 20 show, newest first, with a "Load more" button; click it → the next 20 load, no duplicate or skipped row → AC-7
- [ ] While viewing a loaded page, have another session insert a new comment; click "Load more" → the next page loads cleanly with no shift or duplicate of already loaded rows → AC-7
- [ ] Open a recipe with zero comments → a neutral "No comments yet" empty state shows, not a blank area → AC-8
- [ ] Post a comment as a user with `display_name` set → their name shows; post as a user with no `display_name` → "Anonymous" shows; both show the posted date → AC-9
- [ ] Attempt to submit an empty or whitespace only comment via the UI → client blocks it before any network call; attempt the same via direct POST → rejected with a constraint violation → AC-10
- [ ] Attempt to submit a comment over 1000 characters via the UI → client blocks it; attempt the same via direct POST → rejected with a constraint violation → AC-10
- [ ] Soft delete a recipe (set `deleted_at`) that has existing comments → its detail page shows no comment UI; a direct select against `comments` for that `recipe_id` returns zero rows; a direct insert/update attempt against it is rejected by RLS → AC-11

## Commands

- [ ] `pnpm --filter @bartendingapp/shared exec tsc --noEmit` → passes → AC-1 through AC-11 (typecheck)
- [ ] `pnpm --filter web exec tsc --noEmit` → passes → AC-1 through AC-11 (typecheck)
- [ ] `pnpm --filter mobile exec tsc --noEmit` → passes → AC-1 through AC-11 (typecheck)
- [ ] `pnpm test` → all existing tests still pass (no regressions from the new `comments` table/module/hooks) → AC-1 through AC-11
- [ ] Query `select * from pg_policies where tablename = 'comments'` on the live project → 4 policies present (select, insert, update, delete) matching the spec's Security model → AC-5, AC-6, AC-11
- [ ] Query `select grantee, privilege_type, column_name from information_schema.column_privileges where table_name = 'comments'` → `authenticated` has `update` only on `body`, not `recipe_id`/`user_id` → AC-5

## Value sourcing coverage

- [ ] Insert a comment while signed in as user A, then read it back as user B (or a guest) → `user_id` on the row matches A's `auth.uid()`, never a client supplied value → verifies comment ownership sourcing
- [ ] Attempt an insert/edit against a recipe with `deleted_at` set → rejected at the database layer (RLS), confirmed by testing directly against the REST API, not just observing the UI hide the form → verifies AC-11's write guard
- [ ] Change a `display_name` in `user_preferences`, then reload a recipe page with that user's comments → the new name shows (not cached/stale) → verifies the author name is sourced live from `user_display_names`, not denormalized onto the comment row
- [ ] Edit a comment's `body` twice in a row → `updated_at` changes both times, and "(edited)" still shows correctly → verifies the conditional trigger's `is distinct from` guard doesn't suppress a second real edit

## Acceptance-criteria coverage

- AC-1 … submit comment, appears without reload · AC-2 … multiple comments per user per recipe · AC-3 … edit persists + edited marker · AC-4 … delete is permanent and visible to all · AC-5 … ownership enforced by RLS, not just UI · AC-6 … guest read allowed, guest write rejected by RLS · AC-7 … keyset pagination, stable under concurrent insert, load more only when more exists · AC-8 … neutral empty state · AC-9 … author name + Anonymous fallback + edited marker · AC-10 … client pre validation + DB constraint backstop · AC-11 … soft deleted recipe blocks read and write everywhere, not just one path
