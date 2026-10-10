# 0032. Recipe comment photos

**Date**: 2026-10-06
**Status**: In Progress

## Summary

This spec lets a signed in user attach up to 3 photos to a recipe comment, on web and mobile, so they can show how their drink turned out. A comment can now be text, photos, or both. Photos are shrunk and cleaned of hidden location data on the phone or browser before upload, stored in a public Supabase Storage bucket (a file store that serves images by URL), and written to the database in one all or nothing step. You, as admin, can remove a single photo or a whole comment from `/admin/comments`, and a daily job deletes any stored file nothing points to anymore.

## Requirements

**User stories**:
- As a signed in user, I want to attach photos to my comment, so I can show how my version of the drink turned out.
- As a signed in user, I want to post a photo without writing anything, so a quick "made this" post is easy.
- As a signed in user, I want to add, remove, or replace photos when I edit my comment, so a bad photo is not permanent.
- As any viewer (guest or signed in), I want to see comment photos and open them full size, so I can judge a recipe by real results.
- As the admin, I want to remove one inappropriate photo without deleting the useful text around it, so moderation stays precise.

**Acceptance criteria** (the contract, each criterion is IDed and independently checkable):
- **AC-1**: A signed in (non anonymous) user can attach 1 to 3 photos when posting a comment from the recipe detail page; the comment appears in the list without a page reload, with its photos in the order the user chose.
- **AC-2**: A comment may have text only, photos only, or both. A comment with no text (null) and zero photos is rejected by the database, never stored, on every write path (post and edit).
- **AC-3**: The picker accepts JPEG, PNG, WebP, and HEIC. Picked originals over 25 MB are rejected with a clear message before processing. Before upload the client converts to JPEG, scales the long edge down to at most 1600 px (never up), encodes at about 80% quality, applies the photo's rotation, and drops all metadata (EXIF, including GPS). The storage bucket itself rejects any object that is not `image/jpeg`, or is larger than 5 MB.
- **AC-4**: A comment can never hold more than 3 photos. The composer stops offering "add photo" at 3, and the database rejects a post or edit that would exceed 3.
- **AC-5**: When editing their own comment, the owner can remove a photo, replace a photo, add photos (up to 3 total), reorder them, and change each photo's alt text. The change is atomic (all of it lands or none of it does), the comment shows "(edited)", and files for removed photos are deleted from storage.
- **AC-6**: Deleting a comment (by its owner or the admin) removes its photo rows in the same delete, and the client deletes the matching storage files right after. Any file the client fails to delete is removed by the orphan sweep (AC-12).
- **AC-7**: A user can upload only into their own storage folder (`{user_id}/`), can attach only files from their own folder that no other photo row already uses, and cannot delete a stored file that a photo row still points to. A guest (anonymous session) cannot upload or attach photos; both are rejected by storage and database policies, not only hidden by the UI.
- **AC-8**: A user can upload at most 30 photo files in any rolling 24 hours. The 31st upload is rejected by the storage policy, and the composer shows a clear "daily photo limit reached" message.
- **AC-9**: Each comment shows its photos as a row of thumbnails under the text, with space reserved from the stored width and height so nothing jumps as images load. Tapping or clicking a thumbnail opens a full size viewer (web dialog, mobile modal) with next and previous between that comment's photos. The viewer works by keyboard and screen reader on web and closes with Escape or the back gesture. Each image's accessible label is its alt text, or "Photo N of M by <display name>" when alt text is blank.
- **AC-10**: If any photo fails to process or upload while posting or editing, the comment is not created or changed, the draft text and the other photos are kept, and the failed photo shows a retry and a remove control. Nothing half posted ever appears in the list.
- **AC-11**: The admin comments page (`/admin/comments`) shows each comment's photo thumbnails. The admin can delete a single photo; if that leaves a comment with no text and no photos, the comment is deleted too. Deleting the whole comment still works as in spec 0028, and storage files are cleaned up in both cases.
- **AC-12**: A daily scheduled job deletes every object in the `comment-photos` bucket that is older than 24 hours and that no `comment_photos` row points to. This covers abandoned uploads, failed client deletes, admin deletes, and account deletions.
- **AC-13**: Photos on a soft deleted recipe's comments are hidden exactly like the comments themselves (no photo row is readable through the API), and no photo can be attached to a comment on a soft deleted recipe.
- **AC-14**: User photos never appear in a recipe page's SEO metadata (Open Graph image, Twitter card, or JSON-LD). The recipe's own image stays the share card.
- **AC-15**: Web and mobile both support picking, posting, editing, viewing, and the failure handling above, with matching behavior.

