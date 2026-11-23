# Verify: user submitted recipes · spec 0064 · updated 2026-11-22
_Steps derived from spec 0064 acceptance criteria. `/check verify` runs these; `/test` locks the durable ones. Milestone 1 (web thin thread) only; later milestones append their own steps._

## UI / manual (web, `pnpm web`)
- [ ] Signed in (not anonymous), open the account menu → "Submit a recipe" and "My recipes" are there; the drawer on a phone width shows them too → AC-21
- [ ] As a guest (anonymous session), open `/my-recipes/new` → a "Sign in to submit a recipe" prompt with a Sign in button, no form → AC-4
- [ ] As a user with no display name, open `/my-recipes/new` → a required Display name field shows; submit with it blank → "This field is required." and nothing is saved → AC-3
- [ ] As a user who already has a display name → no Display name field → AC-3
- [ ] Submit with a blank name, no ingredients, and blank instructions → a field error on each, nothing saved (check `/my-recipes` stays empty) → AC-2
- [ ] Fill name (with surrounding spaces), 2 ingredients (one blank measure), instructions, Type, and a note; submit → lands on `/my-recipes`, the row shows the trimmed name and "Pending review" → AC-1
- [ ] With the UI in Japanese (`/ja/my-recipes/new`), submit → the admin queue row shows locale JA → AC-1 (Value sourcing: `locale` from the current UI locale)
- [ ] Search for the pending recipe's name, open `/sitemap.xml`, and try `/recipes/<anything>-<submission id>` → it appears nowhere public → AC-1
- [ ] Reach 5 pending submissions, then submit a 6th → "You have 5 recipes waiting for review…" → AC-5 (Value sourcing: pending count excludes the row being edited)
- [ ] As admin, open Admin → "Submissions" → Pending tab lists oldest first; each row shows name, author display name (or "No display name"), locale, and Text screening badge; Rejected and Approved tabs load → AC-10 (Value sourcing: author display name from `user_display_names` data)
- [ ] Open a pending submission → the author's original fields, "Not screened" warning, similar recipes (up to 5) and the review form prefilled, with the note in Bartender tip → AC-11, AC-15 (Value sourcing: similar recipes from `search_recipes`, `bartender_tip` prefilled from `note`)
- [ ] Add a tag and a method, Approve → back on the queue; the recipe is in search right away; the submission is under Approved → AC-11
- [ ] Open the approved recipe page → "Submitted by <author display name>"; view source → the Recipe JSON-LD has `author: { "@type": "Person", "name": … }` (only when the recipe has an image) → AC-16
- [ ] Change the author's display name in Account, reload the recipe page after revalidation → the credit shows the new name → AC-16 (Value sourcing: `submitted_by_name` read live)
- [ ] Open a catalog recipe → no "Submitted by" line and no JSON-LD `author` → AC-16
- [ ] As the author, `/my-recipes` → the approved row shows the live recipe name and "View recipe" links to it → AC-6 (Value sourcing: `approved_recipe_id` → recipe slug)
- [ ] Load a pending submission as admin, then edit it as the author in another session (task 5 adds the edit UI; until then call `save_recipe_submission` again for the same id), then Approve → "This submission changed, reload it", no recipe created → AC-14

## Commands
- [ ] Paste `supabase/tests/recipe_submissions_check.sql` in the SQL editor → the report lists 35 PASS lines and no FAIL → AC-1 to AC-6, AC-10, AC-11, AC-14, AC-16, AC-17, AC-22, AC-23
- [ ] `select has_function_privilege('anon', 'public.save_recipe_submission(uuid, text, jsonb, text, text, text, text, text, text, text)', 'execute')` → false → AC-4
- [ ] As a non admin signed in session, `select count(*) from recipe_submissions` through the REST API → 0 rows → AC-23
- [ ] Set a user's `recipe_submission_usage` count for today (UTC) to 10, then save → `daily_cap`; a save just after 00:00 UTC succeeds again → AC-5 (Value sourcing: daily count keyed by the UTC day)
- [ ] `select submissions_blocked_at` is not in the authenticated update grant: `select privilege_type from information_schema.column_privileges where table_name = 'user_preferences' and column_name = 'submissions_blocked_at' and grantee = 'authenticated'` → no UPDATE row → AC-18 groundwork
- [ ] `pnpm test` → all green, including `packages/shared/src/submissions/*.test.ts` and `recipe-json-ld.test.ts` → AC-2, AC-16
- [ ] `pnpm --filter web typecheck && pnpm --filter web lint` → clean → AC-24 keys typed against `en.json`

