# 0064. User submitted recipes

**Date**: 2026-11-22
**Status**: In Progress

## Summary

Signed in users can now send in their own recipes from web or mobile. Each one waits in a private review queue until you, the admin, approve it (after any edits you want) or reject it with a short reason. An approved recipe joins the public catalog as a normal recipe that credits its author ("Submitted by Sam"). Submissions live in their own table and a private photo bucket, so nothing unreviewed can leak into search, lists, or the sitemap. Claude Haiku checks each submission and flags anything suspicious for you, but never decides on its own.

## Requirements

**User stories**:
- As a home bartender, I want to submit my own recipe, so other people can make it and I get credit.
- As an author, I want to see whether my recipe is pending, approved, or rejected (and why), so I can fix it and send it again.
- As the admin, I want a review queue with spam and safety flags, so I only publish recipes I stand behind, without bouncing small fixes back to the author.
- As a reader, I want community recipes to look and work like every other recipe, in my language.

**Acceptance criteria** (the contract, each criterion is IDed and independently checkable):
- **AC-1**: A signed in, non anonymous user (not in mocktails only mode) can open `/[locale]/my-recipes/new` on web, or the matching mobile screen. They fill in name, 1 to 20 ingredients (name plus optional measure, with names autocompleted from the ingredient catalog but free text allowed), instructions, optional glass, alcoholic status, an optional note, and an optional photo, then submit. A `recipe_submissions` row is created with `status = 'pending'` and `locale` set to their current UI locale. It shows as Pending on My recipes and appears nowhere public (search, lists, recommendations, detail by id, sitemap).
- **AC-2**: The form and the database both enforce these limits: name 1 to 100 characters, instructions 1 to 2,000, ingredient name 1 to 80, measure up to 50, 1 to 20 ingredients, note up to 300, and alcoholic status one of the existing recipe values. Text is trimmed and blanks count as empty. Any violation shows a field error, and nothing is saved.
- **AC-3**: If the user has no display name, the form shows a required display name field (spec 0018 rules: trimmed, 1 to 50 characters). It is saved to `user_preferences.display_name` in the same transaction as the submission. A user who already has one never sees the field.
- **AC-4**: A guest (anonymous session) who opens the submit route sees a sign in prompt instead of the form. A direct call to any submission function, or an upload into `recipe-submission-photos`, from an anonymous or signed out session is rejected.
- **AC-5**: A save that would give the user more than 5 pending submissions fails with a "you have 5 recipes waiting for review" message. The 11th save that enters pending in one UTC day fails with a "daily limit reached" message. Withdrawing a submission does not lower that day's count.
- **AC-6**: The author can edit a pending or rejected submission. Saving it sets it to pending, clears the rejection reason, resets `submitted_at`, starts a new screening, and counts toward the daily limit. Editing never changes `locale`. The author can withdraw a pending or rejected submission, even while blocked (AC-18), which deletes the row and its photo files. An approved submission is read only and cannot be withdrawn. My recipes shows an approved one with the live recipe's name and public image and a link to it, or "Removed from the catalog" if that recipe was later deleted.
- **AC-7**: When the typed name exactly matches a live catalog recipe's localized or English name (ignoring case, accents, and surrounding spaces), the form shows "A recipe with this name already exists" with a link to it, after typing pauses and again on submit. Submitting is still allowed.
- **AC-8**: The user can attach, replace, or remove one photo. It goes through the spec 0041 crop (center square, metadata stripped, a hero WebP up to 1000px plus a 400px card WebP, same rules for input type, size, and minimum side). Both files go to the private `recipe-submission-photos` bucket, readable only by the author and the admin.
- **AC-9**: Each time a submission enters pending, Claude Haiku checks its text and photo in one call. It sets `text_screening` (and `photo_screening` when there is a photo) to `clear`, `flagged`, or `error`, with a short `screening_note`. The check never changes `status`, and the author never sees its result. A database trigger starts the check, and a cron job every 5 minutes retries anything still unscreened. After 3 failed attempts the result is `error`. Once 300 checks have run in a UTC day, further submissions are marked `skipped` and still reach the queue.
- **AC-10**: The admin sees `/[locale]/admin/submissions` (web only, linked from the admin nav), with Pending (oldest `submitted_at` first), Rejected, and Approved (both newest `reviewed_at` first) tabs. It is paginated by keyset (it pages on a stable sort key instead of offsets). Each row shows name, author display name, locale, photo thumbnail, and screening badges.
- **AC-11**: Opening a submission shows the author's original fields, the screening note, the photo, and up to 5 catalog recipes with similar names. A review form is prefilled from the submission: the spec 0030 admin recipe form, with the note mapped to the bartender tip. The admin can edit any field, add tags, region, method, flavor profile, and fame score, and keep or drop the photo. Approve creates, in one atomic step, a `recipes` row with `source = 'community'`, `source_id = 'community-<submission id>'`, and `submitted_by` set to the author, plus its ingredients and tags (reusing spec 0030's name matching). It copies a kept photo into `recipe-images` as `image_origin = 'admin_upload'`, and sets the submission to `approved` with `approved_recipe_id` and `reviewed_at`. The recipe is live in search right away.
- **AC-12**: For a submission whose `locale` is not `en`, the review screen offers "Draft English". Haiku returns an English name, instructions, glass, ingredient names and measures, and note, which fill the review form, with the original shown beside it. Nothing is saved until Approve, and the saved recipe is always English. The next `translate-catalog` run translates it into every other catalog locale, the author's included. Until then those locales show English (spec 0045 AC-2).
- **AC-13**: Reject requires a reason of 1 to 500 characters. It sets `status = 'rejected'`, `rejection_reason`, and `reviewed_at`, and the author sees the reason on My recipes with an Edit action.
- **AC-14**: Approve and reject both send the `updated_at` the admin loaded. If the author saved in the meantime, the action fails with "This submission changed, reload it", and nothing is written. Approving or rejecting a submission that is not pending fails the same way.
- **AC-15**: The admin can approve while screening is `pending`, `error`, or `skipped`. The review screen then shows a visible "Not screened" warning. A `flagged` result shows the note prominently but does not block approval.
- **AC-16**: An approved community recipe's detail page (web and mobile) shows "Submitted by <display name>", read live from the author's current display name. If `submitted_by` is null (the account was deleted), it shows "Submitted by a community member". On web, the Recipe JSON-LD gets `author: { "@type": "Person", name }` when a name exists, and no `author` otherwise. Catalog and admin recipes show no credit line.
- **AC-17**: Deleting an account deletes all of that user's submissions and their private photo folder. Their approved recipes stay live with `submitted_by` set to null (AC-16 fallback). Favorites, pins, ratings, and comments on those recipes keep working.
- **AC-18**: The admin can turn "Block from submitting" on or off from any submission's review screen. While it is on, that author's saves fail, and the form shows a neutral "Submitting recipes isn't available for your account". Their existing pending submissions stay in the queue, and turning it off restores saving.
- **AC-19**: A daily job deletes rejected submissions whose `reviewed_at` is over 90 days old, together with their photos. It also deletes `recipe-submission-photos` files over 24 hours old that no pending or rejected submission points to (which covers leftover originals of approved rows).
- **AC-20**: In mocktails only mode (spec 0063), every entry point, My recipes, and the submit and edit routes are hidden on web and mobile. On web the routes redirect to home. Approved non alcoholic community recipes appear in mocktail lists like any other recipe.
- **AC-21**: Signed in users see "Submit a recipe" and "My recipes" in the account menu (web and mobile). Search results end with "Can't find it? Submit your recipe", which also shows on the empty results state. Guests see the same prompt, and it links to sign in.
- **AC-22**: The catalog import, catalog cleanup, merge aliases, hides, custom recipe import, lock, reset, and freshness report steps never create, update, or delete a `source = 'community'` recipe. Fame on arrival (spec 0056) is the one exception, and only for a community recipe whose `fame_score` is empty: it fills `fame_score`, fills `region` only when that is empty too, and sets `updated_at`, and the region rerank that follows may change `popularity_rank`. It never changes any other column, the ingredients, or the tags, and never overwrites a fame score set at review. The admin edits and deletes community recipes through spec 0030 exactly like admin recipes, and an edit never changes `source`, `source_id`, or `submitted_by`.
- **AC-23**: Row level security (Postgres rules on which rows each user can read or write) blocks direct table access. Only the admin can select from `recipe_submissions`, and nobody writes to it directly. Authors read and write only through the author functions, which return their own rows and never `screening_note`, `text_screening`, `photo_screening`, or other users' data. Every admin function checks `is_admin`.
- **AC-24**: Every new UI string exists in all 9 locale message files (web and mobile), with machine drafts allowed for unlaunched locales, following the spec 0045 flow.

