# 0062. Comment safety: reports, blocks, and photo screening

**Date**: 2026-11-18
**Status**: In Progress

## Summary

This spec adds three safety tools to recipe comments. Signed in users can report a comment or a single photo and block another user. Every new photo is checked by Claude Haiku (an AI image check) before anyone else can see it. Anything flagged, by the check or by three reports, stays hidden until you, the admin, clear it or remove it from a new "Needs review" tab on `/admin/comments`. All of the hiding is enforced by the database (row level security, the Postgres rules that decide who can read a row), so older mobile builds and the server rendered page respect it too.

## Requirements

**User stories**:
- As a signed in user, I want to report a comment or a photo that breaks the rules, so the admin sees it and I stop seeing it.
- As a signed in user, I want to block someone, so their comments and photos no longer show up for me.
- As a user posting photos, I want to know my photo is being checked, so I do not think it failed to upload.
- As the admin, I want unsafe photos held back automatically and reported items gathered in one queue, so moderation works while I am away.
- As any viewer, guest or signed in, I want never to see a photo that has not passed the check.

**Acceptance criteria**:
- **AC-1**: A photo attached by `post_comment` or `edit_comment` starts as `pending`. A pending photo is hidden from everyone except its author and the admin. The author sees it with a "Checking photo" badge. Photos that existed before this migration are `approved`.
- **AC-2**: Each new photo is screened automatically, started by the database (no client call needed), normally within a minute. A pass sets it to `approved` and it becomes visible to everyone. A flag sets it to `flagged` with the categories the check reported (any of `nudity_sexual`, `gore_violence`, `hate_symbols`, `illegal_drugs`, `minor_with_alcohol`, `personal_info`), and it stays hidden. Drinks, bottles, bars, and adults holding drinks always pass.
- **AC-3**: If a screening call fails (timeout, provider error, bad response), the photo stays `pending`. A cron job every 5 minutes retries photos pending for more than 2 minutes. After 3 failed attempts the photo becomes `flagged` with reason `screening_failed`. Independently of the function, the same cron flags any photo still `pending` 1 hour after upload as `screening_failed`, so a broken key or an undeployed function still lands photos in the queue. A photo is never shown to others without a passing check or an admin clear.
- **AC-4**: At most 2000 screening calls run per UTC day. Past that, pending photos stay pending without using up a failed attempt, a Sentry warning is sent, and the cron screens them after the reset.
- **AC-5**: A comment with no text, whose photos are all hidden from the current viewer, is not shown to that viewer at all (no empty comment shell). A comment with text whose photos are all hidden shows its text with no photo row.
- **AC-6**: A signed in, non anonymous user can report someone else's comment (whole comment) or one photo, choosing a reason (`spam`, `offensive`, `sexual`, `off_topic`, `other`) and adding an optional note of 1 to 500 characters. A guest sees a sign in prompt instead. A user cannot report their own content.
- **AC-7**: A user can report a given comment or photo only once, ever ("You already reported this"), and can file at most 20 reports in any rolling 24 hours ("You have reached today's report limit").
- **AC-8**: After a successful report the reporter sees a thank you message, and the reported comment or photo is hidden for that reporter right away, on every device and after reload.
- **AC-9**: When a comment or photo has 3 open reports from 3 different people whose accounts were at least 24 hours old when they reported, it becomes `flagged` with reason `reports` and is hidden from everyone except its author and the admin. Reports from younger accounts are still stored and still put the item in the admin queue, but do not count toward the 3. Comment reports hide the whole comment (text and photos); photo reports hide only that photo.
- **AC-10**: The author of a flagged comment or photo still sees it, with a "Hidden while under review" note. Editing a flagged comment keeps it flagged.
- **AC-11**: The admin sees a "Needs review" tab on `/admin/comments`. Each row is one comment that needs attention: the comment itself is flagged or has open reports, or any of its photos is flagged or has open reports. Rows with anything hidden come first, then rows with only open reports, oldest first within each group. Each row shows the recipe, author, text, all photos, and per target (the comment, and each photo needing attention) its status, open report count per reason, report notes, and the screening categories or failure reason. Comments on deleted recipes are left out. The admin nav shows a count badge equal to the number of rows (distinct comments).
- **AC-12**: On each target in a review row, **Clear** sets that target (only) to `approved` and resolves its open reports as `cleared`. **Remove** deletes it through the existing admin delete paths (the stored file is deleted too) and resolves its open reports as `removed`. Resolved reports are kept with a snapshot of the content's author. After a clear, new reports from other people start a fresh count toward 3.
- **AC-13**: A Sentry warning is sent once when an item changes to `flagged` (screening flag, screening failure, or the counting report); later reports on an item already flagged send nothing. The warning carries ids and categories only, never note text or image data.
- **AC-14**: A signed in, non anonymous user can block another comment author from that comment's menu, after a confirm step. The blocked person's comments and photos disappear for the blocker everywhere comments show, on web and mobile. The block is one way and silent. A user cannot block themselves.
- **AC-15**: Account settings on web and mobile show a "Blocked people" list (display name and block date) with an Unblock action per row. Unblocking makes that person's content visible again.
- **AC-16**: Every rule above is enforced by the database, not only the UI: clients cannot write `content_reports` directly, cannot change any `moderation_status`, and guest or signed in reads never return content hidden from them. The server rendered recipe page and its JSON-LD (structured data for search engines) never include pending or flagged content.
- **AC-17**: Report, block, the blocked list, and the "Checking photo" and "Hidden while under review" states work the same on web and mobile, with strings in all 9 locales.
- **AC-18**: The privacy page states that uploaded comment photos are checked by an automated service (Anthropic) before they are shown, and that reported content is reviewed by the admin.