## Decision

**Chosen option**: Option 1: Public `comment-photos` bucket with folder scoped write policies, a `comment_photos` child table, upload first then one atomic Postgres function per write, client side image processing, client delete plus a daily orphan sweep.

Photos are uploaded straight from the client to a public Supabase Storage bucket under the uploader's own folder, then a `security definer` Postgres function (one that runs with the function owner's rights, so it can do the cross table checks itself) creates or edits the comment and its photo rows in a single transaction after checking every rule. Text only comments keep spec 0027's direct table insert and update, now requiring a non null body, so already installed mobile builds keep working.

**Implementation skills**: `supabase-postgres-best-practices` (`supabase/agent-skills`, `.agents/skills/supabase-postgres-best-practices/`) · `react-native-best-practices` (`callstackincubator/agent-skills`, `.agents/skills/react-native-best-practices/`) · `nextjs-app-router-patterns` (`wshobson/agents`, `.agents/skills/nextjs-app-router-patterns/`)

**Decisions made in this spec** (recommended by the architect, with the runner up):
- `comments.body` becomes nullable (null means "no text"), with the length check kept for non null values. Runner up: an empty string for "no text", rejected because it would need a different check than the one `validateCommentBody` already mirrors.
- Two write paths. Any create or edit that involves photos (or leaves a comment with a null body) goes through `post_comment` and `edit_comment`. Spec 0027's direct `insert` and `update (body)` stay for text only comments, with `body is not null` added to the insert and update policies' `with check`, so old mobile builds keep working and a direct write can never produce an empty comment. All writes on `comment_photos` are revoked from `authenticated`. Comment delete stays a direct, RLS checked table delete (spec 0027/0028 unchanged). The shared code always calls the functions; the direct path exists only for backward compatibility. Runner up: revoke direct writes entirely, rejected because it breaks text comments in installed mobile builds until users update.
- The 30 per day limit (AC-8) is enforced in the storage insert policy, not only in `post_comment`. Every photo must be uploaded before it can be attached, so the upload is the tighter choke point, and it also caps abandoned uploads that never reach the function. This refines your "enforce in the RPC" pick; the function does not need its own count.
- Stored files are immutable. Replacing a photo means uploading a new file and dropping the old row; there is no storage update policy.
- Web thumbnails render through `next/image` (Vercel resizes the 1600 px file on the fly); mobile renders the stored file with `expo-image` (already installed), lazily, with its disk cache. No separate thumbnail files in v1. Runner up: the client also uploads a small thumbnail, deferred until mobile data use proves to be a problem.
- Stored format is always JPEG (`.jpg`, `image/jpeg`), whatever the input, so the extension, content type, and path pattern always agree. Runner up: WebP, rejected because encoder support differs between browsers and `expo-image-manipulator`.
- Client supplied `width` and `height` are trusted as layout hints only; the server checks the range (1 to 1600) and nothing more. The 1600 px resize is a client rule, not enforced server side, and that is accepted.
- A photo can only be attached if its file was uploaded less than 23 hours ago (`invalid_photo` otherwise), and the sweep only deletes files older than 24 hours. This closes the race where the sweep deletes a file just as it is attached, and stops a deleted comment's file from being attached again later.
- Edits are full replacements: `p_body` blank or null clears the text, and `p_photos` is the complete final list. An edit that changes nothing does not bump `updated_at`.
- Each upload, including a retry, uses a new uuid (`upsert: false`), and uploads set `cacheControl: '3600'` so an admin removal stops being served from the CDN within about an hour. Picked originals over 25 MB are rejected before processing (HEIC decoding is memory heavy). Reorder uses move left and move right buttons on both platforms.
- If removing a photo leaves a comment empty: when the owner edits, the edit is rejected (they should delete the comment); when the admin removes it, the comment is deleted with it (AC-11).