## Decision

**Chosen option**: Option 1: Staging table with an admin approval that copies into `recipes`

Submissions live in a new `recipe_submissions` table and a private bucket, screened by a new Haiku Edge Function on the spec 0062 pattern. The admin approves through an Edge Function that copies the photo and then calls one atomic Postgres function that writes a `source = 'community'` recipe credited through `recipes.submitted_by`.

**Implementation skills**: `supabase-postgres-best-practices` (`supabase/agent-skills`, `.agents/skills/supabase-postgres-best-practices/`) · `nextjs-app-router-patterns` (`wshobson/agents`, `.agents/skills/nextjs-app-router-patterns/`) · `react-native-best-practices` (`callstackincubator/agent-skills`, `.agents/skills/react-native-best-practices/`) · `vitest` (`antfu/skills`, `.agents/skills/vitest/`) · `posthog-instrumentation` (`posthog/posthog-for-claude`, `.agents/skills/posthog-instrumentation/`)

## Rationale

Reasoning and options: see [rationale.md](rationale.md).

## Feature design

**Data model sketch**:

`recipe_submissions` (new)

| Column | Type | Null | Rules |
|---|---|---|---|
| `id` | uuid PK | no | default `gen_random_uuid()`; the client may supply it on create so the photo path is known before save |
| `author_id` | uuid FK → `auth.users(id)` on delete cascade | no | always `auth.uid()` inside the save function |
| `status` | text | no | check in (`pending`, `approved`, `rejected`) |
| `locale` | text FK → `supported_locales(code)` | no | set on create, never changed by author edits |
| `name` | text | no | trimmed, 1 to 100 |
| `instructions` | text | no | trimmed, 1 to 2,000 |
| `ingredients` | jsonb | no | array of 1 to 20 `{ "name": text 1..80, "measure": text 1..50 or null }`, checked by an immutable SQL function `recipe_submission_ingredients_valid(jsonb)` |
| `glass` | text | yes | trimmed, 1 to 100 when set |
| `alcoholic_status` | text | no | same check as `recipes.alcoholic_status` |
| `note` | text | yes | trimmed, 1 to 300 when set |
| `photo_path` | text | yes | `<author_id>/<id>-<16 hex>` (flat, one folder per user); the files are `<photo_path>-hero.webp` and `-card.webp`; `save` rejects a path that doesn't start with `auth.uid() || '/' || p_id || '-'` or match the pattern (`invalid_photo`) |
| `text_screening` | text | no | check in (`pending`, `clear`, `flagged`, `error`, `skipped`), default `pending` |
| `photo_screening` | text | yes | same values; null exactly when `photo_path` is null |
| `screening_note` | text | yes | up to 300, admin only |
| `screening_attempts` | smallint | no | default 0 |
| `screening_claimed_at` | timestamptz | yes | lease, as in spec 0062 |
| `rejection_reason` | text | yes | 1 to 500; check: non null exactly when `status = 'rejected'` |
| `approved_recipe_id` | uuid FK → `recipes(id)` on delete set null | yes | check: null unless `status = 'approved'` (an approved row whose recipe was hard deleted keeps `approved` with null; a soft deleted recipe keeps the link and My recipes reads its `deleted_at`) |
| `submitted_at` | timestamptz | no | reset on every save that enters pending |
| `reviewed_at` | timestamptz | yes | set on approve or reject, cleared on resubmit |
| `created_at`, `updated_at` | timestamptz | no | `updated_at` by trigger; it is the optimistic concurrency token for AC-14 |

