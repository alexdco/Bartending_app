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
