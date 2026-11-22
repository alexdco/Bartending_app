# 0064. User submitted recipes: rationale

Build spec: [index.md](index.md).

## Context

The catalog today has three sources: TheCocktailDB imports (`source = 'catalog'`), recipes you add by hand (`'admin'`, spec 0030), and the custom JSON file in the import job. Users can rate, comment, favorite, and pin, but they can't add a drink the catalog lacks. Scope feature 68 (GA tier) asks for user submissions, reviewed by an admin before they reach the public catalog, with the author credited.

The forces at play:
- **Many read paths.** Search, lists, recommendations, popular, the mocktail views (spec 0063), the sitemap, and the import job (specs 0036, 0056) all read `recipes`. Any of them could expose unreviewed content if pending data sits in reach.
- **One reviewer.** You are the only admin. The queue has to be quick to triage, and abuse has to be bounded in both review time and AI cost. Spec 0034 already showed that cheap accounts get abused.
- **English base, 9 locales.** `recipes` holds English, and `translate-catalog` fills the other locales by a hash of the English. Users write in whatever language the app shows them.
- **Proven patterns already exist.** The 0030 admin form and atomic save, the 0041 image pipeline, the 0062 Haiku screening with trigger, lease, and cron, and the 0063 mocktail rules.
- **Privacy.** A public credit makes a display name public, and account deletion must keep its promise (spec 0008/0012).

The workspace is repo wide: `supabase`, `packages/shared`, `apps/web`, and `apps/mobile`. The build approach is Tracer Bullet (root `AGENTS.md`).

## Options considered

### Option 1: Staging table, copied into `recipes` on approval

Submissions live in `recipe_submissions`, with photos in a private bucket. An admin only approval copies the reviewed version into `recipes` as `source = 'community'`.

**Pros**: no existing read path changes, so there is no leak risk. The admin edits freely before publishing. The submission keeps what the author actually sent.
**Cons**: a copy step, plus the photo moves between buckets. The submission and the recipe diverge after approval.

### Option 2: Pending rows inside `recipes` with a status column

Submissions are ordinary `recipes` rows with `review_status`, hidden by RLS and by filters in every read function until approved.

**Pros**: no copy. The admin form edits the real row directly. One fewer table.
**Cons**: every read function, view, sitemap query, and import step must learn the filter, and many of these are security definer functions that bypass RLS. One miss leaks unreviewed content. Pending ingredient and tag rows also pollute the shared tables before review.

### Option 3: No in app flow, submissions go through a form into the custom recipes file

A plain web form sends you the recipe, and you paste approved ones into `customRecipes.json` for the import job.

**Pros**: almost nothing to build. The import handles everything else.
**Cons**: no status for authors, no credit link, no mobile flow, and it needs a script run per recipe. It doesn't meet the scope's "approved recipes appear with the author credited".

## Rationale

Option 1 wins on the leak force. With many read paths, several of them security definer, isolation by construction beats a filter you must remember in dozens of places. It also fits the one reviewer force: the review form is the 0030 form you already use, so fixing a typo is an edit, not a reject and resubmit round trip. The copy cost is small because `admin_upsert_recipe` already does the multi table save, and a shared `_upsert_recipe_core` lets approval reuse it exactly.

The smaller calls follow the same forces. Screening reuses the 0062 trigger, lease, and cron shape because it already survives outages in production, and it stays advisory because you review everything anyway and a false positive auto rejection would hit real users. Caps live in the database under an advisory lock, and the daily count lives in a counter table, because withdraw would otherwise reset a row count (the spec 0034 lesson). Approved recipes are translated from your reviewed English rather than keeping the author's original row: the hash gate in `catalogTranslation.ts` would otherwise overwrite it, and your fixes would never reach it. The photo copy runs in an Edge Function rather than the admin's browser so a closed tab can't leave half an approval.

**Calls made without asking** (pick, why, runner up):
- **Author access through security definer functions, table select for admin only.** This hides the screening columns without column grants or a second table. Runner up: a separate admin only `recipe_submission_screening` table.
- **`image_origin = 'admin_upload'` for approved photos.** The import and the 0041 orphan sweep already protect it. Runner up: a new `community_upload` value, which would need a check change and sweep updates for no behavior difference.
- **`source_id = 'community-<submission id>'`.** It mirrors 0030's `admin-<uuid>` and traces back to the submission. Runner up: a fresh uuid.
- **UTC days for the caps.** Simple and the same for everyone. Runner up: the user's local day, which needs a timezone source and gains nothing for an abuse limit.
- **The approval Edge Function uses the admin's own JWT for both storage and RPC.** No service role key in a user facing function. Runner up: a service role client for the copy.
- **Admin review on web only.** It matches spec 0028/0030 and keeps mobile simple.
- **The screening trigger fires on insert or update into pending.** It covers resubmits without a second trigger.