## Value sourcing coverage (milestone 1 rows)
- `author_id` from `auth.uid()`: the check script's "saving another user's id gets not_editable"
- anonymous check from the JWT `is_anonymous` claim: the check script's AC-4 line
- `locale` from the UI locale, unchanged on edit: the Japanese submit step, and the check script's "edit keeps locale"
- pending count (cap 5, excludes this id): the 6th submit step, and the check script's "editing one of 5 pending still works"
- daily count by UTC day: the usage command above
- blocked from `submissions_blocked_at`: groundwork command above (the toggle is task 10)
- needs display name from `display_name is null`: the two AC-3 steps
- admin author display name, similar recipes, `bartender_tip` from note: the admin review steps
- recipe English text and `fame_score` from the review form: the Approve step (blank fame score saves null)
- `submitted_by_name` live, credit text derived: the two AC-16 steps
- My recipes link from `approved_recipe_id`: the "View recipe" step

## Acceptance-criteria coverage (milestone 1)
- AC-1 … Japanese submit, valid submit, not public steps, check script · AC-2 … blank fields step, unit tests, check script · AC-3 … display name steps · AC-4 … guest step, privilege command · AC-5 … 6th submit, daily cap command · AC-6 (approved read only, link) … My recipes step, check script · AC-10 … admin queue step · AC-11 … review and Approve steps · AC-14 … stale step, check script · AC-15 (warning only) … review step · AC-16 … credit steps, JSON-LD test · AC-21 (menu links) … menu step · AC-23 … REST count command, check script
- Later milestones: AC-7, AC-8, AC-9, AC-12, AC-13, AC-17 (photos part), AC-18, AC-19, AC-20 (mobile), AC-21 (search prompt), AC-22 (import guard), AC-24 (mobile strings)

## Milestone 2: author lifecycle and form helpers · updated 2026-11-22

### UI / manual (web, `pnpm web`)
- [ ] As the author, `/my-recipes` → a pending row shows Edit and Withdraw; an approved row shows neither → AC-6
- [ ] Edit a pending submission, change the instructions, "Save and resubmit" → back on `/my-recipes`, still "Pending review", the change is in the admin view → AC-6
- [ ] Open `/my-recipes/<approved id>/edit` directly → "This recipe can't be changed anymore", no form → AC-6
- [ ] Edit a submission created in `/ja/...` while the UI is English, resubmit → the admin queue still shows JA → AC-6 (Value sourcing: `locale` unchanged on edit)
- [ ] Withdraw a pending row → confirm text shows; Cancel keeps it; Withdraw removes it from the list → AC-6
- [ ] Withdraw one submission after 10 saves today, then save again → still "Daily limit reached" → AC-5 (withdrawing doesn't lower the day's count)
- [ ] As admin, open a pending submission, Reject with a blank reason → "Add a reason.", nothing changes → AC-13
- [ ] Reject with a reason → back on the queue; the row is under Rejected → AC-13
- [ ] As the author, `/my-recipes` → the rejected row shows "Rejected", the reason, and "Edit and resubmit"; the edit page shows the reason above the form → AC-13
- [ ] Resubmit the rejected one → "Pending review", no reason shown, it's back in the admin Pending tab → AC-6
- [ ] Load a pending submission as admin, edit it as the author in another session, then Reject (and separately Approve) as admin → "This submission changed, reload it" with a Reload button, nothing written; Reload shows the new text → AC-14
- [ ] On `/my-recipes/new`, type "margarita" (any case, with extra spaces) and pause → "A recipe with this name already exists" with a link to the catalog Margarita → AC-7
- [ ] On `/es/my-recipes/new`, type the Spanish name of a translated catalog recipe → the warning shows; type its English name → the warning shows too → AC-7 (Value sourcing: `search_recipes` in the current locale, matched on localized or English name)
- [ ] Type a duplicate name and press Submit at once (before the pause) → the warning shows and nothing saves; Submit again → it saves → AC-7
- [ ] In an ingredient row, type "lim" → a suggestion list from the catalog appears (in the UI language); a name not in the catalog still saves → AC-1 (Value sourcing: `search_ingredients`)
- [ ] Search for something with results, scroll to the end → "Can't find it? Submit your recipe" links to `/my-recipes/new` → AC-21
- [ ] Search for nonsense → the empty state is followed by the same prompt → AC-21
- [ ] As a guest, the prompt links to `/account` (sign in) → AC-21
- [ ] Turn on mocktails only mode → the search prompt is gone → AC-20