Indexes: `(status, submitted_at, id)` for the Pending tab, `(status, reviewed_at desc, id desc)` for the Rejected and Approved tabs, `(author_id, submitted_at desc)` for My recipes, a partial index `(submitted_at) where text_screening = 'pending'` for the sweep, and `(reviewed_at) where status = 'rejected'` for retention.

`recipe_submission_usage` (new): `user_id` uuid FK → `auth.users` on delete cascade, `day` date (UTC), `count` int not null. PK (`user_id`, `day`). It is incremented by every save that enters pending. Rows older than 7 days are deleted by the daily job.

`recipe_screening_daily_total` (new): `day` date PK (UTC), `count` int not null. It is reserved atomically before each Haiku check.

`recipes` (changed): the `source` check becomes (`catalog`, `admin`, `community`). New `submitted_by uuid null` FK → `auth.users(id)` on delete set null. Check: `submitted_by is null or source = 'community'`.

`user_preferences` (changed): new `submissions_blocked_at timestamptz null`.

Storage: a new private bucket, `recipe-submission-photos`, that accepts only `image/webp` files up to 2 MB, with names matching `<uuid>/<uuid>-<16 hex>-(hero|card).webp`. There is no update policy: a new photo is a new hash, uploaded fresh, so a screened file can never be swapped in place.