## Feature design

**Data model sketch**:

| Entity | Field | Type | Nullable | Notes |
|---|---|---|---|---|
| `comments` (changed) | `body` | text | **nullable** (was not null) | check becomes `body is null or char_length(btrim(body)) between 1 and 1000` |
| `comment_photos` (new) | `id` | uuid | not null | PK, `default gen_random_uuid()` |
| `comment_photos` | `comment_id` | uuid | not null | FK `public.comments(id)` `on delete cascade` |
| `comment_photos` | `user_id` | uuid | not null | FK `auth.users(id)` `on delete cascade`; always equal to the parent comment's `user_id` (set by the function) |
| `comment_photos` | `storage_path` | text | not null | `unique`; check `storage_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.jpg$'` (`{user_id}/{uuid}.jpg`) |
| `comment_photos` | `position` | smallint | not null | check `position between 0 and 2`; `unique (comment_id, position)` deferrable initially deferred so a reorder inside one transaction never trips it |
| `comment_photos` | `width` | integer | not null | check `width between 1 and 1600` |
| `comment_photos` | `height` | integer | not null | check `height between 1 and 1600` |
| `comment_photos` | `alt_text` | text | nullable | check `alt_text is null or char_length(btrim(alt_text)) between 1 and 200` |
| `comment_photos` | `created_at` | timestamptz | not null | `default now()` |

Relationships: `comments` 1 to N `comment_photos` (N ≤ 3, enforced by the functions plus the position range check). `auth.users` 1 to N `comment_photos`. Indexes: `comment_photos (comment_id, position)` (covered by the unique constraint), `comment_photos (user_id)` for the cascade.

**Storage bucket** `comment-photos` (created in the migration via `insert into storage.buckets`):
- `public = true`, `file_size_limit = 5242880` (5 MB), `allowed_mime_types = {image/jpeg}`.
- Object names: `{auth.uid()}/{random uuid}.jpg`. The client picks a new uuid for every upload, retries included.
- `storage.objects` policies scoped to `bucket_id = 'comment-photos'`:
  - **insert** (`authenticated`): `(select auth.jwt() ->> 'is_anonymous') = 'false'` and `(storage.foldername(name))[1] = auth.uid()::text` and the name matches the path pattern above and fewer than 30 objects exist in the caller's folder with `created_at > now() - interval '24 hours'`.
  - **delete** (`authenticated`): (folder is the caller's own, or the caller's `user_preferences.is_admin` is true) and `not public.is_comment_photo_referenced(name)`. That helper is a `security definer`, `stable` function, so it sees every photo row, including rows hidden by RLS on a soft deleted recipe; a plain subquery in the policy would miss those and let an owner delete a file that is still in use.
  - **update**: none (files are immutable). **select**: none needed; public URLs are served without RLS.

**State transitions**: a stored file moves `uploaded (unreferenced)` → `attached` (a `comment_photos` row points to it) → `unreferenced` (row removed by edit, comment delete, admin delete, or account cascade) → `deleted` (client delete right away, or the sweep after 24 hours). An uploaded file that is never attached is swept the same way.

**API surface** (Supabase client calls; all functions `set search_path = ''`, `execute` revoked from `anon` and `public`):