### Commands
- [ ] Paste `supabase/tests/recipe_submissions_lifecycle_check.sql` in the SQL editor → 16 PASS lines and no FAIL → AC-4, AC-5, AC-6, AC-13, AC-14, AC-23
- [ ] `pnpm test` → green, including `duplicates.test.ts`, `photos.test.ts`, and the `validateRejectionReason` cases → AC-7, AC-13

### Acceptance-criteria coverage (milestone 2)
- AC-6 … edit, approved read only, withdraw steps, check script · AC-7 … three duplicate steps, unit tests · AC-13 … reject steps, author reason step, check script · AC-14 … stale step, check script · AC-21 (search prompt) … three prompt steps · AC-1 (autocomplete) … ingredient step · AC-5 (withdraw keeps count) … daily count step, check script

## Milestone 3: photos, screening, and Draft English · updated 2026-11-22

### UI / manual (web, `pnpm web`)
- [ ] On `/my-recipes/new`, attach a large non square JPEG → a center square preview shows; submit → the row on `/my-recipes` shows the thumbnail → AC-8
- [ ] In Storage, `recipe-submission-photos/<your uid>/` holds `<submission id>-<hash>-hero.webp` and `-card.webp`, both WebP, hero at most 1000px, card 400px, no EXIF → AC-8
- [ ] Attach a file that is too small or not an image → a field error, nothing uploads → AC-8
- [ ] Edit that submission, replace the photo, resubmit → the new pair exists under a new hash and the old pair is gone; edit again and remove the photo → no files left for that id → AC-8
- [ ] As another signed in user, request the first user's hero through `storage.from('recipe-submission-photos').download(...)` → error (403), nothing returned → AC-8, AC-23
- [ ] Submit a normal recipe with a photo, wait about a minute, open it as admin → "Text: Clear" and "Photo: Clear" badges, no "Not screened" warning → AC-9, AC-15
- [ ] Submit one with a spam link in the note → within a minute or two the Text badge is "Flagged" and the note shows prominently; Approve still works → AC-9, AC-15
- [ ] Right after submitting (before screening lands), open it as admin → "Not screened" warning; Approve still works → AC-15
- [ ] As the author, `/my-recipes` and the edit page never show any screening result or note → AC-9, invariant 8
- [ ] Approve a submission with "Keep photo" checked → the recipe page shows the photo, served from `recipe-images/recipes/<recipe id>/`, and the submission's private files are gone from `recipe-submission-photos` → AC-11 (Value sourcing: `image_url` from the copy step, `image_origin = 'admin_upload'`)
- [ ] Approve another with "Keep photo" unchecked → the recipe has no image; the private files are still removed → AC-11
- [ ] Open a submission made in `/ja/...` as admin → "Draft English" shows; on an `en` submission it does not → AC-12
- [ ] Click "Draft English" → the review form fills with English name, instructions, glass, ingredients, measures, and note, with the original shown beside it; "Use original" restores the original → AC-12
- [ ] Approve the drafted one → the saved recipe row is English (`select name, instructions from recipes where id = …`); `/ja/recipes/...` shows English until the next `translate-catalog` run, and that run's dry run lists the recipe for every catalog locale → AC-12, invariant 6

