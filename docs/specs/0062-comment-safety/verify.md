# Verify: comment safety · spec 0062 · updated 2026-11-19
_Steps derived from spec 0062 acceptance criteria. `/check verify` runs these; `/test` locks the durable ones._

Milestone 1 (screening thread). Before you start: `supabase/migrations/20261118130000_comment_safety_screening.sql` is applied and `screen-comment-photo` is deployed. You need two signed in accounts (the author and a second account) plus a guest window.

## Commands
- [ ] Paste `supabase/tests/comment_safety_screening_check.sql` into the SQL editor → the report (raised as an error, everything rolled back) shows PASS on all 16 lines → AC-1, AC-2, AC-3, AC-4, AC-5, AC-16
- [ ] `pnpm test` passes, including `supabase/functions/screen-comment-photo/screening-verdict.test.ts` and `packages/shared/src/moderation.test.ts` → AC-2, AC-3
- [ ] SQL: `select moderation_status, count(*) from comment_photos where created_at < '2026-11-19' group by 1` → every photo from before the migration is `approved` → AC-1
- [ ] SQL: `select has_column_privilege('anon', 'public.comment_photos', 'flag_categories', 'select')` → false → AC-16, invariant 2a

## UI / manual: web
- [ ] As the author, post a comment with text and one photo of a drink → the photo shows right away with a "Checking photo" caption under it → AC-1
- [ ] Within about a minute, without reloading → the caption disappears (the list refetches every 15 seconds while a photo is pending) → AC-2
- [ ] SQL: `select moderation_status, screened_at, screening_attempts from comment_photos order by created_at desc limit 1` → `approved`, `screened_at` set, attempts 0 → AC-2
- [ ] In the guest window, open the same recipe while the photo is still pending (post a second photo and look within seconds) → the comment text shows, the photo does not → AC-1
- [ ] As the author, post a photo only comment, then open the recipe as a guest within seconds → the comment is not shown at all, no empty card → AC-5
- [ ] As the second account, after screening passes → the photo shows with no caption → AC-2
- [ ] In the SQL editor, set a photo to flagged by hand: `update comment_photos set moderation_status = 'flagged', flag_reason = 'screening', flagged_at = now() where id = '<id>'` → the author sees "Hidden while under review" under it; the second account and the guest do not see it → AC-10
- [ ] View source of the recipe page as a guest while a photo is pending → no `comment-photos/<that path>` URL in the HTML or the JSON-LD → AC-16
- [ ] Edit the alt text of an approved photo → it stays approved, no "Checking photo" caption, no new screening call (usage count for today unchanged) → invariant 3

## Failure paths (Value sourcing and risks)
- [ ] Set the Edge Function secret `ANTHROPIC_API_KEY` to a wrong value, post a photo → it stays pending; after 3 cron runs (about 15 minutes) `screening_attempts = 3`, `moderation_status = 'flagged'`, `flag_reason = 'screening_failed'`, and Sentry shows a "comment photo flagged" warning with the photo id only. Restore the key afterwards → AC-3, AC-13
- [ ] SQL: `insert into photo_screening_usage (day, calls) values ((now() at time zone 'utc')::date, 2000) on conflict (day) do update set calls = 2000`, then post a photo → it stays pending, `screening_attempts` stays 0, Sentry shows "daily cap reached". Reset with `update photo_screening_usage set calls = 0 where day = (now() at time zone 'utc')::date` → the next cron run screens it → AC-4
- [ ] Check the day boundary: the cap row's `day` is the UTC date, not your local date (post near local midnight, or compare `select (now() at time zone 'utc')::date`) → AC-4, Value sourcing "today"
- [ ] SQL: `select status_code, content from net._http_response order by created desc limit 5` after a post → 200 responses with `{"screened":1,...}`, no 401 → AC-2, invariant 11

## Milestone 2: reports
Before you start: `20261118140000_comment_safety_reports.sql` is applied. You need the author, three other signed in accounts (call them A, B, C), and a guest window.

### Commands
- [ ] Paste `supabase/tests/comment_safety_reports_check.sql` into the SQL editor → PASS on all 14 lines → AC-6, AC-7, AC-8, AC-9, AC-12, AC-16
- [ ] `pnpm test` passes, including `packages/shared/src/moderation.reports.test.ts` → AC-6, AC-7, AC-8
- [ ] As account A in the browser console or SQL, try `insert into content_reports ...` directly → refused (no client writes) → AC-16

