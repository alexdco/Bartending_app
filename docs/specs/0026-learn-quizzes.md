# 0026. Learn quizzes

**Date**: 2026-09-30
**Status**: In Progress

## Summary

This adds quizzes to the app: short multiple choice or true/false tests a user can take on either a Learn category (spec 0025's articles) or a group of recipes (by tag or region). Questions are AI drafted the same way Learn articles are, reviewed and published by hand, then read only by both apps. A user's best score per quiz is remembered, tied to their session whether they are signed in or a guest.

## Context

The app teaches through Learn (spec 0025) and lets a user browse recipes, but there is no way to check whether any of it stuck. Scope feature 29 names this gap directly: a user can read an article or browse a region's popular drinks, but has no way to test that knowledge back. The original scope note also flagged two decisions this spec exists to resolve: the quiz and question schema, including how questions are written, and the scoring and attempt model (retakes, history, pass or fail versus a raw score).

The team is one person with no content team, the same constraint spec 0025 built around. Any quiz content has to be cheap to produce (AI drafted, reviewed by hand) rather than assuming an authoring team that does not exist. The project also already has two working precedents for exactly this shape of AI assisted, hand reviewed content pipeline (spec 0020's translations, spec 0022's ingredient classification, and now spec 0025's articles), so a quiz pipeline should look like a third instance of the same pattern, not a new one.

Two source shapes are in scope: Learn category quizzes, and recipe quizzes grouped by tag or region (spec 0010 already curates recipes this way, so quizzes can draw on groupings that already exist rather than inventing new ones). Per recipe quizzes are explicitly out of scope: with around 427 recipes today, a quiz per recipe is unmanageable content volume for a single owner.

## Requirements

**User stories**:
- As a home bartender, I want to take a short quiz on a Learn topic or a recipe grouping, so that I can check what I actually retained.
- As a home bartender, I want my best score remembered, so that retaking a quiz feels like a chance to improve, not starting from zero.
- As the app owner, I want to generate quiz questions from existing content with one command, so that populating quizzes costs about as much effort as writing a Learn article.

**Acceptance criteria**:
- **AC-1**: A user can find and open a `published` quiz from three places: a dedicated Quizzes index listing every published quiz, a link on its Learn category page (when a quiz exists for that category), and a link on its recipe tag or region page (when a quiz exists for that grouping). When no quiz exists for a given category, tag, or region, no link renders there (no placeholder, no dead link).
- **AC-2**: Opening a quiz shows its fixed list of questions (5 to 8), each with either 4 options (multiple choice) or 2 options (true/false), in a fixed display order; the same quiz shows the same questions every time it is opened.
- **AC-3**: The submit action stays disabled until every question in the quiz has a selected option; a user cannot submit a partially answered quiz.
- **AC-4**: Submitting a completed quiz scores it (count of correct answers out of total, shown as `score/total`, e.g. `6/8`; there is no pass or fail threshold) and shows a result screen: the score, then each question with the user's answer, the correct answer, and its explanation text.
- **AC-5**: A user's score for a quiz is saved per user (or guest session) and quiz; retaking a quiz that already has a saved score only overwrites it if the new attempt scores higher (the best score is kept, not the latest). The quiz detail screen and the Quizzes index both show the caller's saved best score for a quiz next to it, when one exists. If the caller has no session yet (a first time guest), one is created the same way `favorites`/`pantry_items` already do (the existing `ensureAnonymousSession` helper) before the attempt is submitted; if session creation fails, the result screen still renders the score but shows a non blocking notice that it could not be saved.
- **AC-6**: A `draft` or `archived` quiz (or its questions) is never visible to a user: not on the Quizzes index, not linked from Learn or recipe pages, and not reachable by its detail URL (renders not found).
- **AC-7**: Quizzes are fully public: a guest with no signed in session can browse, take, and have their score remembered for any quiz, same as every other guest facing feature in the app.
- **AC-8**: Running the Learn category quiz generation script with a `learn_category` value creates one new `quizzes` row with `status = 'draft'`, plus 5 to 8 `quiz_questions` rows, generated from that category's published Learn articles.
- **AC-9**: Running the recipe quiz generation script with a tag or region value creates one new `quizzes` row with `status = 'draft'`, plus 5 to 8 `quiz_questions` rows, generated from the real ingredient, glassware, and tag or region data of recipes in that grouping.
- **AC-10**: Running either generation script twice for the same source creates two separate draft quizzes (no dedupe), matching spec 0025's article generation behavior; nothing is silently skipped or overwritten.
- **AC-11**: A quiz only becomes visible to users after its `status` is changed to `published` directly in the database (Supabase Studio or SQL); there is no in app publish action.

## Options considered

### Option 1: Own quizzes/quiz_questions/quiz_attempts tables, AI drafted, Studio reviewed (recommended)

Three new tables (below). Generation is two small scripts mirroring `generate-learn-article.ts`, one per source type. Review and publish happen by hand in Supabase Studio, exactly like Learn articles.

**Pros**:
- Reuses the exact pipeline the team already trusts and operates (spec 0025, spec 0020, spec 0022): generate as a draft, review by hand, flip a status column.
- A single `quizzes` table with a `source_type`/`source_ref` pair serves both Learn and recipe quizzes without duplicating schema, RLS, or fetch code for two things that behave identically once published.
- No new authoring UI, no new auth surface: the same service role script pattern already covers writes.

**Cons**:
- `source_ref` is a loosely typed pointer (no foreign key into `learn_articles`, `tags`, or the region column), so a stale or mistyped reference is only caught at read time, not by the database.
- Two generation scripts (one per source type) instead of one, since a Learn category and a recipe grouping pull from genuinely different source data.

### Option 2: Fold quizzes into learn_articles as a new article "type"

Add a `content_type` (`article` | `quiz`) column to the existing `learn_articles` table, storing quiz questions as a `jsonb` column on the same row, skipping new tables entirely.

**Pros**:
- No new tables, one less migration, one less RLS policy set to write and audit.
- Reuses the existing article fetch and generation code paths almost as is for the Learn category quiz case.

**Cons**:
- Recipe quizzes have no article to attach to; this option only fits the Learn category half of the requirement, forcing a second, incompatible modeling for recipe quizzes anyway, which defeats the point of avoiding new tables.
- Storing structured questions and per attempt scoring in `jsonb` on a table designed for prose loses the ability to query, index, or constrain question shape at the database level, and mixes two very different content shapes (an article body, a graded question set) in one table.

### Option 3: Third party quiz or LMS service

Use an external quiz platform or embed, rather than building the schema and UI in house.

**Pros**:
- Potentially richer quiz authoring tools (question banks, analytics) than a bespoke build.

**Cons**:
- Introduces a new vendor, new auth or embed integration, and a new data residency question for what is a small, low volume feature; nothing else in the app pulls in a third party content platform.
- Guest support (AC-7) is central to this app's whole design; most quiz platforms assume a registered user model, working against the anonymous session pattern already used everywhere else (pantry, favorites, Learn).

## Decision

**Chosen option**: Option 1: Own quizzes/quiz_questions/quiz_attempts tables, AI drafted, Studio reviewed

Three new tables, generated by two small offline scripts mirroring the existing Haiku pipeline, reviewed and published by hand in Supabase Studio.

## Rationale

The project's whole content strategy so far rests on one proven shape: generate cheaply with Haiku, review by hand, publish by flipping a status column (spec 0020, spec 0022, spec 0025). Quizzes are the same shape of problem, a small amount of structured content a single owner needs to produce and vet, so reusing the pipeline costs almost nothing and behaves exactly as the owner already expects.

Option 2 saves a migration but only actually fits half the requirement: recipe quizzes have no article row to live on, so it would still need a second modeling path, undermining its own justification. It would also mix prose and structured, gradable question data in one table and column, which fights the natural shape of the data more than it saves. Option 3 solves a problem this project does not have (a need for rich third party quiz tooling) at the cost of a new vendor and an auth model that likely does not support guests, the one thing every existing feature here treats as non negotiable.

## Feature design

**Data model sketch**:

`quizzes` (no foreign keys; `source_ref` is a plain identifier, not an FK, since it points at different id shapes depending on `source_type`):

| Field | Type | Nullable | Notes |
|---|---|---|---|
| `id` | uuid | not null (PK) | `default gen_random_uuid()` |
| `title` | text | not null | |
| `source_type` | enum (`learn_category`, `recipe_tag`, `recipe_region`) | not null | which kind of grouping this quiz was generated from |
| `source_ref` | text | not null | the `learn_articles.category` value, the `tags.id`, or the region value, depending on `source_type` |
| `status` | enum (`draft`, `published`, `archived`) | not null, default `draft` | controls visibility, same three states as `learn_articles` |
| `created_at` | timestamptz | not null, default `now()` | |
| `updated_at` | timestamptz | not null, default `now()` | maintained by the existing `set_updated_at` trigger function |
| `published_at` | timestamptz | nullable | set the first time `status` moves to `published`, same trigger pattern as spec 0025 |

`quiz_questions` (1:N from `quizzes`, FK `quiz_id`):

| Field | Type | Nullable | Notes |
|---|---|---|---|
| `id` | uuid | not null (PK) | `default gen_random_uuid()` |
| `quiz_id` | uuid | not null (FK to `quizzes.id`, `on delete cascade`) | |
| `question_type` | enum (`multiple_choice`, `true_false`) | not null | |
| `prompt` | text | not null | the question text |
| `options` | jsonb | not null | array of option strings; 4 for `multiple_choice`, 2 (`True`/`False`) for `true_false` |
| `correct_option_index` | integer | not null | index into `options` |
| `explanation` | text | nullable | shown on the result screen after answering |
| `sort_order` | integer | not null | fixed display order within the quiz |

`quiz_attempts` (1:N from `quizzes` and from `auth.users`, FK `quiz_id` and `user_id`; unique on `(quiz_id, user_id)` so "best score kept" is an upsert, not a growing history):

| Field | Type | Nullable | Notes |
|---|---|---|---|
| `id` | uuid | not null (PK) | `default gen_random_uuid()` |
| `quiz_id` | uuid | not null (FK to `quizzes.id`, `on delete cascade`) | |
| `user_id` | uuid | not null (FK to `auth.users.id`) | the session's id, anonymous or linked, same pattern as `favorites`/`pantry_items` |
| `score` | integer | not null | count of correct answers |
| `total` | integer | not null | total question count at time of attempt |
| `completed_at` | timestamptz | not null, default `now()` | updated on every attempt that beats the saved score |

Unique constraint `(quiz_id, user_id)` on `quiz_attempts`; a new attempt is an `insert ... on conflict (quiz_id, user_id) do update ... where excluded.score > quiz_attempts.score`, so a lower or equal retake is silently a no op on the stored row (AC-5).

**State transitions**:

`quizzes.status`: `draft` → `published` → `archived` (and back), all transitions made manually by editing the row; no in app trigger for any transition, same as `learn_articles`.

**API surface**:

| Endpoint | Method | Key inputs | Key outputs | Auth | Key errors |
|---|---|---|---|---|---|
| `quizzes` (PostgREST, list) | GET | `status=eq.published` | `id`, `title`, `source_type`, `source_ref` | public (RLS scoped) | empty array if none |
| `quizzes` + `quiz_questions` (PostgREST, detail) | GET | `id` (eq filter), `status=eq.published` | quiz fields, plus its questions ordered by `sort_order, id` (`prompt`, `options`, `question_type`, `correct_option_index`, `explanation`; all fields ship together, see Security model for why) | public (RLS scoped) | empty result → render not found |
| `quizzes` (PostgREST, lookup by source) | GET | `source_type` (eq filter), `source_ref` (eq filter), `status=eq.published`, `order=published_at.desc`, `limit=1` | the single most recently published quiz for that source, or none | public (RLS scoped) | no match → no link renders (AC-1); never use a `.single()`-style call that errors on more than one row, since AC-10 allows more than one draft/published quiz to exist for the same source over time |
| `quiz_attempts` (PostgREST, upsert) | POST (upsert) | `quiz_id`, `score`, `total` (`0 <= score <= total`, `total > 0`, enforced by check constraint) | the saved row (`score`, `completed_at`); unchanged if the new `score` does not beat the existing saved one | session required (anonymous or linked, auto created via `ensureAnonymousSession` if missing) | no session and session creation fails → save fails, result screen shows a non blocking notice; `quiz_id` not published → RLS denies; out of range `score`/`total` → constraint violation |
| `quiz_attempts` (PostgREST, read own) | GET | `quiz_id` (eq filter) | `score`, `total`, `completed_at` for the caller's own row | session required | none found → no saved score yet, first attempt |

No dedicated Postgres function needed: every read here is a plain filtered table read (or a simple upsert), unlike search or recommendations which need ranking logic.

**Value sourcing**:

| Action | Value produced / displayed | Source |
|---|---|---|
| Quizzes index (AC-1) | which quizzes to list | `quizzes` rows where `status = 'published'`, no fixed placeholder list (unlike Learn's 5 fixed categories, quizzes have no guaranteed non empty set) |
| Learn category page / recipe tag or region page (AC-1) | whether to render a quiz link | the "lookup by source" call above (`order=published_at.desc, limit=1`) against `source_type`/`source_ref` matching the current category/tag/region and `status = 'published'`; no match means no link renders |
| Quiz detail (AC-2) | which quiz and questions to show | the `id` parsed from the quiz's URL slug on web (same `slugify(title) + '-' + id`/`extractIdFromRecipeSlug`-style helper as spec 0025 and spec 0011); mobile navigates by bare `id`, no slug, same split spec 0025 already made for its own detail screens, since mobile has no public URL/indexing need. Filtered to `status = 'published'`; questions ordered by `sort_order, id` (the `id` tiebreak guards against a future duplicate `sort_order`, on top of the unique constraint below) |
| Quiz detail / index (AC-5) | the caller's saved best score, if any | the `quiz_attempts` "read own" endpoint, `quiz_id` + `auth.uid()` (via RLS); no row found means no attempt yet, rendered as no score shown, not an error |
| Quiz submit (AC-5) | the session used to save the attempt | the existing `ensureAnonymousSession` helper (used today by pantry/favorites), called before the upsert if no session exists yet; on failure the result screen still shows the computed score with a non blocking "not saved" notice |
| Result screen (AC-4) | the score | computed client side by comparing the user's selected option index per question against `correct_option_index`, then written via the `quiz_attempts` upsert; the server does not grade, since `correct_option_index` must reach the client to check the user's answer, so there is no untrusted grading step to protect against, only a low value incentive to peek before answering |
| Result screen (AC-4) | per question review (user's answer, correct answer, explanation) | the client's already held answers array plus each question's `correct_option_index` and `explanation` |
| Best score persistence (AC-5) | whether to overwrite the saved score | the `insert ... on conflict ... where excluded.score > quiz_attempts.score` upsert condition, not application logic, so a concurrent or repeated submit cannot race past a better saved score |
| Generation script, Learn category (AC-8) | `title`, `source_ref` (the category) | CLI argument passed by the owner; the script first counts `published` `learn_articles` rows in that category and exits non zero with no insert if zero are found, before any Haiku call |
| Generation script, Learn category (AC-8) | questions | the category's `published` `learn_articles` rows' `body_markdown`, passed as Haiku context, via `messages.parse()` with a zod schema (`.min(5).max(8)` questions; mirrors `ingredientClassification.ts`); a schema validation failure (wrong count, malformed shape) aborts the script with no insert, not a partial quiz |
| Generation script, recipe grouping (AC-9) | `title`, `source_ref` (the tag id or region value) | CLI argument passed by the owner; the script first counts matching recipes for that tag id or region value and exits non zero with no insert if zero are found, before any Haiku call |
| Generation script, recipe grouping (AC-9) | questions | a batch of the grouping's recipes' `recipe_ingredients`, `tags`, and (for regions) the region column, read via the service role client and passed as Haiku context; same `.min(5).max(8)` zod schema and abort-on-failure rule as above |
| Generation script, both (AC-2, AC-8, AC-9) | `sort_order` per question | the zero based index of the question in the Haiku-returned array, assigned at insert time, not supplied by Haiku |

**Key invariants**:
- A `quizzes` row is visible to any client read only when `status = 'published'`; enforced by RLS. A `quiz_questions` row is visible only when its parent `quizzes` row is `published`; enforced by an RLS policy using `exists (select 1 from quizzes where quizzes.id = quiz_questions.quiz_id and quizzes.status = 'published')`, not a blanket `using (true)` (a blanket policy would leak draft questions even though the parent quiz correctly hides).
- `quiz_attempts` has exactly one row per `(quiz_id, user_id)`; enforced by a unique constraint, and only ever updated to a higher `score`, enforced by the upsert's `where` clause, not application logic alone.
- `quiz_attempts.score`/`total` always satisfy `score >= 0 and total > 0 and score <= total`; enforced by a check constraint, since both are client supplied (grading is client side) and an out of range value would otherwise permanently lock in an unbeatable "best score" under the upsert rule above.
- `(quiz_id, sort_order)` is unique on `quiz_questions`; enforced by a unique constraint, so "the same fixed order every time" (AC-2) cannot flake from a duplicate or tied value.
- `options` always has exactly 2 entries for `true_false` and exactly 4 for `multiple_choice`; enforced by a check constraint on `quiz_questions` (`jsonb_array_length(options)`).
- `correct_option_index` is always a valid index into `options` (`0` to `jsonb_array_length(options) - 1`); enforced by a check constraint.
- `published_at` is set automatically by a `BEFORE UPDATE` trigger the first time `status` moves to `published` (only when still `null`), the same pattern spec 0025 uses, so a forgotten manual edit never leaves a published row with a null `published_at`. Re-publishing an `archived` quiz keeps its original `published_at` (the trigger only fires while it is still `null`), so the date reflects first publication, not the most recent republish, matching spec 0025's own semantics.
- A published quiz's questions (and their count) should only be edited while it is `draft` or `archived`, never while `published`; editing a live quiz's question count invalidates any saved `quiz_attempts.total` that predates the change (a saved "best" score becomes incomparable to the new max), and there is no automated reconciliation for this, it is a manual discipline the owner follows.

**Security model**:
- Public read: anyone, including a guest with no Supabase session, can `select` `quizzes` and `quiz_questions` rows where the parent quiz's `status = 'published'`. Matches `learn_articles`' public read RLS shape.
- `quiz_attempts` is scoped to the caller: RLS restricts `select`/`insert`/`update` to rows where `user_id = auth.uid()`, so a user only ever sees or writes their own attempt, guest or signed in, the same shape as `favorites` and `pantry_items`.
- No client write to `quizzes`/`quiz_questions`: no `insert`/`update`/`delete` RLS policy for any client reachable role. The generation scripts and any manual edit use the service role key, same as Learn articles.
- `correct_option_index` and `explanation` are readable by any client that can read a published question at all (see Value sourcing above for why grading is client side); this is acceptable since nothing gates real access on a quiz score, it is a low stakes learning aid, not an assessment with consequences.

**Configuration required**:
- No new environment variables: both generation scripts reuse the existing `ANTHROPIC_API_KEY` and `SUPABASE_SERVICE_ROLE_KEY` pattern already required by `generate-learn-article.ts`/`classify-ingredients.ts`.

**Critical test scenarios**:
- Happy path: a guest opens the Quizzes index, takes a published quiz, submits after answering every question, and sees a scored result with per question review, verifies **AC-1**, **AC-2**, **AC-3**, **AC-4**, **AC-7**.
- Failure case: a user navigates directly to a `draft` quiz's URL and gets a not found state, not the content, verifies **AC-6**.
- Retake case: a user retakes a quiz they already scored, submitting a lower score; the saved `quiz_attempts` row keeps the original higher score, verifies **AC-5**.
- Generation: running either generation script twice with the same source produces two distinct draft quizzes, neither overwriting the other, verifies **AC-8**, **AC-9**, **AC-10**.

## Build plan

Per the project's Tracer Bullet approach (root `AGENTS.md`), this ships as one thin end to end thread (schema, one real generated quiz of each source type, both apps reading and taking it) before adding any polish.

1. Migration: `quizzes`, `quiz_questions`, `quiz_attempts` tables (all columns and constraints above, including the `exists`-based `quiz_questions` policy, the `score`/`total` check constraint, and the `(quiz_id, sort_order)` unique constraint), the public read published RLS policy for `quizzes`/`quiz_questions`, the caller scoped RLS policy for `quiz_attempts`, and the `published_at` trigger, satisfies **AC-6**, **AC-7**, **AC-11**
2. Regenerate shared TypeScript types (`packages/shared/src/database.types.ts`) from the live schema, satisfies **AC-1** through **AC-11** (typed reads/writes)
3. Generation script `packages/shared/scripts/generate-learn-category-quiz.ts`: CLI arg for the Learn category, aborts with no insert if the category has zero published articles, otherwise reads those articles, Haiku call via `messages.parse()` with a zod schema (`.min(5).max(8)` questions, mixed multiple choice/true false, options/correct index/explanation; a schema failure aborts with no insert), assigns `sort_order` by array index at insert time, inserts a `draft` quiz plus its questions, satisfies **AC-8**, **AC-10**
4. Generation script `packages/shared/scripts/generate-recipe-quiz.ts`: CLI args for tag id or region value, aborts with no insert if the grouping matches zero recipes, otherwise reads that grouping's recipes' ingredients/glassware/tags via the service role client, same Haiku structured output call and abort-on-failure rule, assigns `sort_order` the same way, inserts a `draft` quiz plus its questions, satisfies **AC-9**, **AC-10**
5. Shared `packages/shared/src/quizzes.ts`: fetch functions for the quizzes index, the quiz-by-source lookup (ordered `published_at desc, limit 1`, for the Learn/tag/region link), the quiz detail read (quiz plus questions ordered `sort_order, id`), and the `quiz_attempts` upsert (calling `ensureAnonymousSession` first if no session exists) plus read-own-score functions, plus the slug helper reusing `packages/shared/src/seo.ts`'s pattern, satisfies **AC-1** through **AC-7**
6. Web: `Quizzes` nav entry; `apps/web/src/app/[locale]/quizzes/page.tsx` (index, showing each quiz's saved best score if any), `apps/web/src/app/[locale]/quizzes/[slug]/page.tsx` (take quiz, submit, result screen with score/total and per question review), plus a quiz link added to the existing Learn category page and Popular by region / tag pages when a match exists, satisfies **AC-1** through **AC-7**
7. Mobile: `Quizzes` tab entry; `apps/mobile/src/app/quizzes/index.tsx` (index, same best score display), `apps/mobile/src/app/quizzes/[id].tsx` (take quiz by bare id, no slug, submit, result screen), plus the same conditional quiz link on the Learn category screen and the Popular screen, satisfies **AC-1** through **AC-7**
8. Run both generation scripts for one real quiz each (one Learn category, one recipe grouping), review and publish manually in Supabase Studio, confirm both render and score correctly on both apps, satisfies **AC-1** through **AC-11** end to end

## Consequences

**Positive**:
- Closes the loop scope feature 29 named: a user can now check retention, not just consume content.
- Reuses a pipeline the owner already trusts and operates (spec 0020, spec 0022, spec 0025), so quiz content costs about the same to produce as an article.
- The best score kept model gives a low stakes, encouraging way to revisit a quiz without punishing an off day.

**Negative / tradeoffs**:
- `source_ref` has no foreign key, so a quiz generated against a category, tag, or region that is later renamed or removed silently stops matching; the owner has to notice and manually archive it (same manual model as Learn articles, just an added surface to watch).
- Grading is client side (the correct answer ships to the client before submit), which is fine for a low stakes learning quiz but would need rework if quizzes ever gained real stakes (certification, unlocking content).
- Every quiz needs a manual publish step, same limitation spec 0025 already accepted for articles; there is no way to schedule or batch publish from inside the app.

**Neutral**:
- Two generation scripts instead of one, since Learn category and recipe grouping quizzes pull from genuinely different source tables.
- `quiz_attempts` is the first table in the app keyed on `(resource_id, user_id)` with an upsert-if-better semantics; `favorites`/`pantry_items` are plain membership rows, so this is a new but small pattern to learn.

## Follow-up

- [ ] Per recipe quizzes (one quiz per individual recipe) were explicitly scoped out here given the ~427 recipe catalog size; revisit only if tag/region grouped quizzes prove too coarse in practice.
- [ ] If Learn quizzes should support Spanish (matching spec 0020), add `quiz_translations`/`quiz_question_translations` tables later, mirroring `recipe_translations`; deferred here since quiz content itself is new and unproven.
- [ ] If a quiz's source category, tag, or region is renamed or removed, its `source_ref` silently stops matching; no automated check flags this today, the owner must notice and archive it by hand.
- [ ] Editing a published quiz's question count invalidates any saved `quiz_attempts.total` that predates the change; no automated reconciliation exists (see Key invariants), the owner should only edit question counts on a `draft`/`archived` quiz.