### Commands
- [ ] Paste `supabase/tests/recipe_submission_photos_check.sql` in the SQL editor → every line PASS, no FAIL → AC-4, AC-8, AC-11, AC-23
- [ ] Paste `supabase/tests/recipe_submission_screening_check.sql` → every line PASS, no FAIL (covers 3 failures → `error`, the 300 ceiling → `skipped`, the late result for an older `submitted_at` discarded, status never changed) → AC-9
- [ ] `select status_code, content from net._http_response order by created desc limit 3` after a cron tick → 200 with `{"screened":…,"flagged":…,"failed":…,"skipped":…,"deferred":…}` → AC-9 (the 5 minute sweep reaches the function with the Vault `secret_key`)
- [ ] `select has_function_privilege('authenticated', 'public.claim_pending_recipe_submissions(uuid, integer)', 'execute')` → false (same for `reserve_recipe_screening`, `record_recipe_submission_screening`) → AC-23
- [ ] Call `draft-submission-english` with a non admin user's JWT → 403 `not_admin`; with no session → 401 → AC-12, AC-23
- [ ] `pnpm test` → green, including `submission-verdict.test.ts`, `english-draft.test.ts`, and `photos.test.ts` → AC-8, AC-9, AC-12

### Value sourcing coverage (milestone 3 rows)
- which version was checked (`submitted_at` from the claim): the screening check script's late result line, and resubmitting while a check is in flight
- image sent to Haiku (the hero WebP): the clear and flagged photo steps
- daily global count (`recipe_screening_daily_total`, cap 300 or `RECIPE_SCREENING_DAILY_CAP`): the check script's ceiling line
- model id (`SCREENING_MODEL`, default `claude-haiku-5-5`): the screening steps run against the deployed function
- `image_url` and `image_origin` from the copy step: the Keep photo approve step
- recipe English text from the review form (optionally Draft English): the Draft English approve step

### Acceptance-criteria coverage (milestone 3)
- AC-8 … attach, storage layout, bad file, replace and remove, other user steps, photos check, unit tests · AC-9 … clear and flagged steps, author never sees it, screening check, cron command · AC-11 (photo) … keep and drop approve steps, photos check · AC-12 … Draft English steps, auth command · AC-15 … Not screened and flagged steps

## Milestone 4: safety and lifecycle · updated 2026-11-23

### UI / manual (web, `pnpm web`)
- [ ] As admin, open any submission at `/admin/submissions/<id>` (pending, rejected, or approved) → a "Block from submitting" checkbox with its hint shows at the bottom → AC-18
- [ ] Tick it, then as that author open `/my-recipes/new` → "Submitting recipes isn't available for your account", no form → AC-18
- [ ] As the blocked author, try to save an edit of a pending submission → the same neutral message, nothing saved; the admin queue still lists their pending row → AC-18
- [ ] As the blocked author, withdraw a pending submission → it goes, along with its photo files → AC-6, AC-18
- [ ] As admin, untick the box → the author can save again → AC-18
- [ ] Sign in as a throwaway author with one approved recipe (with photo) and one pending submission with a photo, then delete the account from `/account` → the pending row is gone from the admin queue, `recipe-submission-photos/<uid>/` is empty in Storage, and the approved recipe page reads "Submitted by a community member" with no JSON-LD `author` → AC-16, AC-17
- [ ] Favorite and rate that approved recipe from another account before the deletion → both still work after it → AC-17
- [ ] Turn on mocktails only mode → no "Submit a recipe" or "My recipes" in the account menu, no search prompt, and `/my-recipes`, `/my-recipes/new`, and `/my-recipes/<id>/edit` redirect home; an approved non alcoholic community recipe shows in mocktail lists → AC-20