### UI / manual: web
- [ ] As the guest, tap Report on a comment → the dialog shows a sign in prompt, no form → AC-6
- [ ] As the author, look at your own comment → no Report or Block button, and no "Report photo" in the photo viewer → AC-6
- [ ] As A, report a comment with reason "Spam" and a short note → the thank you message shows, and the comment is gone from the list behind the dialog → AC-6, AC-8
- [ ] As A, reload, then sign in on a second device or browser → the reported comment stays hidden for A → AC-8
- [ ] As A, open a photo on another comment, tap "Report photo" → only that photo leaves the list; the comment text and other photos stay → AC-6, AC-8
- [ ] Type a note over 500 characters → the counter turns red and sending shows "Notes can be at most 500 characters." → AC-6
- [ ] SQL as A: call `report_content` again on the same target → `already_reported`; the dialog shows "You already reported this." → AC-7
- [ ] SQL: insert 20 reports for A within the last 24 hours (or run the check script's limit line), then report from the UI → "You have reached today's report limit." → AC-7
- [ ] Make A, B, C at least 24 hours old (`update auth.users set created_at = now() - interval '2 days' where email in (...)`), then all three report the same comment → after the third, the comment vanishes for the guest and the second account; SQL shows `moderation_status = 'flagged'`, `flag_reason = 'reports'` → AC-9
- [ ] Repeat with a brand new fourth account as one of the three → the item is not hidden for others, but the report row exists with `counts_toward_hide = false` → AC-9
- [ ] As the author of the hidden comment → it still shows, with "Hidden while under review" → AC-10
- [ ] As the author, edit that flagged comment → it stays flagged and hidden from others → AC-10
- [ ] When the third report hides the item → the browser console shows "comment content hidden by reports" with ids only, no note text. Known gap: this goes to the console, not Sentry, until Sentry is installed (scope feature 20) → AC-13

## Milestone 3: admin review
Before you start: `20261119120000_comment_safety_admin_review.sql` is applied. Sign in as the admin (`test@bartendingapp.dev`).

### Commands
- [ ] Paste `supabase/tests/comment_safety_admin_review_check.sql` into the SQL editor → PASS on all 8 lines → AC-11, AC-12
- [ ] `pnpm test` passes, including `packages/shared/src/adminReview.test.ts` → AC-11

### UI / manual: web
- [ ] Open `/admin/comments` → a "Needs review" tab sits beside the regular list, and the admin nav shows a badge next to Comments → AC-11
- [ ] With one flagged comment and one comment with only an open report → the flagged one is listed first; each row shows the recipe, author, text, all photos, the status, report counts per reason, report notes, and screening categories or failure reason → AC-11
- [ ] The badge number equals the number of rows (one per comment, even when a comment and its photo both need review) → AC-11
- [ ] Delete a recipe that has a reported comment → that row leaves the queue → AC-11
- [ ] Tap Clear on a flagged photo → only that photo goes back to `approved`, its open reports resolve as `cleared`, and other viewers see it again; the comment's own status is unchanged → AC-12
- [ ] After a clear, have three established accounts report the same photo again → it is hidden again (a fresh count) → AC-12
- [ ] Tap Remove on a reported photo → the row updates, the file is gone from the `comment-photos` bucket, and its reports show `resolution = 'removed'` with the author snapshot kept → AC-12
- [ ] Tap Remove on a whole comment → the comment and its photos are deleted, and the reports are resolved as `removed` → AC-12

## Milestone 4: blocks
Before you start: `20261119130000_comment_safety_blocks.sql` is applied. You need two signed in accounts (the blocker and the blocked person).

### Commands
- [ ] Paste `supabase/tests/comment_safety_blocks_check.sql` into the SQL editor → PASS on all 8 lines → AC-14, AC-15, AC-16
- [ ] `pnpm test` passes, including `packages/shared/src/blocks.test.ts` → AC-14, AC-15

### UI / manual: web
- [ ] As a guest → no Block button on any comment → AC-14
- [ ] As the blocker, tap Block on the other person's comment → a confirm step appears; Cancel keeps everything as is → AC-14
- [ ] Confirm the block → every comment and photo by that person disappears from this recipe, and from other recipes after you open them → AC-14
- [ ] As the blocked person → nothing changes for you, and you are not told → AC-14
- [ ] SQL as the blocker: `insert into user_blocks (blocked_id) values (auth.uid())` → refused (cannot block yourself) → AC-14
- [ ] Open `/account` → "Blocked people" lists the person with their display name and block date → AC-15
- [ ] Delete the blocked person's display name (or account) → the row shows "Deleted user" → AC-15, Value sourcing "fallback name"
- [ ] Tap Unblock → the row leaves the list, and their comments show again on the recipe → AC-15

## Milestone 5: mobile parity and privacy
Before you start: run the mobile dev client (`pnpm mobile`) against the same project. Repeat on iOS and Android if you can, since the photo report opens one modal after another.

### UI / manual: mobile
- [ ] As the author, post a photo → "Checking photo" shows under it and clears within about a minute without a manual refresh → AC-1, AC-2, AC-17
- [ ] Flag one of your photos by hand in SQL → "Hidden while under review" shows under it → AC-10, AC-17
- [ ] As a guest, tap Report → the sign in prompt shows with a Sign in button that opens the account screen → AC-6, AC-17
- [ ] As another account, report a comment → the reason list, note, counter, and thank you message work as on web, and the comment leaves the list → AC-6, AC-8, AC-17
- [ ] Open a photo in the viewer, tap "Report photo" → the viewer closes and the report dialog opens for that photo (check on iOS especially) → AC-6, AC-17
- [ ] Tap Block, confirm → that person's comments vanish → AC-14, AC-17
- [ ] Open the account screen → "Blocked people" shows the person and the date; Unblock brings their comments back → AC-15, AC-17
- [ ] Switch the app language to Russian, then Japanese → every report, block, and blocked list string is translated; the block date reads "Дата блокировки: ..." in Russian → AC-17
- [ ] Note: the rest of the mobile comment section (Post comment, Edit, Delete, and so on) is still English only; that predates this spec

### UI / manual: web strings and privacy
- [ ] Switch the web locale through all 9 languages on a recipe with comments, the account page, and `/admin/comments` → no raw message keys show → AC-17
- [ ] Open `/privacy` → the list has a "Comments and photos" item saying new photos are checked by an automated service (Anthropic) before others see them, and that reported content is reviewed by the admin; the effective date reads November 19, 2026 → AC-18
- [ ] Open the privacy link from the mobile account screen → it lands on the same updated page → AC-18

## Acceptance-criteria coverage
- AC-1: check script lines 1 to 4, backfill SQL, author caption, guest window
- AC-2: check script lines 8 to 11 and 15, caption clears, second account sees photo, pg_net responses
- AC-3: check script lines 12 and 13, wrong Anthropic key path
- AC-4: check script line 14, cap path, UTC day check
- AC-5: check script line 2, photo only comment as guest
- AC-10: hand flagged photo shows the author note (comment level note is exercised by the reports milestone)
- AC-13: Sentry warning on the failure path
- AC-16: check script lines 5 to 7, column privilege SQL, view source
- AC-6: reports check script, guest prompt, no Report on own content, comment and photo reports on web and mobile, note limit
- AC-7: already reported and daily limit steps
- AC-8: thank you message, hide right away, hidden after reload and on a second device
- AC-9: three established reporters hide the item; a new account's report does not count
- AC-10: also the comment level note and editing a flagged comment (milestone 2), and the mobile caption
- AC-11: admin check script, Needs review tab, ordering, row contents, badge count, deleted recipe
- AC-12: Clear on one target, fresh count after clear, Remove for a photo and a whole comment
- AC-13: also the counting report warning (console only until Sentry is installed, scope feature 20)
- AC-14: blocks check script, guest has no Block, confirm step, content vanishes, silent, no self block, mobile
- AC-15: Blocked people list, "Deleted user" fallback, Unblock on web and mobile
- AC-16: also the reports, blocks check scripts and the direct insert refusal
- AC-17: mobile badges, report, block, blocked list, and strings in 9 locales on both apps
- AC-18: privacy page item and effective date, reached from web and mobile
