# Verify: Recipe comment photos · spec 0032 · updated 2026-10-09
_Steps derived from spec 0032 acceptance criteria. `/check verify` runs these; `/test` locks the durable ones._

Before you start: the `comment_photos` migration is applied (it is, as of 2026-10-09). The two AC-12 steps also need the cron migration `20261009120000_register_orphan_comment_photo_cleanup_cron.sql` applied and the real service role key set in Vault. Mobile steps need a new dev client build (`expo-image-picker`, `expo-image-manipulator`, `expo-crypto`).

## UI / manual (web)
- [ ] Signed in (linked account), open any recipe, pick 2 photos (one HEIC, one PNG), add text, post → the comment appears without a reload with 2 thumbnails in the chosen order → AC-1
- [ ] Download the stored files from the thumbnails' URLs → each is `image/jpeg`, long edge at most 1600 px, and `exiftool` shows no EXIF or GPS → AC-3
- [ ] Pick a photo over 25 MB → "This photo is over 25 MB" shows before any upload → AC-3
- [ ] Pick a GIF → "This file type isn't supported" → AC-3
- [ ] Post a photo only comment (blank text) → it posts and shows only thumbnails; blank text with no photos → "Write something or add a photo before posting." → AC-2
- [ ] Add 3 photos → the "Add photo" button is replaced by "3 photos max." → AC-4
- [ ] Edit your comment: remove photo 1, replace photo 2, add a new one, move it left, change alt text, save → the result lands as shown, "(edited)" appears, and the removed and replaced files return 404 from their public URLs (after the CDN cache, about an hour) → AC-5
- [ ] Open and save an edit without changing anything → no "(edited)" marker appears → AC-5
- [ ] Delete a comment with photos → it disappears and its files are gone from the bucket → AC-6
- [ ] Click a thumbnail → a dialog opens full size; Left and Right arrows and the Previous and Next buttons move between photos; Escape closes it and focus returns to the thumbnail → AC-9
- [ ] With a screen reader, a thumbnail with no alt text reads "Photo 1 of 2 by <display name>"; with alt text it reads the alt text → AC-9
- [ ] Load a comment list with photos on a throttled connection → thumbnail boxes hold their size before the images arrive, with no layout shift → AC-9
- [ ] Go offline (DevTools) after picking 3 photos, then post → nothing is posted, the text and photos stay, failed photos show "Upload failed" with Retry and Remove; go online, press Retry → the comment posts with all 3 → AC-10
- [ ] As the admin, open `/admin/comments` → photo thumbnails show under each comment; "Remove photo" on one of two photos removes just that one; on the only photo of a photo only comment it removes the comment too; files are gone from the bucket in both cases → AC-11
- [ ] View the recipe page source → `og:image` and JSON-LD `image` are the recipe's own image, never a `comment-photos` URL → AC-14

## UI / manual (mobile)
- [ ] Same post, edit, delete, failure, and viewer flows as above, from the library and from "Take photo" → matching behavior; the viewer closes with the Android back gesture → AC-15, AC-1, AC-5, AC-6, AC-9, AC-10
- [ ] Deny camera permission, tap "Take photo" → "Allow camera access in Settings to take a photo." → AC-15

## Commands / SQL
- [ ] As a guest (anonymous session), call `storage.from('comment-photos').upload('<uid>/<uuid>.jpg', …)` → 403; call `rpc('post_comment', …)` → `not_signed_in` → AC-7
- [ ] As user B, upload into user A's folder → 403; call `post_comment` with A's uploaded path → `invalid_photo` → AC-7
- [ ] As the owner, `storage.from('comment-photos').remove([<path of an attached photo>])` → the file is still there (policy skips referenced files) → AC-7
- [ ] Upload 30 files as one user, then a 31st → the 31st is rejected, and the composer shows "Daily photo limit reached" → AC-8
- [ ] `rpc('post_comment', { p_recipe_id, p_body: 'x', p_photos: [4 items] })` → `too_many_photos` → AC-4
- [ ] `rpc('post_comment', { p_recipe_id, p_body: '  ', p_photos: [] })` → `comment_empty`; a direct `from('comments').insert({ body: null, … })` → rejected by RLS; a direct text only insert → still works → AC-2
- [ ] Soft delete a recipe that has a photo comment → `from('comment_photos').select()` returns none of its photos; `post_comment` on it → `recipe_unavailable` → AC-13
- [ ] Upload a file and never attach it; 24+ hours later, after the 04:30 UTC cron run (or a manual POST with the service role key) → the file is gone; a file uploaded in the last 24 hours is kept → AC-12
- [ ] `select jobname, schedule from cron.job` → `orphan-comment-photo-cleanup` at `30 4 * * *` → AC-12
- [ ] POST to `cleanup-orphan-comment-photos` with a wrong bearer token → 401 (checked 2026-10-09) → AC-12
- [ ] Delete an account that has comment photos via `delete-account` → its `comment-photos/<user_id>/` folder is empty right away → AC-12 (account deletion)

## Value sourcing
- [ ] Object path: two uploads by the same user, and a retry after a failed upload → each has a new uuid under `<the session's user id>/`, never another user's id → Upload path row
- [ ] Width and height: post a 4032x3024 photo and a 3024x4032 one → stored rows are 1600x1200 and 1200x1600; an 800x600 photo stays 800x600 → width/height row
- [ ] Position: post photos in order C, A, B → `position` 0, 1, 2 in that order; after moving B left in an edit, B and A swap and positions stay 0..2 with no gap → position row
- [ ] Photo `user_id`: call `post_comment` as user A → every `comment_photos.user_id` equals A, whatever the client sends → user_id row
- [ ] Daily count: delete one of your uploads and upload again → the cap counts objects that exist in your folder in the last 24 h → upload policy row
- [ ] "(edited)": change only one photo's alt text → `updated_at` moves and "(edited)" shows; an identical save leaves `updated_at` alone → edited marker row
- [ ] Cleanup paths: edit away a photo → its path is in `removed_paths` and gets removed; delete a comment whose photos changed on another device → the stale extra file is caught by the sweep → cleanup row
- [ ] Full image URL: thumbnails resolve to `https://ctuzjhhpnkkhooneporu.supabase.co/storage/v1/object/public/comment-photos/<path>` → URL row
- [ ] Accessible label: set display name "Sam", post 2 photos without alt text → labels "Photo 1 of 2 by Sam", "Photo 2 of 2 by Sam"; with no display name → "by Anonymous" → label row
- [ ] Composer limits: 3 photos, the daily limit, over 25 MB, and an upload older than 23 h at attach time (`invalid_photo`) each show their message → composer row
- [ ] Sweep selection: a 25 h old unattached file is listed by `list_orphan_comment_photos`; a 25 h old attached file and a 1 h old unattached file are not → sweep row
- [ ] Admin thumbnails: `/admin/comments` shows the same photos, in the same order, as the recipe page → admin row

## Acceptance-criteria coverage
- AC-1: web post step, mobile flows · AC-2: photo only step, `comment_empty` and direct insert SQL · AC-3: download/EXIF, 25 MB, GIF steps · AC-4: 3 photo UI step, `too_many_photos` SQL · AC-5: edit steps · AC-6: delete step, admin step · AC-7: guest, cross user, referenced file SQL · AC-8: 31st upload · AC-9: viewer, screen reader, layout shift steps · AC-10: offline retry step · AC-11: admin step · AC-12: sweep, cron, 401, account deletion steps · AC-13: soft delete SQL · AC-14: page source step (plus `recipe-json-ld.test.ts`) · AC-15: mobile steps