Relationships: user 1:N submissions · submission 0..1 → recipe · recipe N:1 user through `submitted_by` (null after account deletion) · user 1:N usage rows.

**State transitions** (`recipe_submissions.status`):
- (none) → `pending`: the author saves a new submission.
- `pending` → `pending`: the author edits it (new screening, new `submitted_at`).
- `rejected` → `pending`: the author edits and resubmits (reason and `reviewed_at` cleared).
- `pending` → `approved`: the admin approves (terminal; the row becomes read only).
- `pending` → `rejected`: the admin rejects with a reason.
- `pending` or `rejected` → deleted: the author withdraws, the 90 day sweep runs (rejected only), or the account is deleted (any status).

Screening (`text_screening`, `photo_screening`): `pending` → `clear` | `flagged` | `error` (after 3 attempts) | `skipped` (global ceiling reached). Every save that enters pending resets both to `pending` (`photo_screening` to null when there is no photo) and sets attempts to 0.

**API surface**:

All Postgres functions here are `security definer` (like `admin_upsert_recipe`), because the table has no client write policies. Each uses `set search_path = ''`, has `execute` revoked from `anon` and `public`, has every admin function call `is_current_user_admin()` as its first statement, and return explicit error codes (`raise exception using errcode = 'P0001', message = '<code>'`). `packages/shared` maps those codes to typed results, following the project's error return pattern.