### Commands
- [ ] Paste `supabase/tests/recipe_submissions_safety_check.sql` into the dashboard SQL editor → every line PASS (block on, off, and for an author with no preferences row; 90 day reject sweep and dry run; orphan file list; 7 day usage sweep; helpers refused for signed in callers; import, merge, hide, custom import, and reset leave a community recipe byte for byte unchanged; fame on arrival fills only an empty fame score; account deletion cascade) → AC-17, AC-18, AC-19, AC-22, AC-23
- [ ] `select jobname, schedule from cron.job where jobname = 'cleanup-recipe-submissions'` → one row, `30 3 * * *` → AC-19
- [ ] POST `{"dryRun": true}` to `cleanup-recipe-submissions` with the `secret_key` on the `apikey` header → 200 with `wouldDeleteRejected`, `wouldDeleteOrphanFiles`, `wouldDeleteUsageRows`, nothing deleted; without the key → 401 → AC-19
- [ ] After the first nightly run, check the function logs → `run complete` with `deletedRejected`, `deletedOrphanFiles`, `deletedUsageRows` → AC-19
- [ ] As admin in the dashboard, edit a community recipe through the spec 0030 form → `source`, `source_id`, and `submitted_by` are unchanged afterwards → AC-22
- [ ] `pnpm test` → green, including `communityGuard.test.ts` (the overrides file can't name a `community-<uuid>` id) → AC-22

### Value sourcing coverage (milestone 4 rows)
- blocked (`user_preferences.submissions_blocked_at`): the block on and off steps, and the check script's block lines
- rejection age (`reviewed_at`): the check script's 89 day versus 91 day line
- `fame_score` left empty at approval, filled by the next import's fame on arrival: the check script's fame lines (a score set at review is kept)
- `submitted_by_name` after account deletion (null, community member fallback): the account deletion step and the check script's detail line

### Acceptance-criteria coverage (milestone 4)
- AC-17 … account deletion steps, check script cascade lines · AC-18 … block steps, check script block lines · AC-19 … check script sweep lines, cron and dry run commands · AC-20 … mocktails step (web) · AC-22 … check script import guard lines, admin edit command, `communityGuard.test.ts`

## Milestone 5: mobile parity, strings, and analytics · updated 2026-11-23

### UI / manual (mobile, `pnpm mobile`, dev client on a device or simulator)
- [ ] Signed in, tap the header avatar → the menu shows "Submit a recipe" and "My recipes" under Account; the Account screen shows both buttons under "View favorites" → AC-21
- [ ] As a guest (anonymous), open the Account screen → neither button shows; push `/my-recipes/new` (deep link `cocktailist://my-recipes/new` or the search prompt) → "Sign in to submit a recipe" with a Sign in button, no form → AC-4
- [ ] As a user with no display name, open Submit a recipe → a required Display name field shows; submit it blank → "This field is required." and nothing saves → AC-3
- [ ] Submit with a blank name, no ingredient name, and blank instructions → an error under each field, nothing saved → AC-2
- [ ] Fill name, 2 ingredients (type "lim" in one → catalog suggestions in the app language; tap one to fill it; a name not in the catalog also saves), instructions, Type chip, note; submit → lands on My recipes, the row says "Pending review" → AC-1
- [ ] With the app in Japanese, submit → the admin queue on web shows locale JA → AC-1 (Value sourcing: `locale` from the current UI locale)
- [ ] Type "margarita" and pause → "A recipe with this name already exists" with a tappable link to it; tap Submit at once with a duplicate → warning shows, nothing saves; tap again → it saves → AC-7
- [ ] Add a photo from the library (a large non square iPhone photo, HEIC original) → a square preview shows; submit → the My recipes row shows the thumbnail; in Storage the pair is `<uid>/<id>-<hash>-hero.webp` (at most 1000px) and `-card.webp` (400px), both WebP → AC-8
- [ ] Pick an image under 600px on its short side → "That image is too small…", nothing uploads → AC-8
- [ ] Edit a pending row, replace the photo, "Save and resubmit" → still Pending, the old pair is gone from Storage; edit again, Remove photo → "The photo will be removed when you submit.", then no files for that id → AC-6, AC-8
- [ ] Withdraw a pending row → the confirm text with Cancel and Withdraw; Cancel keeps it, Withdraw removes it → AC-6
- [ ] Reject one on web with a reason → on mobile My recipes shows "Rejected", the reason, and "Edit and resubmit"; the edit screen shows the reason above the form → AC-13
- [ ] Approve one on web → on mobile its row shows "Approved", the live name and public image, and "View recipe" opens the recipe; Edit and Withdraw are gone; opening its edit route shows "This recipe can't be changed anymore." → AC-6
- [ ] Open the approved recipe on mobile → "Submitted by <name>" under the rating; a catalog recipe shows no such line; after the author deletes their account → "Submitted by a community member" → AC-16
- [ ] Block the author on web → on mobile Submit a recipe shows "Submitting recipes isn't available for your account" → AC-18
- [ ] Search with results and scroll to the end → "Can't find it? Submit your recipe"; search nonsense → the empty state is followed by the same prompt; as a guest the prompt opens Account (sign in) → AC-21
- [ ] Turn on mocktails only mode → no header menu, no Account buttons, no search prompt, and pushing `/my-recipes`, `/my-recipes/new`, or `/my-recipes/<id>/edit` shows the mocktails unavailable notice → AC-20
- [ ] Switch the app through all 9 languages → every new label, button, error, and status reads in that language, with no raw `submissions.` keys → AC-24

### Analytics (PostHog live events, consented session)
- [ ] Open the form from the menu → `recipe_submission_form_opened` with `{ entry: "menu" }`; from the search prompt → `{ entry: "search" }` (web: `/my-recipes/new?from=search`) → spec Configuration
- [ ] Submit a new recipe with a photo → `recipe_submission_saved` `{ is_resubmit: false, has_photo: true, locale }`; resubmit an edit after removing the photo → `{ is_resubmit: true, has_photo: false, locale: <the row's original locale> }` → spec Configuration
- [ ] Withdraw → `recipe_submission_withdrawn` with no properties; no event ever carries a recipe name or text → invariant 8

### Commands
- [ ] `pnpm test` → green, including `messages.test.ts` (shared message keys, `submissionHasPhotoAfterSave`, `recipeImageHashFromDigest`), `analytics.test.ts`, and both apps' `placeholderMessages.test.ts` → AC-2, AC-5, AC-24
- [ ] `pnpm typecheck && pnpm lint` → clean (mobile route types regenerate when `pnpm mobile` starts) → AC-24
- [ ] Supabase security advisor → for this feature only the intended items: no policy INFO on `recipe_submission_usage` and `recipe_screening_daily_total`, definer functions callable by signed in users (each checks owner, anonymous, or `is_admin` inside), and `recipe_submitted_by_name` callable by anon (returns only a community recipe's already public credit name) → AC-23

### Value sourcing coverage (milestone 5 rows)
- `locale` from the UI locale (mobile: the active i18next language): the Japanese submit step
- duplicate matches from `search_recipes` in the current locale: the margarita step
- ingredient autocomplete from `search_ingredients`: the "lim" step
- alcoholic status options from `SUBMISSION_ALCOHOLIC_STATUSES`: the Type chips in the submit step
- `submitted_by_name` live, credit text derived: the recipe detail step
- My recipes link from `approved_recipe_id`: the View recipe step

### Acceptance-criteria coverage (milestone 5)
- AC-1 … submit, Japanese, autocomplete steps · AC-2 … blank fields step · AC-3 … display name step · AC-4 … guest step · AC-6 … edit, withdraw, approved steps · AC-7 … duplicate step · AC-8 … photo steps · AC-13 … rejected step · AC-16 … credit step · AC-18 … blocked step · AC-20 … mocktails step · AC-21 … menu and prompt steps · AC-23 … advisor command · AC-24 … language step, placeholder tests