## Decision

**Chosen option**: Option 1: Database first moderation.

Moderation state lives as a `moderation_status` column on `comments` and `comment_photos`; row level security hides anything not visible to the current viewer; an `after insert` trigger on `comment_photos` calls a new `screen-comment-photo` Edge Function through `pg_net`, which asks Claude Haiku 5.5 for a verdict, with a 5 minute cron as the backstop; reports and blocks are two new tables written through a security definer function (reports) or plain RLS (blocks).

**Implementation skills**: `supabase-postgres-best-practices` (`supabase/agent-skills`, `.agents/skills/supabase-postgres-best-practices/`) · `react-native-best-practices` (`callstackincubator/agent-skills`, `.agents/skills/react-native-best-practices/`) · `nextjs-app-router-patterns` (`wshobson/agents`, `.agents/skills/nextjs-app-router-patterns/`) · `vitest` (`antfu/skills`, `.agents/skills/vitest/`) · `sentry-get-started` (`getsentry/sentry-for-ai`, `.agents/skills/sentry-get-started/`)

## Feature design

**Data model sketch**:

New enums:
- `moderation_status`: `pending` (photo not screened yet), `approved` (visible), `flagged` (waiting for the admin). No `rejected` value: rejecting deletes the content.
- `moderation_flag_reason`: `screening`, `screening_failed`, `reports`.
- `report_reason`: `spam`, `offensive`, `sexual`, `off_topic`, `other`.
- `report_target_kind`: `comment`, `photo`.
- `report_resolution`: `cleared`, `removed`.

Changed tables:

| Table | Column | Type | Notes |
|---|---|---|---|
| `comments` | `moderation_status` | `moderation_status` not null default `approved` | becomes `flagged` at 3 open comment reports |
| `comments` | `flag_reason` | `moderation_flag_reason` null | always `reports` for comments |
| `comments` | `flagged_at` | `timestamptz` null | set on each change to `flagged`, cleared on Clear; queue sort key |
| `comment_photos` | `moderation_status` | `moderation_status` not null | added with default `approved` (backfills existing rows), then default changed to `pending` |
| `comment_photos` | `flag_reason` | `moderation_flag_reason` null | why it waits for the admin |
| `comment_photos` | `flag_categories` | `text[]` null | categories the check reported |
| `comment_photos` | `screening_attempts` | `smallint` not null default 0, check 0 to 3 | failed attempts only |
| `comment_photos` | `screened_at` | `timestamptz` null | when the last verdict landed |
| `comment_photos` | `flagged_at` | `timestamptz` null | set on each change to `flagged`, cleared on Clear; queue sort key |
| `comment_photos` | `screening_claimed_at` | `timestamptz` null | lease so the trigger call and the sweep never screen the same photo at once; partial index `(created_at) where moderation_status = 'pending'` |