| Endpoint | Method | Key inputs | Key outputs | Auth | Key errors |
|---|---|---|---|---|---|
| Storage upload `comment-photos/{uid}/{uuid}.jpg` | `storage.from('comment-photos').upload` | processed JPEG bytes, `contentType: 'image/jpeg'`, `upsert: false`, `cacheControl: '3600'` | object path | non anonymous user | 403 policy (the client always uses its own folder and blocks guests first, so a 403 for a signed in user maps to `daily_limit`), 413 over 5 MB, 415 wrong type |
| `post_comment` | RPC, `security definer` | `p_recipe_id uuid` (req), `p_body text` (opt), `p_photos jsonb` (opt, ordered array of `{path, width, height, alt_text?}`, 0 to 3) | `jsonb`: `{id, user_id, recipe_id, body, created_at, updated_at, photos: [{id, storage_path, position, width, height, alt_text}]}`, photos ordered by position; the client adds the display name with the existing `fetchDisplayNames` | non anonymous user | `comment_empty`, `too_many_photos`, `invalid_photo` (path not in caller's folder, object missing, uploaded 23 or more hours ago, already attached, bad dimensions), `recipe_unavailable`, `not_signed_in` |
| `edit_comment` | RPC, `security definer` | `p_comment_id uuid` (req), `p_body text` (opt), `p_photos jsonb` (req, the full final ordered list; each item is `{id, alt_text?}` to keep an existing photo or `{path, width, height, alt_text?}` to add one) | the same `jsonb` shape as `post_comment` plus `removed_paths: text[]` | owner only | the post errors plus `not_found_or_not_owner` |
| `admin_delete_comment_photo` | RPC, `security definer` | `p_photo_id uuid` (req) | `removed_paths text[]`, `comment_deleted boolean` | admin only (`user_preferences.is_admin`) | `not_admin`, `not_found` |
| Comment delete | `from('comments').delete()` (unchanged, RLS owner or admin) | comment id | deleted id | owner or admin | `not_found_or_not_owner` |
| Storage remove | `storage.from('comment-photos').remove(paths)` | paths from the RPC result or the loaded comment | none | owner of the folder or admin | silently skipped by policy if still referenced |
| Read comments | `from('comments').select('…, comment_photos(id, storage_path, position, width, height, alt_text)')` with `.order('position', { referencedTable: 'comment_photos' })` | as spec 0027 | `Comment` with `photos: CommentPhoto[]` | public | as spec 0027 |
| `is_comment_photo_referenced` | SQL function, `security definer`, `stable`, used by the storage delete policy | `p_name text` | `boolean` | policy only | none |
| `cleanup-orphan-comment-photos` | Edge Function, POST from pg_cron via `pg_net`, daily | none | `{ deleted: number }` | service role key from Vault (same pattern as spec 0017) | logged to Sentry |
| `list_orphan_comment_photos` | RPC, `security definer`, `execute` granted to `service_role` only | `p_limit int` (the Edge Function passes 100) | `text[]` of object names older than 24 h with no photo row, oldest first; the Edge Function loops until a batch comes back empty, capped at 20 batches per run | service role | none |

Function rules, checked in this order inside one transaction. Each rule failure does `raise exception '<code>'` (default `P0001`) with the code as the whole message; `packages/shared/src/commentPhotos.ts` maps the message to a typed error reason, and any other error becomes `request_failed`.
- `post_comment`: caller signed in and not anonymous; recipe exists and `deleted_at is null`; body after trim is null or 1 to 1000 chars (empty after trim becomes null); `jsonb_array_length(p_photos) <= 3`; body is not null or at least one photo; each path starts with `auth.uid()::text || '/'`, matches the pattern, exists in `storage.objects` for this bucket with `created_at > now() - interval '23 hours'`, and is not in `comment_photos`; width and height 1 to 1600; alt text trimmed, blank becomes null, max 200. Inserts the comment, then photos with `position` = array index.
- `edit_comment`: same checks, plus the comment exists, is the caller's, and its recipe is not soft deleted; each `{id}` item must belong to this comment. Edits are full replacements: a blank or null `p_body` clears the text, and `p_photos` is the complete final list. Deletes photo rows not in the list (collecting their paths), updates kept rows' position and alt text, inserts new rows, updates body. Sets `updated_at = now()` only when the body, the photo set, the order, or any alt text actually changed; an edit that changes nothing leaves it alone, so no false "(edited)". Rejects with `comment_empty` if the result has no text and no photos.
- `admin_delete_comment_photo`: caller is admin; deletes the photo row; if the parent comment now has null body and no photos, deletes the comment; returns the removed path.

**Value sourcing**:

| Action | Value produced / displayed | Source |
|---|---|---|
| Upload | object path `{user_id}/{uuid}.jpg` | `user_id` from the session; `uuid` generated on the client, new for every attempt |
| Upload | file bytes, content type | client processing output (web canvas, mobile `expo-image-manipulator`) |
| `post_comment` / `edit_comment` | photo `width`, `height` | client processing output (post resize dimensions), passed as input |
| `post_comment` / `edit_comment` | photo `position` | index in the `p_photos` array |
| `post_comment` / `edit_comment` | photo `user_id` | `auth.uid()` inside the function, never a client value |
| Upload policy | count of uploads in the last 24 h | `storage.objects.created_at` in the caller's folder |
| Edit result | "(edited)" marker | `comments.updated_at > created_at` (spec 0027), bumped by `edit_comment` on any change |
| Edit / delete cleanup | paths to delete from storage | `removed_paths` from the RPC; for a comment delete, the photo paths already loaded with the comment (if that list is stale, for example photos added from another device, the sweep removes the rest) |
| Read | full image URL | `client.storage.from('comment-photos').getPublicUrl(storage_path)` (derived from `SUPABASE_URL` plus path) |
| Read | reserved thumbnail space | `width`, `height` columns |
| Read | accessible label | `alt_text`, else "Photo {position+1} of {count} by {display name}" (display name from spec 0027's `user_display_names`, "Anonymous" fallback) |
| Composer | limit messages (3 photos, daily limit, original over 25 MB, upload expired) | shared constants and mapped error reasons in `packages/shared/src/commentPhotos.ts` |
| Sweep | which objects to delete | `list_orphan_comment_photos`: bucket objects with `created_at < now() - interval '24 hours'` and no `comment_photos.storage_path` match |
| Account deletion | the user's files | every object under `{user_id}/`, removed by the `delete-account` Edge Function before the user is deleted |
| Admin page | thumbnails | the same photo embed added to `fetchAllComments` |

**Key invariants**:
- A comment always has text or at least one photo (enforced by the functions, the only write path).
- A comment has at most 3 photos, positions are 0 to N minus 1 with no gaps after every write.
- Every `comment_photos.storage_path` is inside the folder of that row's `user_id`, and is unique.
- A file referenced by a photo row cannot be deleted through the storage API by a user or the admin (only the service role sweep bypasses policies, and it only touches files older than 24 hours, which can no longer be attached).
- A comment with a null body always has at least one photo; a direct table write can never create one (its policies require `body is not null`).
- `comment_photos.user_id` always equals its comment's `user_id`.
- No stored image contains EXIF metadata (a client guarantee; the server does not inspect bytes).

**Security model**:
- Read: anyone (anon, authenticated) can read `comment_photos` rows whose parent comment is readable. The select policy is `exists (select 1 from public.comments c where c.id = comment_id)`, so the soft deleted recipe filter on comments carries over (AC-13). Image files are public by URL; the paths are unguessable uuids.
- Write: no direct writes on `comment_photos`. On `comments`, the existing direct insert and `update (body)` stay for text only comments, with `body is not null` added to both policies' `with check`. Every create or edit involving photos goes through the `security definer` functions, which check `auth.uid()`, the anonymous claim, ownership, and the recipe state themselves.
- Delete: comment delete keeps the spec 0028 policy (owner or admin) and cascades to photos. A single photo can be removed by its owner only through `edit_comment`, and by the admin through `admin_delete_comment_photo`.
- Storage: uploads only into your own folder, only when not anonymous, under the daily cap; deletes only of your own (or, for the admin, any) unreferenced file.
- Privacy: metadata stripping keeps home locations out of public photos. Deleting an account removes the user's photo folder right away, not only through the sweep. No new regulated data.

**Configuration required**:
- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` in the new Edge Function (already set for the existing functions); the cron job reads the service role key from Vault, seeded with a placeholder in the migration and set by hand (same as spec 0017).
- `SENTRY_DSN` (already set) for the sweep function.
- Web: add the Supabase project host (`ctuzjhhpnkkhooneporu.supabase.co`, path `/storage/v1/object/public/comment-photos/**`) to `images.remotePatterns` in `apps/web/next.config.ts`.
- Mobile: add the `expo-image-picker` config plugin to `apps/mobile/app.json` with `photosPermission` and `cameraPermission` strings. This is a native module, so a new EAS dev client build is needed before testing.

**Critical test scenarios**:
- Happy path: a signed in user picks 2 photos (one HEIC), adds text, posts; the comment appears with 2 thumbnails in order, each file is JPEG, at most 1600 px, with no EXIF, verifies **AC-1**, **AC-3**.
- Backward compatibility: a direct text only insert (the spec 0027 path) still works; a direct insert with a null body is rejected, verifies **AC-2**.
- Referenced file: the owner of a comment on a soft deleted recipe cannot delete that comment's photo file through storage, verifies **AC-7**.
- Photo only: post with 1 photo and blank text succeeds; post with blank text and no photos is rejected by `post_comment` (also when called directly), verifies **AC-2**.
- Limit: calling `post_comment` with 4 photos fails with `too_many_photos`; the composer hides "add photo" at 3, verifies **AC-4**.
- Edit: replace photo 2, remove photo 1, add a new one, change alt text; the result lands atomically, shows "(edited)", and the removed files are gone from storage, verifies **AC-5**.
- Failure: the network drops during the second of 3 uploads; nothing is posted, the draft stays, and photo 2 shows retry; retrying posts all 3, verifies **AC-10**.
- Auth: user B calls `post_comment` with user A's uploaded path and gets `invalid_photo`; user B tries to upload into A's folder and gets 403; a guest upload gets 403; deleting a referenced file through storage does nothing, verifies **AC-7**.
- Rate limit: the 31st upload within 24 hours is rejected, verifies **AC-8**.
- Admin: deleting the only photo of a photo only comment deletes the comment too, verifies **AC-11**.
- Sweep: an uploaded but never attached file older than 24 hours is deleted on the next run; a fresh one is kept, verifies **AC-12**.
- Soft delete: after a recipe is soft deleted, a direct `comment_photos` select returns none of its photos, and `post_comment` returns `recipe_unavailable`, verifies **AC-13**.

## Build plan

Ordered as a Tracer Bullet: tasks 1 to 3 prove one real photo travelling from a web browser into storage, through the function, and back onto the page; the rest thicken that thread.

1. Migration `<timestamp>_comment_photos.sql`: make `comments.body` nullable with the new check, and add `body is not null` to the comments insert and update policies; create `comment_photos` with its constraints, indexes, and select policy; revoke all writes on `comment_photos` from `authenticated`; create the `comment-photos` bucket and its storage insert and delete policies (including the 24 hour cap and the `is_comment_photo_referenced` helper); create `post_comment`, `edit_comment`, `admin_delete_comment_photo`, and `list_orphan_comment_photos` with explicit `search_path` and the right `execute` grants. Regenerate `packages/shared/src/database.types.ts`. Run the security advisor, satisfies **AC-2**, **AC-4**, **AC-5**, **AC-7**, **AC-8**, **AC-11**, **AC-13**
2. Shared `packages/shared/src/commentPhotos.ts`: constants (max 3, 1600 px, quality 0.8, 5 MB, alt text 200, accepted input types), the path builder, a platform neutral upload helper (bytes plus content type in, path or a typed error out), the error reason mapping for the function errors, and `getCommentPhotoUrl`. Update `comments.ts`: `Comment` gains `photos: CommentPhoto[]` and `body: string | null`; `fetchRecipeComments` and `fetchAllComments` embed photos ordered by position; `postComment` calls `post_comment`; inventory and update every other caller that writes comments (web, mobile, tests); `validateCommentBody` allows empty when photos are present. Tests beside the source, satisfies **AC-1**, **AC-2**, **AC-4**, **AC-7**, **AC-8**
3. Web thin thread: in `apps/web/src/comments/`, a photo picker in the composer for one JPEG or PNG, canvas processing (resize, rotate, re-encode, metadata dropped), upload, post, and thumbnail display through `next/image` with reserved space; add the `remotePatterns` entry, satisfies **AC-1**, **AC-3**, **AC-9**
4. Web thicken: up to 3 photos with reorder and alt text fields, HEIC through a lazily imported `heic2any`, per photo progress and the retry or remove failure state, the daily limit message, the full size viewer dialog (keyboard, focus trap, Escape, next and previous), satisfies **AC-1**, **AC-3**, **AC-4**, **AC-8**, **AC-9**, **AC-10**
5. Edit and delete on web plus shared: `editComment` calls `edit_comment` and then removes `removed_paths`; `deleteComment` removes the comment's photo paths after the row delete; the edit UI supports remove, replace, add, reorder, and alt text, satisfies **AC-5**, **AC-6**
6. Mobile: install `expo-image-picker` and `expo-image-manipulator` (with `npx expo install`), add the config plugin and permission strings, build a new dev client; in `apps/mobile/src/comments/`, the picker (library and camera), processing through the manipulator, upload, post, edit, delete, `expo-image` thumbnails, and a full size modal viewer, reusing the shared module, satisfies **AC-1**, **AC-3** to **AC-6**, **AC-9**, **AC-10**, **AC-15**
7. Admin: photo thumbnails on `/admin/comments` and a per photo delete calling `admin_delete_comment_photo` then removing the returned path; whole comment delete also removes its photo paths, satisfies **AC-6**, **AC-11**
8. Orphan sweep and account deletion: update `supabase/functions/delete-account/` to remove the user's `comment-photos/{user_id}/` folder before deleting the user; Edge Function `supabase/functions/cleanup-orphan-comment-photos/` (lists through `list_orphan_comment_photos` in batches of 100, oldest first, at most 20 batches per run, removes through the Storage API with the service role, reports counts and errors to Sentry) plus a migration registering a daily pg_cron job that calls it through `pg_net` with the Vault stored key, satisfies **AC-6**, **AC-12**
9. SEO guard and i18n: confirm the recipe page metadata and JSON-LD builders in `packages/shared/src/seo.ts` never read comment photos, with a test; add every new UI string to the web and mobile translation files (spec 0020), satisfies **AC-14**, **AC-15**
10. Cross platform parity check against AC-1 to AC-15 on web and mobile, satisfies **AC-15**

## Consequences

**Positive**:
- Users can share real results, the most useful kind of comment on a recipe app.
- Every rule (text or photo, max 3, ownership, folder scope) is enforced by the database or storage policies, so a modified client cannot break them.
- No server image pipeline to run: processing happens on the client, and storage stays small (roughly 200 to 500 KB per photo).
- One cleanup path (the sweep) covers every way a file can become orphaned, including account deletion.

**Negative / tradeoffs**:
- Photos go live immediately with no automated screening; you are the only filter, through the admin page.
- A deleted photo's public URL can keep working until its CDN cache expires (about an hour with `cacheControl: 3600`), or up to about 24 hours if the client delete failed and the sweep has not run yet.
- Two write paths for comments (direct for text only, functions for photos) is more to test; the shared code always uses the functions, and the direct path should be retired once old mobile builds are gone.
- Web thumbnails use Vercel image optimization, which counts against the plan's image quota; mobile downloads the full 1600 px file for thumbnails, which costs data on long comment lists.
- Mobile needs two new native modules and a new dev client and store build before users get the feature.
- The EXIF guarantee rests on the clients; a hand crafted upload of a JPEG with metadata would be accepted.

**Neutral**:
- `comments.body` becomes nullable; every reader of `Comment.body` must handle null.
- A new storage bucket, three new functions, one new Edge Function, and one new cron job join the backend.

## Follow-up

- [ ] Retire the direct text only insert and update path on `comments` once installed mobile builds all use the functions.
- [ ] Automated photo screening (for example Claude Haiku vision in an Edge Function) if abuse shows up.
- [ ] A user facing "report" button feeding the admin page.
- [ ] Small client made thumbnails, or Supabase image transformations, if mobile data use or the Vercel image quota becomes a problem.
- [ ] Analytics event for photo attach (spec 0013) if you want to measure adoption.
- [ ] Declined Agent Skill and MCP search for `heic2any`, `expo-image-picker`, and `expo-image-manipulator`; `/sync` should record this on the `Declined:` line of the area `AGENTS.md` so it is not offered again.
- [ ] `/sync`: add the new Edge Function and bucket to `supabase/AGENTS.md`'s key files.

## Rationale

Reasoning and options: see [rationale.md](rationale.md).