| Endpoint | Method | Key inputs | Key outputs | Auth | Key errors |
|---|---|---|---|---|---|
| `save_recipe_submission` | Postgres fn, security definer | `p_id` uuid (req; new or existing), `p_name`, `p_ingredients` jsonb, `p_instructions`, `p_glass`, `p_alcoholic_status`, `p_note`, `p_photo_path` (opt), `p_locale`, `p_display_name` (opt) | `{ id, status, updated_at }` | signed in, `is_anonymous` false in JWT claims | `anonymous`, `blocked`, `display_name_required`, `invalid_<field>`, `pending_cap`, `daily_cap`, `not_editable` (approved, or another user's id) |
| `withdraw_recipe_submission` | Postgres fn, security definer | `p_id` | `{ photo_path }` (the client then removes the files) | owner | `not_found`, `not_editable` |
| `fetch_my_recipe_submissions` | Postgres fn, security definer | `p_cursor` (`submitted_at`, `id`) opt, `p_limit` (default 20, max 50) | rows: id, status, name, photo_path (null when approved), rejection_reason, approved_recipe_id, plus for approved rows the recipe's `name`, `image_url`, and `removed` (recipe missing or `deleted_at` set), submitted_at, reviewed_at, plus `next_cursor` | owner | none |
| `fetch_my_recipe_submission` | Postgres fn, security definer | `p_id` | every author editable field, status, rejection_reason, `updated_at`, plus `needs_display_name` bool and `blocked` bool | owner | `not_found` |
| storage `recipe-submission-photos` | Storage API | upload or remove `<uid>/<submission id>-<hash>-(hero\|card).webp` | | insert: folder 1 = `auth.uid()` and not anonymous; delete: that owner or `is_current_user_admin()`; select: owner or admin; no update policy | 403 |
| `admin_list_recipe_submissions` | Postgres fn, security definer | `p_status`, `p_cursor`, `p_limit` (default 25, max 100) | rows: id, name, author display name, locale, photo_path, both screenings, submitted_at, reviewed_at, plus `next_cursor` | admin | `not_admin` |
| `admin_fetch_recipe_submission` | Postgres fn, security definer | `p_id` | every column, author display name, `author_blocked`, `similar_recipes` (up to 5 `{id, name}` from `search_recipes` on the English name, falling back to the submitted name) | admin | `not_admin`, `not_found` |
| `admin_reject_recipe_submission` | Postgres fn, security definer | `p_id`, `p_reason`, `p_expected_updated_at` | `{ updated_at }` | admin | `not_admin`, `stale`, `invalid_reason` |
| `admin_set_submission_block` | Postgres fn, security definer | `p_submission_id`, `p_blocked` bool | `{ blocked }` | admin | `not_admin`, `not_found` |
| `admin_approve_recipe_submission` | Postgres fn, security definer | `p_submission_id`, `p_expected_updated_at`, `p_recipe_id` (new uuid), the `admin_upsert_recipe` recipe args plus `p_bartender_tip`, `p_image_url` (opt) | `{ recipe_id }` | admin | `not_admin`, `stale`, plus the 0030 validation errors |
| `admin-approve-submission` | Edge Function, POST, `verify_jwt = true` | `{ submission_id, expected_updated_at, keep_photo, recipe }` | `{ recipe_id }` | admin (checked with the caller's own JWT) | 401, 403, 409 `stale`, 422 validation, 502 copy failed |
| `draft-submission-english` | Edge Function, POST, `verify_jwt = true` | `{ submission_id }` | `{ name, instructions, note, ingredients: [{ name, measure }] }` (no write) | admin | 401, 403, 404, 502 model failure |
| `screen-recipe-submission` | Edge Function, POST, `verify_jwt = false` | `{ submission_id }` (trigger) or `{}` (sweep) | `{ screened, flagged, failed, skipped, deferred }` | `apikey` must match a `SUPABASE_SECRET_KEYS` value (spec 0062) | 401 |
| `claim_pending_recipe_submissions`, `reserve_recipe_screening`, `record_recipe_submission_screening` | Postgres fns, security definer | as in spec 0062's photo trio | | service role only | |
| `cleanup-recipe-submissions` | Edge Function, POST, `verify_jwt = false`, daily pg_cron | `{}` or `{ "dryRun": true }` | `{ deletedRejected, deletedOrphanFiles, deletedUsageRows }` | `apikey` secret key | 401 |
| `fetch_recipe_detail` (changed) | Postgres fn | unchanged | adds `submitted_by_name` text null and `is_community` bool | unchanged | unchanged |

`admin-approve-submission` steps, in order:
1. Confirm the caller is admin with their own client.
2. Read the submission with the caller's client and return 409 `stale` early if it is not pending or its `updated_at` differs, before copying anything (the RPC in step 4 remains the authority).
3. Generate `recipe_id`. If `keep_photo` is true and a photo exists, copy both files from `recipe-submission-photos/<photo_path>-*.webp` to `recipe-images/recipes/<recipe_id>/<hash>-*.webp` with the caller's client (the admin storage policies from 0041 and this spec allow it), with a one year cache header.
4. Call `admin_approve_recipe_submission` with the hero public URL.
5. If step 4 fails, remove the copies (the spec 0041 orphan sweep is the backstop).

After a successful approval the function deletes the private originals (allowed by the admin delete policy). The photo path stays on the row only as a record, and author reads return it as null. A failed delete is left for the daily cleanup, which also removes files belonging to approved rows.

For unmatched ingredient names on approval, 0030's behavior applies unchanged: a name with no case and whitespace insensitive match creates a new ingredient. On non English submissions, run Draft English first so new rows get English names.

`admin_approve_recipe_submission` and `admin_upsert_recipe` share one internal function, `_upsert_recipe_core(...)`, which takes `source`, `source_id`, and `submitted_by`. The approve function locks the submission row (`for update`), checks `status = 'pending'` and `updated_at = p_expected_updated_at`, calls the core, sets `bartender_tip` and image fields, then marks the submission approved, all in one transaction.

**Value sourcing**:

| Action | Value produced / displayed | Source |
|---|---|---|
| save | `author_id` | `auth.uid()` |
| save | anonymous check | `auth.jwt() ->> 'is_anonymous'` |
| save | `locale` | `p_locale` from the client's current UI locale, validated by the FK |
| save | pending count (cap 5) | live `count(*)` of the author's `pending` rows with `id <> p_id` (so editing one of 5 still works), under a per user advisory lock so concurrent saves can't both pass |
| save | `locale` on edit | unchanged from the existing row (`p_locale` used only on create) |
| save | daily count (cap 10) | `recipe_submission_usage` row for (`auth.uid()`, `(now() at time zone 'utc')::date`) |
| save | blocked | `user_preferences.submissions_blocked_at is not null` |
| save | needs display name | `user_preferences.display_name is null` |
| form | duplicate warning matches | existing `search_recipes` with the typed name and current locale (limit 10), filtered on the client to results whose localized or English name equals the typed name after the shared normalize (lowercase, strip accents, trim) |
| screening | which version was checked | the `submitted_at` returned by the claim; `record_recipe_submission_screening` takes it and does nothing if the row's `submitted_at` has since changed |
| screening | image sent to Haiku | the hero WebP (the file the public will see) |
| form | ingredient autocomplete | existing `search_ingredients` |
| form | alcoholic status options, glass suggestions | `packages/shared` constants already used by the 0030 admin form |
| screening | per day global count | `recipe_screening_daily_total` (UTC day), ceiling 300 from the `RECIPE_SCREENING_DAILY_CAP` default in the function, overridable by the Edge Function secret |
| screening | model id | `SCREENING_MODEL` secret (spec 0062), default `claude-haiku-5-5` |
| admin list | author display name | `user_display_names` view by `author_id` |
| review | similar recipes | `search_recipes` (English, limit 5) |
| approve | recipe English text | the review form fields (admin edited, optionally from Draft English) |
| approve | `bartender_tip` | review form, prefilled from `note` |
| approve | `image_url`, `image_origin` | the hero public URL from the copy step, `'admin_upload'` |
| approve | `fame_score` | review form field (spec 0056); empty means the next import's fame on arrival fills it |
| detail | `submitted_by_name` | `user_preferences.display_name` of `recipes.submitted_by`, joined live; null when `submitted_by` is null |
| detail | credit text | derived: `is_community` and name → "Submitted by {name}"; `is_community` and null name → the "community member" string |
| My recipes | public recipe link | `approved_recipe_id` → the existing recipe slug and URL helper |
| retention | rejection age | `reviewed_at` |

**Key invariants**:
1. Nothing in `recipe_submissions` or `recipe-submission-photos` is readable by anyone except the author (through author functions or their own storage folder) and the admin. No public read path touches these.
2. Every recipe row with `source = 'community'` came from `admin_approve_recipe_submission`. `submitted_by` is only ever set there and only ever cleared by the FK on account deletion.
3. Status checks hold in the database: `rejection_reason` is set exactly when rejected, and `approved_recipe_id` exactly when approved. Approved rows reject every author write.
4. Caps are enforced inside `save_recipe_submission` under `pg_advisory_xact_lock(hashtext('recipe_submission:' || auth.uid()))`, never only on the client.
5. Screening is advisory. No code path changes `status` from a screening result.
6. Every saved `recipes` row is English. Translations come only from `translate-catalog`, which already picks up new recipes by hash.
7. Import job functions keep filtering `source = 'catalog'`. The one exception is fame on arrival, which may fill an empty `fame_score` (and an empty `region`) on a community recipe, as AC-22 states. Add a regression test that runs import, catalog cleanup, merge aliases, custom import, lock, and reset against a fixture with a community recipe and asserts it is untouched. In the same test, fame on arrival fills only an empty fame score and keeps one set at review.
8. `screening_note` and the screening columns never leave the admin functions. Analytics and Sentry events carry ids only, never recipe text or names. The admin UI renders `screening_note` and all author text as plain text, never as HTML or markdown.
9. The screening trigger fires only when `new.status = 'pending'` and (`tg_op = 'INSERT'` or `new.submitted_at is distinct from old.submitted_at`), so the screening writes themselves never fire it again.
10. A client supplied `p_id` that belongs to another user returns `not_editable`, the same code as an approved row, so it never reveals whether that row exists.

**Security model**:
- Guests and anonymous sessions: nothing (sign in prompt). Execute is revoked from `anon`. The author functions also reject `is_anonymous` JWTs.
- Authors: create, edit, and withdraw their own pending or rejected submissions through author functions, read their own rows without screening fields, and write only in their own storage folder.
- Admin (`user_preferences.is_admin`, checked by `is_current_user_admin()` in every admin function and policy): read all submissions, approve, reject, block, and read all submission photos.
- Service role (Edge Functions and cron): screening and cleanup functions only.
- Table policies: `recipe_submissions` select for admin only, with no insert, update, or delete policies (all writes go through definer functions). Usage and daily total tables have no client policies.
- Personal data: the display name becomes public on approval, which the form states beside the submit button ("Your display name will be shown on the recipe if it's approved"). Account deletion removes submissions and photos (AC-17). The privacy policy page (spec 0012) gains a sentence on submitted recipes and credit, a Follow-up below.
- Rate limits: 5 pending, 10 saves per UTC day per user, 300 screenings per UTC day globally. The admin Edge Functions need no limit (admin only).

**Configuration required**:
- No new secrets. It reuses `ANTHROPIC_API_KEY`, `SENTRY_DSN`, `SCREENING_MODEL`, and the Vault `secret_key` (spec 0041/0062).
- `RECIPE_SCREENING_DAILY_CAP` (optional Edge Function secret): overrides the default 300.
- `supabase/config.toml`: `[functions.screen-recipe-submission] verify_jwt = false`, `[functions.cleanup-recipe-submissions] verify_jwt = false`.
- pg_cron: the screening sweep every 5 minutes, and the cleanup daily at 03:30 UTC, both sending the `secret_key` Vault secret on the `apikey` header.
- PostHog events (no text, ids and flags only): `recipe_submission_saved` `{ is_resubmit, has_photo, locale }`, `recipe_submission_withdrawn`, `recipe_submission_form_opened` `{ entry: 'menu' | 'search' }`.

**Critical test scenarios** (each maps to an acceptance criterion in ## Requirements):
- Happy path: a user submits with a photo, it screens `clear`, the admin adds tags, approves, and the recipe appears in search with "Submitted by Sam" and the photo from `recipe-images`. The submission shows Approved with a link, verifies **AC-1**, **AC-8**, **AC-9**, **AC-11**, **AC-16**.
- Reject loop: the admin rejects with a reason, the author edits and resubmits, and the row is pending again with the reason cleared and a new screening, verifies **AC-6**, **AC-13**.
- Caps: a 6th pending save fails `pending_cap`. Then 10 saves, a withdraw, and an 11th save fails `daily_cap`. Two concurrent saves at 4 pending yield exactly one success, verifies **AC-5**.
- Stale review: the author edits after the admin loads, and approve returns 409 `stale` with no recipe row and no leftover copied files, verifies **AC-14**.
- Non English: a Japanese submission gets Draft English, then is approved. The recipe row is English, and the next `translate-catalog` dry run lists it for every catalog locale, verifies **AC-12**.
- Screening failure: Anthropic returns errors three times, the result becomes `error`, and the admin approves through the "Not screened" warning. With the daily total at 300, a new submission is `skipped` with no model call, verifies **AC-9**, **AC-15**.
- Auth/permission: an anonymous session calling `save_recipe_submission` gets `anonymous`. A signed in non admin selecting from `recipe_submissions` gets zero rows. Calling `admin_approve_recipe_submission` gets `not_admin`. Reading another user's photo path gets 403. `fetch_my_recipe_submission` never returns `screening_note`, verifies **AC-4**, **AC-23**.
- Account deletion: the author of an approved recipe and a pending one deletes their account. The pending row and folder are gone, and the recipe shows "a community member", verifies **AC-17**.
- Import guard: import, catalog cleanup, merge aliases, custom import, lock, and reset leave a community recipe byte for byte unchanged. Fame on arrival fills an empty fame score (region only when empty) and changes nothing else, and it keeps a fame score set at review, verifies **AC-22**.
- Screening race: the author resubmits while a check of the old version is in flight, and the late result is discarded, leaving the new version `pending`, verifies **AC-9**.
- Delete after approval: the admin deletes an approved community recipe, and My recipes shows "Removed from the catalog" with no error, verifies **AC-6**, **AC-22**.
- Mocktails: with mocktails only mode on, the menu items and search prompt are absent, and `/my-recipes/new` redirects home on web, verifies **AC-20**.

## Build plan

Tracer Bullet: slice 1 runs one text only submission through every layer (database, shared, web form, admin review, approval Edge Function, public credit). Later slices thicken it. Mobile follows once the web thread is proven.

1. Migration slice 1, thread: `recipe_submissions` (all columns, checks, indexes), `recipe_submission_usage`, `recipes.source` check plus `submitted_by`, `user_preferences.submissions_blocked_at`, `_upsert_recipe_core` (refactor `admin_upsert_recipe` onto it with no behavior change, proven by the existing 0030 checks), `save_recipe_submission`, `fetch_my_recipe_submissions`, `fetch_my_recipe_submission`, `admin_list_recipe_submissions`, `admin_fetch_recipe_submission`, `admin_approve_recipe_submission`, `fetch_recipe_detail` with `submitted_by_name` and `is_community`, and the policies and grants. Add a rollback and a `supabase/tests/recipe_submissions_check.sql`, then regenerate shared types. Applied by hand in the dashboard. Satisfies **AC-1**, **AC-2**, **AC-3**, **AC-4**, **AC-5**, **AC-11**, **AC-16**, **AC-23**.
2. `packages/shared/src/submissions/`: pure validation (the AC-2 limits, shared by both forms and tested), error code to typed result mapping, query wrappers, and the credit text helper. Satisfies **AC-2**, **AC-3**, **AC-16**.
3. Edge Function `admin-approve-submission`, text only (the photo step comes in task 7). Satisfies **AC-11**.
4. Web thread: `/[locale]/my-recipes` list and `/my-recipes/new` form (no photo yet) with the display name field, the account menu links, `/[locale]/admin/submissions` list and review page reusing the 0030 form with Approve, and the credit line plus JSON-LD `author` on the recipe page. Run one submission end to end on the live project. Satisfies **AC-1**, **AC-3**, **AC-10**, **AC-11**, **AC-16**, **AC-21**.
5. Author lifecycle: edit and resubmit, `withdraw_recipe_submission`, `admin_reject_recipe_submission`, the rejection display, the `stale` handling, and approved rows made read only. Satisfies **AC-6**, **AC-13**, **AC-14**.
6. Form helpers: the duplicate warning, ingredient autocomplete, and the search results and empty state prompt. Satisfies **AC-7**, **AC-21**.
7. Photos, migration slice 2: the private bucket and storage policies, the 0041 crop reused in the form (upload before save, under the client generated submission id), the copy step and private original cleanup in `admin-approve-submission`, and keep or drop on review. Satisfies **AC-8**, **AC-11**.
8. Screening, migration slice 3: `recipe_screening_daily_total`, the claim, reserve, and record functions, the `after insert or update` trigger (fires only when a save puts the row into pending) through `pg_net`, the 5 minute cron, and Edge Function `screen-recipe-submission` with a pure `submission-verdict.ts` plus tests (one Haiku tool call over the text and the card image). Add the badges, note, and "Not screened" warning in review. Satisfies **AC-9**, **AC-15**.
9. Edge Function `draft-submission-english` and the side by side review UI for non English submissions. Satisfies **AC-12**.
10. Safety and lifecycle: `admin_set_submission_block` and its toggle plus the blocked form state, `cleanup-recipe-submissions` with its daily cron (rejected over 90 days, orphan files over 24 hours, old usage rows), `delete-account` removing the user's flat `recipe-submission-photos/<uid>/` folder (the same paged list and remove loop as `removeCommentPhotoFolder`), and the import guard regression test (covering catalog cleanup, merge aliases, and reset as well). Satisfies **AC-17**, **AC-18**, **AC-19**, **AC-22**.
11. Mocktails only mode hiding and redirects on web. Satisfies **AC-20**.
12. Mobile parity: account menu links, the My recipes screen, the submit and edit screen with photo (the same crop rules via the existing mobile image path), the search prompt, the credit line, and mocktails hiding. Admin review stays web only. Satisfies **AC-1**, **AC-3**, **AC-6**, **AC-7**, **AC-8**, **AC-16**, **AC-20**, **AC-21**.
13. Strings in all 9 locales for web and mobile, plus the PostHog events. Satisfies **AC-24**.
14. Confirm end to end on the live project (every Critical test scenario), run the Supabase security advisor, and write `verify.md`. Satisfies **AC-1** to **AC-24**.

## Consequences

**Positive**:
- Unreviewed content can't leak, because it never enters `recipes` and every existing read path stays untouched.
- It reuses proven pieces: the 0030 form and name matching, the 0041 crop and bucket rules, the 0062 screening pattern, and the 0045 translation run. Almost nothing is new infrastructure.
- Authors get a clear loop (status, reason, resubmit) without email or push.

**Negative / tradeoffs**:
- You are the only reviewer. The queue is a standing chore, and the caps only bound it, they don't shrink it.
- Approval copies data, so the submission and the recipe drift as soon as you edit. The submission is a record of what was sent, not a live mirror.
- Three new Edge Functions and two cron jobs to deploy and watch.
- Non English authors see their recipe in a machine translation of your English, not their own words, after approval.
- The credit reads a live display name, so an author who renames to something offensive changes public pages without review (same exposure comments already have).

**Neutral**:
- `admin_upsert_recipe` is refactored onto a shared core. Its behavior must stay identical, so rerun the 0030 checks.
- Approved photos count as `admin_upload`, so the 0041 orphan sweep and the import treat them like your own uploads.
- Community recipes get a fame score only from the review form or the next import's fame on arrival step (spec 0056).

## Follow-up

- [ ] Add a paragraph on submitted recipes, public credit, and deletion to the privacy policy page (spec 0012) before launch.
- [ ] Reporting a published community recipe (reuse spec 0062 `content_reports` with a `recipe` target) is out of scope here. Revisit after launch.
- [ ] Author edits after approval (a revisions flow) and a public author page were declined for v1. Revisit if authors ask.
- [ ] Email or push notification of review results was declined for v1, since the project has no transactional email or push yet.
- [ ] Account wide suspension (spec 0062's follow up) would absorb `submissions_blocked_at`. Merge them when it lands.