New tables:

| Table | Columns | Constraints and relationships |
|---|---|---|
| `content_reports` | `id` uuid PK default `gen_random_uuid()` · `reporter_id` uuid not null · `target_kind` `report_target_kind` not null · `comment_id` uuid null (set for photo reports too: the photo's parent) · `photo_id` uuid null · `content_author_id` uuid null · `reason` `report_reason` not null · `note` text null · `counts_toward_hide` boolean not null (reporter account at least 24 hours old at insert) · `created_at` timestamptz not null default `now()` · `resolved_at` timestamptz null · `resolution` `report_resolution` null · `resolved_by` uuid null | `reporter_id` → `auth.users` on delete cascade · `comment_id` → `comments` on delete set null · `photo_id` → `comment_photos` on delete set null · `content_author_id` → `auth.users` on delete set null · `resolved_by` → `auth.users` on delete set null · check `note is null or char_length(btrim(note)) between 1 and 500` · check `target_kind = 'photo'` requires `photo_id` at insert (enforced in `report_content`, since the link nulls on removal) · check `(resolved_at is null) = (resolution is null)` · partial unique index `(reporter_id, comment_id) where target_kind = 'comment' and comment_id is not null` · partial unique index `(reporter_id, photo_id) where target_kind = 'photo' and photo_id is not null` · index `(comment_id) where resolved_at is null` · index `(photo_id) where resolved_at is null` · index `(reporter_id, created_at)` for the 24 hour limit |
| `user_blocks` | `blocker_id` uuid · `blocked_id` uuid · `created_at` timestamptz not null default `now()` | PK `(blocker_id, blocked_id)` · both → `auth.users` on delete cascade · check `blocker_id <> blocked_id` · index `(blocked_id)` |
| `photo_screening_usage` | `day` date PK · `calls` integer not null default 0 | one row per UTC day; service role only, no client grants |

Relationships: `comments` 1:N `content_reports`; `comment_photos` 1:N `content_reports`; `auth.users` 1:N `content_reports` (as reporter, as author); `auth.users` N:M `auth.users` through `user_blocks`.

**State transitions**:
- Photo: `pending` → `approved` (screening pass, or admin Clear) · `pending` → `flagged` (screening flag, 3rd failed attempt, or still pending 1 hour after upload) · `approved` → `flagged` (3rd open photo report) · `flagged` → `approved` (admin Clear) · any → deleted (author edit/delete, admin Remove).
- Comment: `approved` → `flagged` (3rd open comment report) · `flagged` → `approved` (admin Clear) · any → deleted. An author edit never changes the status.
- Report: open (`resolved_at` null) → `cleared` (admin Clear on its target) · open → `removed` (its target deleted by anyone, set by the delete trigger).

**API surface**:

| Surface | Kind | Key inputs | Key outputs | Auth | Key errors |
|---|---|---|---|---|---|
| `report_content` | Postgres function (security definer) | `p_target_kind`, `p_comment_id` uuid, `p_photo_id` uuid null (required for `photo`, must belong to `p_comment_id`; must be null for `comment`), `p_reason`, `p_note` text null | `{ report_id, became_hidden: boolean }` (true only on the change to `flagged`) | signed in, non anonymous | checked in this order: `invalid_input` (bad kind, reason, ids, or note) · `not_signed_in` · `not_found` (missing, or not visible to the caller ignoring only their own report hide) · `own_content` · `already_reported` · `report_limit`; any other error maps to `request_failed` |
| `user_blocks` insert / delete | table, RLS | `blocked_id` | row | signed in, non anonymous; `blocker_id = auth.uid()` | check violation (self), unique violation mapped to success (already blocked) |
| `fetchBlockedUsers` | select `user_blocks` joined to `user_display_names` | none | `{ blockedId, displayName, createdAt }[]` | owner only via RLS | `request_failed` |
| `admin_review_queue` | Postgres function (security definer) | `p_cursor_group` smallint null, `p_cursor_sort_at` timestamptz null, `p_cursor_id` uuid null (all null or all set), `p_limit` int (1 to 50, default 20) | one row per comment: comment (with all photos, any status), recipe name, author display name, `targets[]` each `{ target_kind, photo_id, moderation_status, flag_reason, flag_categories, open_report_counts: {reason: n}, notes: text[] }`, next cursor | `is_current_user_admin()` | `not_admin`, `invalid_input` |
| `admin_review_count` | Postgres function (security definer) | none | integer: distinct comments the queue would list | `is_current_user_admin()` | `not_admin` |
| `admin_clear_moderation` | Postgres function (security definer) | `p_target_kind`, `p_comment_id`, `p_photo_id` null | `{ cleared_reports: int }` | `is_current_user_admin()` | `not_admin`, `not_found` |
| Remove | existing `deleteComment` / `adminDeleteCommentPhoto` | unchanged | unchanged (files removed) | owner or admin (unchanged) | unchanged |
| `screen-comment-photo` | Edge Function, POST | `{ photo_id }` (trigger) or `{}` (cron sweep) | `{ screened, approved, flagged, failed, deferred }` | `apikey` header must match a `SUPABASE_SECRET_KEYS` value or the legacy key, as `cleanup-orphan-recipe-images` does; `verify_jwt = false` | 401 unauthorized, 200 with counts otherwise (per photo failures are recorded, not thrown) |
| `reserve_photo_screening` | Postgres function (security definer) | none | boolean (true if under 2000 today) | service role only | none |
| `record_photo_screening` | Postgres function (security definer) | `p_photo_id`, `p_outcome` (`approved` · `flagged` · `failed`), `p_categories` text[] | new status | service role only | none (0 rows when the photo is gone or no longer pending) |
| `claim_pending_comment_photos` | Postgres function (security definer) | `p_photo_id` uuid null (trigger mode), `p_limit` (10, sweep mode) | `{ id, storage_path }[]`: rows still `pending` whose `screening_claimed_at` is null or older than 3 minutes (sweep mode also requires `created_at < now() - 2 minutes`), oldest first, locked with `for update skip locked` and stamped `screening_claimed_at = now()` | service role only | none |
| `flag_stale_pending_photos` | Postgres function, run by the cron in SQL before calling the function | none | count flagged | cron only | none |

**Value sourcing**:

| Action | Value produced / displayed | Source |
|---|---|---|
| Comment list (both apps) | whether a comment or photo shows, and with which badge | `moderation_status` columns, filtered by RLS for the viewer; badge from `moderation_status` returned to the author (added to `comment_with_photos_json` and the list select) |
| Comment list | whether the viewer blocked the author | `user_blocks` where `blocker_id = auth.uid()` |
| Comment list | whether the viewer reported this target | `content_reports` where `reporter_id = auth.uid()` |
| `report_content` | reporter | `auth.uid()` |
| `report_content` | content author snapshot | `comments.user_id` or `comment_photos.user_id` read at insert |
| `report_content` | "once ever" | the two partial unique indexes; `unique_violation` mapped to `already_reported` |
| `report_content` | 24 hour count | `count(*)` of the caller's `content_reports` with `created_at > now() - interval '24 hours'` |
| `report_content` | the 3 report threshold | count of open reports with `counts_toward_hide` on the target (for a comment: `target_kind = 'comment'` only) after insert, under `for update` locks taken comment first, then photo |
| `report_content` | `counts_toward_hide` | `auth.users.created_at <= now() - interval '24 hours'` for the reporter |
| `report_content` | `became_hidden` | true only when this call changed the target's status to `flagged` |
| Thank you and hide for reporter | hidden state | the new report row (RLS reads it), plus an optimistic cache removal on the client |
| Screening | the image | downloaded with the service role from `comment-photos/{storage_path}`, sent as base64 |
| Screening | verdict and categories | Haiku 5.5 tool call `report_verdict` `{ verdict: 'allow' \| 'flag', categories: enum[] }` |
| Screening | "today" for the 2000 cap | `(now() at time zone 'utc')::date` inside `reserve_photo_screening` |
| Screening | attempts | `comment_photos.screening_attempts`, incremented by `record_photo_screening(..., 'failed')` |
| Review queue | report counts per reason, notes | aggregated from open `content_reports` per target |
| Review queue | recipe name, author name | `recipes` (localized name as the existing admin list does), `user_display_names` |
| Review queue | ordering | group 0 = the comment or any photo is `flagged`; group 1 = only open reports. `sort_at` = earliest `flagged_at` among its flagged targets (group 0) or earliest open report `created_at` (group 1); keyset `(group, sort_at, id)` ascending |
| Nav badge | count | `admin_review_count()`: distinct comment ids matching the queue filter |
| Blocked list | fallback name | "Deleted user" (localized) when `display_name` is null or the row is missing |
| Clear | resolver | `auth.uid()` into `resolved_by` |
| Remove | resolution `removed` | `before delete` triggers on `comments` and `comment_photos` set `resolved_at = now()`, `resolution = 'removed'`, `resolved_by = auth.uid()` (null for service role or cascade) on open reports |
| Blocked list | display name | `user_display_names` view (same source as comment authors) |
| Sentry warnings | ids, categories, reason | screening events: the Edge Function; the counting report: the shared `reportContent` helper when `report_content` returns `became_hidden = true` (invariant 9); the 1 hour backstop: the next sweep run reports the count `flag_stale_pending_photos` returned |
| Author badges | which note to show | `moderation_status` only; `flag_reason` and `flag_categories` are never returned to non admins |

**Key invariants**:
1. Visibility rule. The admin sees everything (ignoring their own blocks and reports). For anyone else a row is visible when it is `approved` or the viewer is its author; AND the viewer has not blocked its author; AND the viewer has not reported that exact target; AND its recipe is not soft deleted. A reported or blocked comment hides its photos with it. A comment is also visible only if it has text or at least one photo visible to the same viewer (AC-5).
2. No recursion: three `security definer`, `stable` helpers with `set search_path = ''`, none calling back into another that calls it. `comment_own_visible(comment_id)` checks the comment row alone (rule 1, no photo look). `photo_own_visible(photo_id)` checks the photo row alone (rule 1 for the photo) AND `comment_own_visible(parent)`. `can_view_comment(comment_id)` = `comment_own_visible` AND (body is not null OR exists a photo where `photo_own_visible`). `comments_select` calls `can_view_comment`; `comment_photos_select` calls `photo_own_visible`. Wrap calls as `(select ...)` where the argument allows, and keep the existing indexes; add `content_reports (reporter_id, comment_id)` for the reporter clause.
2a. `comment_with_photos_json` stays revoked from clients and is used only for the caller's own comment (the `post_comment` / `edit_comment` return). It adds `moderation_status` per comment and photo, never `flag_reason` or `flag_categories`. No public read path may call it.
3. Clients never write `moderation_status`, `flag_reason`, `flag_categories`, `flagged_at`, `screening_attempts`, `screening_claimed_at`, or `screened_at`. The `authenticated` update grant on `comments` stays `body` only; `comment_photos` already has no client writes. `edit_comment` keeps the status of kept photos (an alt text change never triggers a new check), inserts new or replaced photos as `pending`, and never changes the comment's status; open reports on the old text stay open until Clear. Deleting a flagged photo and uploading it again starts a new screening; repeat evasion is left to the suspend follow up.
4. `content_reports` has no insert, update, or delete grant for `anon` or `authenticated`. Select is allowed for the reporter's own rows only (used by the visibility helpers through security definer, and by nothing else on the client).
5. `report_content` locks the comment row, then (for a photo report) the photo row, always in that order, before counting, so two simultaneous counting reports flag once and a comment report racing a photo report cannot deadlock. It raises its error codes as exception messages, like the existing comment functions, and the shared helper maps them; a `unique_violation` maps to `already_reported`.
6. The threshold counts open reports with `counts_toward_hide` only (comment threshold: `target_kind = 'comment'` only). Clear resolves them, so later reports start from 0. Reports on an item already flagged are stored and shown in the queue but return `became_hidden = false`.
7. A photo never leaves `pending` except through `record_photo_screening` or `admin_clear_moderation`. `record_photo_screening` only updates rows still `pending`, so a late or duplicate screening result after an admin clear is ignored.
8. Screening never runs twice at once: both modes go through `claim_pending_comment_photos` (lease plus `skip locked`), and `reserve_photo_screening` is called only after a successful claim. A second verdict on an already decided photo is still a no op (invariant 7). The function checks the downloaded file is a JPEG of at most 5 MB; anything else is a failed attempt. The system prompt tells the model to treat any text inside the image as content, never as instructions.
8a. Every cron run first calls `flag_stale_pending_photos()` in SQL (photos `pending` with `created_at < now() - interval '1 hour'` become `flagged`, `screening_failed`), then calls the function. This works even when the function rejects the key.
9. The counting report Sentry warning is sent by the shared `reportContent` client helper when `became_hidden` is true, through each app's existing Sentry client, tagged `moderation`, with ids only. (The database cannot reach Sentry, and a server side hop for one warning is not worth a new function.)
10. `photo_screening_usage`, `reserve_photo_screening`, `record_photo_screening`, `claim_pending_comment_photos`, and `flag_stale_pending_photos` are callable by the service role only (revoke from `public`, `anon`, `authenticated`). Every new `security definer` function sets `search_path = ''` and revokes execute from `public` and `anon`.
11. The screening trigger function is `security definer`, reads the Vault secret `secret_key`, and sends it on the `apikey` header with `net.http_post` (async, sent only after the inserting transaction commits, `timeout_milliseconds := 5000`). The whole call sits in an exception block that swallows errors, so a missing secret or a `pg_net` problem never fails `post_comment` or `edit_comment`; the cron picks those photos up.
12. The `before delete` triggers resolve open reports by `photo_id` (photo trigger) and by `comment_id` covering both comment and photo reports (comment trigger), so a cascade cannot null the link first. `resolved_by` is `auth.uid()` only when the caller is the admin; null otherwise (the author, the service role, or a cascade).
13. Unblocking does not undo the hide from the viewer's own reports. Reporting or blocking hidden content returns `not_found`.

**Security model**:
- Guests (anonymous sessions) can read approved content only. They cannot call `report_content` or write `user_blocks` (`is_anonymous` check, as the comments insert policy does).
- Signed in users: report others' content through `report_content`; insert and delete only their own `user_blocks` rows; read their own `user_blocks` and their own `content_reports`.
- Authors: always see their own content, with its status.
- Admin (`is_current_user_admin()`): sees everything on the public pages, plus `admin_review_queue`, `admin_review_count`, `admin_clear_moderation`, and the existing delete paths.
- Service role (Edge Function and cron only): screening functions and usage table.
- Privacy: photos already public once approved; screening sends each new photo to Anthropic (an existing processor for drink ideas), stated on the privacy page (AC-18). Report notes are visible only to the admin. No new regulated data.

**Configuration required**:
- No new secrets. `ANTHROPIC_API_KEY` and the Sentry DSN already exist in Edge Function secrets; the Vault secret `secret_key` already exists (spec 0041). Add `[functions.screen-comment-photo] verify_jwt = false` to `supabase/config.toml`.
- Model id `claude-haiku-5-5` as the default in the function, separate from the drink idea function's constant.
- `SCREENING_MODEL` (optional Edge Function secret): overrides the model id, so a rename needs no redeploy.

**Screening prompt contract** (the policy the function sends): the image is a user photo on a cocktail recipe app for adults of legal drinking age. Alcohol, bottles, glasses, bars, garnishes, kitchens, and adults holding drinks are allowed. Flag only: sexual content or nudity; graphic violence or gore; hate symbols or slurs; illegal drug use or paraphernalia; anyone who appears to be a minor with alcohol; readable personal information (ID cards, payment cards, addresses, phone numbers). Answer only through the `report_verdict` tool. A response with no tool call, an unknown category, or `flag` with no categories counts as a failed attempt.

**Critical test scenarios**:
- Happy path: post a comment with a photo; another account sees the text but not the photo; after screening passes, the photo appears for the other account and the author's badge goes away, verifies **AC-1**, **AC-2**.
- Flag: a test image the check flags stays hidden from others, shows in the admin queue with its categories, and a Sentry warning is sent, verifies **AC-2**, **AC-11**, **AC-13**.
- Failure: with the Anthropic key wrong, the photo stays pending through 3 cron runs, then appears in the queue as `screening_failed`, verifies **AC-3**.
- Backstop: with the Vault `secret_key` wrong (function returns 401), a photo still becomes `screening_failed` about an hour after upload; posting a comment still succeeds, verifies **AC-3**.
- Overlap: a photo claimed by the trigger call is skipped by a sweep that runs during the model call, and usage grows by 1, verifies **AC-4**.
- Cap: with today's usage set to 2000, a new photo stays pending, `screening_attempts` stays 0, and it is screened once the row for tomorrow is used, verifies **AC-4**.
- Photo only comment with its photo pending is not visible to a guest at all, verifies **AC-5**.
- Report: a second report on the same target returns `already_reported`; the 21st report in 24 hours returns `report_limit`; reporting your own comment returns `own_content`; a guest sees the sign in prompt, verifies **AC-6**, **AC-7**.
- Young accounts: three reports from accounts under 24 hours old leave the item visible but put it in the queue, verifies **AC-9**, **AC-11**.
- Threshold: three accounts older than 24 hours report one photo; the photo hides for a fourth account while the comment text stays; three comment reports hide the whole comment, verifies **AC-8**, **AC-9**.
- Concurrency: two reports arriving together as the 3rd and 4th still leave one `flagged` status and correct counts, verifies **AC-9**.
- Clear then report again: after Clear, one new report does not hide it; three new ones do, verifies **AC-12**.
- Remove: removing a reported photo deletes its file, and its reports remain with `resolution = 'removed'`, `photo_id` null, and `content_author_id` set, verifies **AC-12**.
- Block: after blocking, the blocked author's comments vanish for the blocker on web and mobile and return after unblocking from settings, verifies **AC-14**, **AC-15**.
- Permission: a direct `insert into content_reports`, an `update comments set moderation_status`, and a guest `select` on a pending photo all fail or return nothing; the server rendered page source has no pending photo URL, verifies **AC-16**.

## Migration plan

**Strategy**: no flag; one additive migration plus code, with existing rows backfilled to `approved` so nothing visible today disappears.
**Phases**:
1. Migration: enums, columns (photo status added with default `approved`, then default switched to `pending`), new tables, helpers, policies, `report_content`, admin functions, delete triggers, screening functions, the `after insert` trigger, and the 5 minute cron. Deploy `screen-comment-photo` before applying the migration so the first trigger call has a target.
2. Ship web and mobile UI. Until a mobile update ships, older builds keep working: RLS already hides pending, flagged, blocked, and reported content from them; they just lack the report and block buttons and the badges (an author on an old build sees a pending photo with no badge).

**Rollback**: unschedule the cron and drop the trigger to stop screening; set all `pending` photos to `approved` only if you decide to publish unscreened photos (otherwise leave them for review). The tables and columns can stay in place harmlessly.
**Risks**: if `screen-comment-photo` is not deployed or the `secret_key` Vault secret still holds its placeholder, the function never runs, so no attempts are counted; every new photo stays hidden and reaches the queue only through the 1 hour backstop. Check the first real upload end to end after deploy. Photos that existed before the migration are backfilled `approved` without screening; that is accepted.

## Build plan

Tracer Bullet: the first slice runs one photo through every layer (migration, trigger, Edge Function, Haiku, RLS, web UI). Later slices thicken it.

1. Migration slice 1, screening thread: `moderation_status` and `moderation_flag_reason` enums, the photo and comment status columns with backfill, `photo_screening_usage`, the `can_view_comment` / `can_view_comment_photo` helpers (status and author and admin parts only for now) and the rewritten select policies, `edit_comment` and `comment_with_photos_json` updates, `reserve_photo_screening`, `record_photo_screening`, `claim_pending_comment_photos`, `flag_stale_pending_photos`, the `after insert` trigger, the 5 minute cron (backstop SQL, then the function call), `config.toml` entry; regenerate shared types, satisfies **AC-1**, **AC-3**, **AC-4**, **AC-5**, **AC-16**
2. Edge Function `supabase/functions/screen-comment-photo/` (single photo and sweep modes, secret key check, base64 download, Haiku 5.5 tool call with the prompt contract, verdict parsing in a pure `screening-verdict.ts` with tests, Sentry warnings with ids only), satisfies **AC-2**, **AC-3**, **AC-4**, **AC-13**
3. Shared `comments.ts`: carry `moderationStatus` on comments and photos; web comment section shows the "Checking photo" and "Hidden while under review" states for the author. Prove the thread end to end on web, satisfies **AC-1**, **AC-2**, **AC-10**
4. Migration slice 2, reports: `report_reason`, `report_target_kind`, `report_resolution` enums, `content_reports` with indexes and grants, `report_content`, `before delete` triggers on `comments` and `comment_photos`, reporter clause added to the visibility helpers; regenerate types, satisfies **AC-6**, **AC-7**, **AC-8**, **AC-9**, **AC-12**, **AC-16**
5. Shared `moderation.ts` in `packages/shared` (`reportContent` with explicit error results mapped from the function errors, note validation, the Sentry warning when `became_hidden` is true) plus a report dialog and thank you state on web, with optimistic hide, satisfies **AC-6**, **AC-7**, **AC-8**, **AC-9**, **AC-13**
6. Admin: `admin_review_queue`, `admin_review_count`, `admin_clear_moderation`; shared admin helpers; "Needs review" tab on `/admin/comments` with Clear and Remove (reusing the existing delete helpers) and the nav badge, satisfies **AC-11**, **AC-12**
7. Migration slice 3, blocks: `user_blocks` with RLS, blocker clause added to the visibility helpers; shared `blockUser`, `unblockUser`, `fetchBlockedUsers`; Block action with confirm on web comments and the "Blocked people" list on the web account page, satisfies **AC-14**, **AC-15**, **AC-16**
8. Mobile parity: report dialog, block action, blocked list on `apps/mobile/src/app/account.tsx`, the two status badges, satisfies **AC-17**, plus **AC-1**, **AC-6** to **AC-10**, **AC-14**, **AC-15** on mobile
9. Strings in all 9 locales (web `apps/web/messages/*.json` and mobile i18n) and the privacy page paragraph. The full string list: "Checking photo", "Hidden while under review", the report dialog title, the 5 reason labels, the note field and its counter, submit and thank you, the 6 report error messages plus a generic fallback, the guest sign in prompt, the Block action and its confirm, the Blocked people heading, its empty state, Unblock, "Deleted user", and on the admin side the Needs review tab, the badge, the 3 flag reasons, the 6 categories, Clear, and Remove. Satisfies **AC-17**, **AC-18**

## Consequences

**Positive**:
- Covers the filter, report, and block trio App Review expects for apps with user content, before the iOS submission.
- Unsafe photos never reach other viewers, even while you are away, and even on old mobile builds.
- One queue for everything that needs you, with history kept for a future suspend feature.

**Negative / tradeoffs**:
- Every new photo is invisible to others for a few seconds, and for minutes or longer during an Anthropic outage, until it lands in your queue.
- A model makes mistakes both ways: some harmless photos will be held for you to clear, and some unsafe ones may pass until reported.
- Every comment read now runs per row helper functions; fine at 20 rows per page, but it is extra work on the hottest comment query.
- A hidden photo's file is still reachable by its random URL until removed (only the author knows it).
- Screening adds a small per photo Anthropic cost, capped at 2000 a day.
- Text inside an image could try to talk the model into a pass (prompt injection). Forced tool output and the system prompt reduce this; reports and your queue are the backstop.
- Expect some false positives on `personal_info` (a phone number on a bar sign, a menu); you clear those by hand.
- Reports from accounts under 24 hours old cannot auto hide anything, so a genuine new user's report waits for you.
- Someone who creates many accounts could use up the 2000 a day cap, delaying everyone's photos until the reset.
- The counting report Sentry warning depends on the client sending it, so a modified client could skip that one warning (the item is still hidden and still in the queue).

**Neutral**:
- New Edge Function, trigger, and cron to monitor; failures show in Sentry.
- `comment_with_photos_json` and the comment list select gain a `moderation_status` field; old clients ignore it.

## Follow-up

- [ ] Admin suspend posting for repeat offenders, using the `content_author_id` history (deferred by your choice).
- [ ] Screen comment text too, if text abuse shows up.
- [ ] PostHog events `content_reported` and `user_blocked` (no ids of the reported person), if you want to watch report volume.
- [ ] The comment photo orphan sweep cron (spec 0032) still uses the legacy Bearer key pattern and may be failing; move it to the `secret_key` on `apikey` pattern.
- [ ] Mobile admin review is out of scope (admin stays web only, as in spec 0028).

## Rationale

Reasoning and options: see [rationale.md](rationale.md).
