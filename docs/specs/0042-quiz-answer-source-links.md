# 0042. Quiz answer source links

**Date**: 2026-10-27
**Status**: In Progress

## Summary

On the quiz result screen, every question's explanation now links to the Learn article or recipe where its answer lives. The link sits inside the explanation text itself (for example, "Moscow Mule" in the explanation becomes a link), so a user who wants to learn more is one tap away from the source. Each question stores which article or recipe it came from plus the exact phrase to turn into a link. Both generation scripts now produce these, and a one off script fills them in for the 7 quizzes that already exist. This extends [spec 0026](0026-learn-quizzes.md) and does not replace it.

## Context

Spec 0026 shipped quizzes whose result screen shows, per question, the user's answer, whether it was right, and a short AI written explanation. The explanation names the drink or topic ("A Moscow Mule is traditionally served in a Copper Mug") but gives the user nowhere to go next. The content that holds the answer already exists in the app, as a published Learn article or a recipe page. Today the user has to leave the quiz and search for it by hand, so the quiz ends the learning loop instead of feeding back into it.

The quiz data has no record of where each question came from. `quizzes.source_type`/`source_ref` say which grouping a quiz was drawn from (a Learn category, a recipe tag, a region), but not which article or recipe within that grouping answers a given question. The generation scripts hand Haiku the whole grouping as one block of text and keep only the question, options, answer and explanation. Any link therefore needs new per question data, a change to both generation scripts, and a way to fill in the questions that already exist: 7 quizzes (2 published, 5 drafts), about 54 questions, all generated before this change.

Some constraints carry over from spec 0026 and the rest of the app. Content is AI drafted and reviewed by hand in Supabase Studio, with no authoring UI. Quizzes are public to guests. Grading happens on the client, and the result screen is the only place answers are revealed. The web app is localized (en/es) through `next-intl`, while quiz content itself stays English. Mobile uses Expo Router with `/learn/[category]/[id]` and `/recipe/[id]` screens. Web uses `buildLearnArticleSlugPath` and `buildRecipeSlugPath` from `packages/shared/src/seo.ts`. The live project already hides unpublished articles (`learn_articles_select`: `status = 'published'`) and soft deleted recipes (`recipes_select`: `deleted_at is null`) through RLS (row level security, the Postgres rules that decide which rows a caller can see).

The web result screen has one more catch. It lives in component state in `apps/web/src/quizzes/quiz-player.tsx`. Following a link and pressing Back remounts the page, which throws away the result and shows a blank quiz. A link that costs the user their result screen would discourage people from using the link at all.

## Requirements

**User stories**:
- As a home bartender, I want each quiz answer to link to the article or recipe it came from, so that I can read more about anything I got wrong (or right) without searching for it.
- As a home bartender, I want to come back to my quiz result after following a link, so that checking one answer does not cost me the rest of my review.
- As the app owner, I want generated questions to carry their source automatically, so that links cost no extra hand work beyond the review I already do.

**Acceptance criteria**:
- **AC-1**: On the quiz result screen (web and mobile), for every question with a viewable source, the stored anchor phrase inside the explanation renders as a link to that source. A Learn article opens its article page (web: the locale aware `/learn/<category>/<slug>` path; mobile: `/learn/<category>/<id>`). A recipe opens its recipe page (web: the locale aware `/recipes/<slug>` path; mobile: `/recipe/<id>`). The anchor is matched case insensitively at its first occurrence. The linked text keeps the explanation's own casing, and the text around it is unchanged.
- **AC-2**: When a question has a viewable source but its anchor is null, empty, or not found in the explanation (or the explanation is null), the explanation renders as plain text and a separate line under it reads `Read more: <name>` (Spanish: `Más información: <name>`), where `<name>` is the article title or recipe name and is the link (only the name is linked, not the label). Web shows the label in the page locale. Mobile shows the English label, matching the rest of the mobile quiz screen, which is not localized today.
- **AC-3**: When a question has no source, or its source is not viewable (article not `published`, recipe soft deleted), the explanation renders exactly as it does today: plain text, no link, no "Read more" line, no notice.
- **AC-4**: Links render on every question's review card whether the user's answer was correct or not, and only on the result screen. Nothing about the source (link, name, anchor) is shown while the quiz is being answered.
- **AC-5**: After submitting, a user who follows a source link and then goes Back (browser Back on web, the back gesture or button on mobile) sees the same result screen: the same score, the same per question answers, the same links. They do not see a fresh, unanswered quiz. This holds for both link targets on mobile, including a Learn article, which lives in a different tab. The answering form never flashes before the kept result appears. The result screen offers a "Take again" action (web Spanish: "Intentar de nuevo"; mobile English only) that clears the kept result and shows the unanswered quiz.
- **AC-6**: Running the Learn category generation script produces, for every question, a source article drawn from that category's published articles plus an anchor phrase that appears in that question's explanation. If any question comes back with no source, an out of range source, an empty explanation, or an anchor not found in its explanation, the script aborts with no insert (no partial quiz), the same rule as the existing 5 to 8 count check.
- **AC-7**: Running the recipe quiz generation script produces, for every question, a source recipe drawn from that tag or region grouping's recipes plus an anchor phrase that appears in that question's explanation, with the same abort with no insert rule as AC-6.
- **AC-8**: Running the backfill script with no flags prints, for every question in every quiz (draft, published, and archived), the proposed source (kind and name, or "none"), the proposed anchor, and whether the anchor was found in the explanation. It saves that proposal to a plan file and writes nothing to the database. Running it with `--apply <plan file>` writes exactly the reviewed plan, with no new Haiku call. Every proposed source comes from that quiz's own grouping. A question with no fitting source is left with no source (not forced onto a wrong one). Questions that already have a source are skipped. A quiz whose grouping has no remaining articles or recipes is skipped and reported. An anchor that cannot be found in the existing explanation is written as null (the question then falls back to AC-2). The script never changes a question's prompt, options, correct answer, or explanation.
- **AC-9**: Tapping or clicking a source link (inline or "Read more") sends one `quiz_source_link_clicked` analytics event with `quiz_id`, `question_id`, `target_kind` (`article` or `recipe`), and `was_correct`, through the existing consent gated `track` helper on each app (`apps/web/src/analytics/posthog-client.ts`, `apps/mobile/src/analytics/posthog-client.ts`), fired on press before navigating. No event is sent when the user has not given analytics consent.
- **AC-10**: A question can never reference both an article and a recipe (the database rejects it). Deleting a referenced article or recipe row clears that reference to null and never deletes the question.

## Options considered

### Option 1: Two nullable foreign keys plus a stored anchor on `quiz_questions` (recommended)

Add `source_article_id` (FK to `learn_articles`), `source_recipe_id` (FK to `recipes`) and `source_anchor` (text) to `quiz_questions`, with a check that at most one FK is set. Haiku picks the source by its number in a numbered list in the prompt, and the script maps that number to the real id. The client embeds the source row in the existing quiz detail read, so RLS hides dead targets for free.

**Pros**:
- Real referential integrity: a mistyped id cannot be stored, and a deleted target nulls itself out.
- RLS on `learn_articles` and `recipes` already decides "viewable". The embedded join returns null for a draft article or a soft deleted recipe, so AC-3 needs no extra code.
- The anchor lives in its own column, so the explanation text stays clean prose, and you can fix a bad anchor in Studio without touching the explanation.

**Cons**:
- Two columns where one conceptual "source" exists, plus a check constraint to keep them exclusive.
- Exactly one link per question. A comparison question drawing on two recipes can only point at one of them.

### Option 2: Loose `source_kind` + `source_id` text pair

Mirror `quizzes.source_type`/`source_ref`: a `source_kind` enum (`article` | `recipe`) and a plain text id, no foreign key.

**Pros**:
- One pattern already used in this schema, so it is familiar.
- One logical column pair, easy to extend to a third kind later.

**Cons**:
- No referential integrity. A stale or mistyped id is only caught at render time, the same weakness spec 0026 already listed as a tradeoff for `source_ref`.
- The client cannot embed the target through PostgREST without a foreign key, so it needs a second lookup per kind and its own "is this viewable" logic, which duplicates what RLS already does.

### Option 3: Link markup inside the explanation text

Store the link in the explanation itself, for example `[Moscow Mule](recipe:<id>)`, and parse it on each client.

**Pros**:
- No schema change for the anchor. The link position is exact.

**Cons**:
- Every client must parse a custom markup, and a hand edit in Studio can silently break it.
- Still needs the id somewhere with no foreign key, so it has the same integrity and embed problems as Option 2.
- Pollutes a prose column with markup, which breaks any other reader of `explanation`.

### Option 4: Join table `quiz_question_sources`

A separate table allowing many sources per question.

**Pros**:
- Supports questions that span several recipes or articles.

**Cons**:
- More schema, RLS, and UI for a case the current questions rarely have. One linked phrase per explanation is the shape you asked for.

## Decision

**Chosen option**: Option 1: Two nullable foreign keys plus a stored anchor on `quiz_questions`

Each quiz question records the one Learn article or recipe that holds its answer and the exact explanation phrase to link. Both generation scripts require it, a reviewed backfill fills it in for existing quizzes, and both result screens render it inline with a "Read more" fallback.

**Implementation skills**: `supabase-postgres-best-practices` (`supabase/agent-skills`, `.agents/skills/supabase-postgres-best-practices/`) · `nextjs-app-router-patterns` (`wshobson/agents`, `.agents/skills/nextjs-app-router-patterns/`) · `react-native-best-practices` (`callstackincubator/agent-skills`, `.agents/skills/react-native-best-practices/`) · `vitest` (`antfu/skills`, `.agents/skills/vitest/`) · `posthog-instrumentation` (`posthog/posthog-for-claude`, `.agents/skills/posthog-instrumentation/`)

## Rationale

The deciding force is that "is this link safe to show" is already answered by the database. Articles hide unless `published`, and recipes hide once soft deleted, both through RLS. Real foreign keys let the existing quiz detail read embed the source row in the same request, and RLS turns a dead target into a null with no new code on either client. Option 2 would have to rebuild that visibility check twice (web and mobile), and Option 3 would add a parser on top. The cost of Option 1 is two columns and a check constraint, which is cheap next to an integrity hole that spec 0026 already flagged once.

Storing the anchor separately (rather than matching the recipe name at render time) follows from how Haiku writes. It paraphrases ("the Mule", "this classic"), so name matching would quietly miss often. A stored, validated phrase is exact, and you can fix it in Studio during the review you already do. The "Read more" fallback means a hand edit that removes the phrase degrades to a visible link rather than no link.

Asking Haiku for a list number instead of a UUID removes the most common failure of LLM structured output (garbled long ids), and the script can reject an out of range number before inserting anything. That keeps the existing abort with no insert rule from spec 0026. The backfill reuses the same prompt pieces, prints its proposal before writing, and never rewrites question content. That keeps it safe to run against the 2 published quizzes, whose saved best scores depend on the questions not changing.

## Feature design

**Data model sketch**:

`quiz_questions` (existing table, three new columns, all nullable so the migration is safe on live rows):

| Field | Type | Nullable | Notes |
|---|---|---|---|
| `source_article_id` | uuid | yes | FK to `learn_articles.id`, `on delete set null` |
| `source_recipe_id` | uuid | yes | FK to `recipes.id`, `on delete set null` |
| `source_anchor` | text | yes | The exact phrase in `explanation` to turn into a link |

- Check constraint `quiz_questions_single_source`: `num_nonnulls(source_article_id, source_recipe_id) <= 1` (AC-10).
- Indexes on `source_article_id` and `source_recipe_id` (Postgres does not index foreign keys automatically; they keep `on delete set null` cheap).
- The database deliberately does not require a source: `on delete set null` must always succeed. "Every question has a source" is enforced by the generation and backfill scripts (AC-6, AC-7, AC-8).
- No change to `quizzes` or `quiz_attempts`, and no RLS change: the new columns inherit the existing `quiz_questions` published parent read policy, and clients still have no write policy.

Shared types (`packages/shared/src/quizzes.ts`):

```ts
export type QuizQuestionSource =
  | { kind: "article"; id: string; title: string; category: string }
  | { kind: "recipe"; id: string; name: string };

export interface QuizQuestion {
  // ...existing fields
  source: QuizQuestionSource | null; // null = no source or not viewable (AC-3)
  sourceAnchor: string | null;
}
```

A pure helper (in `quizzes.ts`, exported from the barrel since both apps and the scripts use it):

```ts
// Case insensitive, first occurrence, via a RegExp built from the escaped
// anchor with the `i` flag (not toLowerCase index math, which can shift
// lengths). The anchor is trimmed first. Returns null when explanation is
// empty, the trimmed anchor is shorter than 3 characters, or it is not found
// (AC-1, AC-2). `match` is sliced from the explanation, so it keeps the
// explanation's casing. No other normalization (curly vs straight quotes,
// internal whitespace).
export function splitExplanationAtAnchor(
  explanation: string | null,
  anchor: string | null,
): { before: string; match: string; after: string } | null;
```

The same helper is the validator in the generation and backfill scripts, so "renders inline" and "passes validation" can never disagree. Both scripts store `match` (the exact substring from the explanation) as `source_anchor`, not Haiku's raw text.

The mapper in `fetchQuizDetail` only builds an article `source` when the embedded `category` is a member of `LEARN_CATEGORIES`; any other value becomes `source: null`, so it is never put into a path unchecked.

**State transitions**: none new. A kept result (AC-5) is client state only (web and mobile): `answering` → (submit) → `result` → (Take again) → `answering`.

**API surface**:

| Endpoint | Method | Key inputs | Key outputs | Auth | Key errors |
|---|---|---|---|---|---|
| `quizzes` + `quiz_questions` (PostgREST, detail, existing `fetchQuizDetail`) | GET | `id`, `status=eq.published` | existing fields, plus per question `source_anchor`, `learn_articles!source_article_id(id, title, category)`, `recipes!source_recipe_id(id, name)` | public (RLS scoped) | an embedded target hidden by RLS comes back null → `source: null` (AC-3). The embed must stay a plain (left) embed, never `!inner`, or a hidden target would drop the whole question |
| `generate-learn-category-quiz.ts` (CLI, service role) | n/a | `--title`, `--category` (unchanged) | one draft quiz whose questions all carry `source_article_id` + `source_anchor` | service role key | invalid source index, missing or not found anchor, or empty explanation → exit non zero, no insert (AC-6) |
| `generate-recipe-quiz.ts` (CLI, service role) | n/a | `--title`, `--tag` or `--region` (unchanged) | one draft quiz whose questions all carry `source_recipe_id` + `source_anchor` | service role key | same as above (AC-7) |
| `backfill-quiz-sources.ts` (new CLI, service role) | n/a | no flags (dry run, optional `--out <file>`, default `quiz-source-plan.json`, optional `--quiz <id>`), or `--apply <file>` | dry run: a printed table (quiz, question number, kind, name, anchor, found Y/N) plus the plan file `[{ questionId, sourceArticleId, sourceRecipeId, sourceAnchor }]`; `--apply`: one `update quiz_questions set source_article_id, source_recipe_id, source_anchor where id = questionId and source_article_id is null and source_recipe_id is null` per plan entry, with no Haiku call | service role key | Haiku parse failure or out of range index for a quiz → that quiz is reported and left out of the plan; other quizzes continue. Empty pool → quiz reported and skipped. On `--apply`, a plan entry whose question already has a source is a no op (the `where` guard) |
| `quiz_source_link_clicked` (PostHog, via each app's `track`) | n/a | `quiz_id`, `question_id`, `target_kind`, `was_correct` | none | consent gated | none (no op without consent) |

**Value sourcing**:

| Action | Value produced / displayed | Source |
|---|---|---|
| Result screen (AC-1) | link target: article | embedded `learn_articles` row `id`, `title`, `category`. Web href (no locale prefix, `Link` from `@/i18n/navigation` adds it): `` `/learn/${category}/${buildLearnArticleSlugPath(id, title)}` ``. Mobile: `router.push({ pathname: "/learn/[category]/[id]", params: { category, id } })` |
| Result screen (AC-1) | link target: recipe | embedded `recipes` row `id`, `name`. Web href: `` `/recipes/${buildRecipeSlugPath(id, name)}` `` through the same `Link`. Mobile: `router.push({ pathname: "/recipe/[id]", params: { id } })` |
| Result screen (AC-1, AC-2) | which words are linked | `splitExplanationAtAnchor(question.explanation, question.sourceAnchor)`; non null → inline link, null → "Read more" line. `sourceAnchor` is ignored whenever `source` is null |
| Result screen (AC-1) | how the inline link renders | web: `before`, `<Link>{match}</Link>`, `after` inside the one existing explanation `Text`, with link styling from the existing design tokens (`docs/design/design.md`; underline plus the accent color used for links elsewhere). Mobile: a nested `<Text onPress accessibilityRole="link">` inside the explanation `Text`, with the same token styling |
| Result screen (AC-2) | "Read more" label | web: new key `quizzes.readMore` in `messages/en.json`/`es.json` ("Read more: <link>{name}</link>" / "Más información: <link>{name}</link>"), rendered with `t.rich` so only the name is the link. Mobile: a hardcoded English "Read more: " followed by the linked name, matching the screen's existing hardcoded strings |
| Result screen (AC-2) | the `<name>` in "Read more" | `source.title` (article) or `source.name` (recipe) |
| Result screen (AC-3) | whether any link shows | `question.source`: null when both FKs are null or the embedded row was hidden by RLS |
| Result screen (AC-5) | which answers to keep, and whether they are still valid | a pure shared helper `restoreQuizAnswers(stored: unknown, questions)`: returns the `answers` record only if it is an object whose keys are exactly the current quiz's question ids and whose values are valid option indexes, otherwise null. The score is always recomputed from the restored answers and `correctOptionIndex`, never read from storage |
| Result screen (AC-5, web) | the kept result after Back | `sessionStorage` key `quiz-result:<quizId>` holding only `answers`, written on submit (whether or not the attempt saved). It is read in a `useEffect` after mount, not in the `useState` initializer, because `QuizPlayer`'s first render must match the server rendered HTML. A `restored` flag starts false and the player renders nothing for the quiz body until the effect has run, so the answering form never flashes. Reads and writes are wrapped in try/catch, and a failure just means no restore. The "not saved" notice is not restored. Best score keeps coming from `initialBestScore` (server) as today |
| Result screen (AC-5, mobile) | the kept result after Back | a module level in memory `Map<quizId, answers>` in `apps/mobile/src/quizzes/` (lives for the app session, gone on app restart), written on submit and read on screen mount through `restoreQuizAnswers`. It does not rely on the screen staying mounted, because Learn is its own tab (`app-tabs.tsx`) and a tab switch may unmount the hidden quizzes stack |
| Result screen (AC-5) | "Take again" | web: new key `quizzes.takeAgain` (en/es). Mobile: hardcoded English "Take again". It clears the stored entry (sessionStorage key on web, Map entry on mobile) and resets `answers` and `result` state |
| Link click (AC-9) | event payload | `{ name: "quiz_source_link_clicked", properties: { quiz_id: quiz.id, question_id: question.id, target_kind: source.kind, was_correct: answers[question.id] === question.correctOptionIndex } }`, where `question_id` is the `quiz_questions.id` uuid. Built by a new `buildQuizSourceLinkClickedEvent` plus `ANALYTICS_EVENT_NAMES.quizSourceLinkClicked` and a `QuizSourceLinkClickedProperties` type in `packages/shared/src/analytics.ts`. Sent from the link's `onClick` (web) / `onPress` (mobile) handler before navigation |
| Generation (AC-6, AC-7) | the numbered source pool | a shared `QuizSourcePoolItem` type `{ id, label, contextText }` built once per run, sorted stably (`label`, then `id`), numbered `[1]..[n]`. The same array feeds the prompt and the index to id mapping, so numbering cannot drift |
| Learn generation (AC-6) | pool items | the category's published `learn_articles`, now selecting `id, title, body_markdown`: `label` = title, `contextText` = body |
| Recipe generation (AC-7) | pool items | the recipe detail query now also selects `id` (the existing two step lookup, ids first then detail, stays as is): `label` = name, `contextText` = the glass, region and ingredient line used today |
| Generation (AC-6, AC-7) | prompt rule for anchors | both prompts add: "`sourceIndex` is the number of the one source that answers the question. `sourceAnchor` must be copied word for word from your own explanation, at least 3 characters, ideally the drink or article name" |
| Generation (AC-6, AC-7) | `source_*_id` | Haiku's `sourceIndex` (1 based, required integer) mapped to the pool item's `id` before `insertQuizDraft` is called. `QuizQuestionDraft` gains `sourceArticleId`/`sourceRecipeId` (resolved ids, one null) and `sourceAnchor`, so the insert stays a plain mapping |
| Generation (AC-6, AC-7) | `source_anchor` | `match` from `splitExplanationAtAnchor(explanation, sourceAnchor)`; null from the helper → abort |
| Generation (AC-6, AC-7) | `explanation` | Haiku's `explanation`, now a required non empty string in the zod schema and in `QuizQuestionDraft` (was nullable), since the anchor must live in it |
| Backfill (AC-8) | per quiz source pool | rebuilt from the quiz's own `source_type`/`source_ref` with the same pool builders as generation (`learn_category`: that category's published articles; `recipe_tag`: recipes in `recipe_tags` where `tag_id = source_ref`, not deleted; `recipe_region`: recipes in that region, not deleted). An empty pool → the quiz is skipped and reported |
| Backfill (AC-8) | proposed source and anchor | one Haiku call per quiz (`max_tokens` 2048; output is about 8 short entries) with the numbered pool and the quiz's questions that have no source yet (prompt, correct option, explanation). Per question it returns `sourceIndex` (nullable: "no source fits") and `sourceAnchor` (nullable). The stored anchor is `match` from `splitExplanationAtAnchor` against the existing explanation, or null. If a pool is too large for one prompt (over 60 items), the recipe pool is cut to labels plus the ingredient line only, with no other change |
| Backfill (AC-8) | what `--apply` writes | the plan file from the reviewed dry run, verbatim; Haiku is not called again |

**Key invariants**:
- At most one of `source_article_id`/`source_recipe_id` is set; enforced by the check constraint (AC-10).
- Deleting a target never deletes a question; enforced by `on delete set null` (AC-10).
- An article source always points at an article whose `category` equals the quiz's `source_ref` (learn quizzes), and a recipe source always comes from the quiz's tag or region grouping (recipe quizzes). This is enforced by the scripts, which only offer that pool, not by the database: a trigger checking a loose `source_ref` across three shapes is more machinery than the risk earns. Studio edits are trusted, the same discipline as spec 0026.
- The kind of source matches the quiz's `source_type` (`learn_category` → article, `recipe_*` → recipe); enforced by the scripts.
- Source data is never sent to the answering view: the clients only read `source`/`sourceAnchor` inside the result rendering (AC-4). The data does reach the client with the questions (as `correct_option_index` already does, see spec 0026's security model), which is acceptable for the same low stakes reason.
- The backfill only writes `source_article_id`, `source_recipe_id`, `source_anchor`. It never touches the columns that `quiz_attempts.total` comparability depends on (spec 0026's invariant about editing published quizzes).

**Security model**:
- No new read surface: the new columns are covered by the existing `quiz_questions` policy (visible only when the parent quiz is `published`). The embedded `learn_articles` and `recipes` rows are filtered by their own existing public RLS, so a guest can never see a draft article's title through a quiz.
- No client write: no new insert or update policy. The generation and backfill scripts use the service role key, the same as spec 0026.
- The analytics event carries ids and a boolean only, no free text and no PII, and goes through the existing consent gate.

**Configuration required**: none new. The scripts reuse `ANTHROPIC_API_KEY` and `SUPABASE_SERVICE_ROLE_KEY`. Analytics reuses the existing PostHog keys.

**Critical test scenarios**:
- Happy path, inline: a published question with a recipe source and anchor "Moscow Mule" renders the explanation with "Moscow Mule" as a link to the recipe on web and mobile, verifies **AC-1**, **AC-4**.
- Fallback: an anchor not present in the explanation (and separately, a null explanation) renders plain text plus `Read more: <name>` in the current locale, verifies **AC-2**.
- Dead target: set a source article back to `draft` (and separately, soft delete a source recipe); the question renders plain text with no link and no "Read more", verifies **AC-3**.
- No leak before submit: while answering, no link, name or anchor appears in the DOM or screen, verifies **AC-4**.
- Back keeps result: submit, follow a link, go Back; the same score and answers show on web (after a full remount, with no flash of the answering form or hydration warning) and on mobile, tested separately for a recipe link and for a Learn link (which crosses tabs). "Take again" clears it, verifies **AC-5**.
- Embedded source with RLS: against the live project, a quiz whose question's article is `draft` still returns that question (with `source: null`), confirming the embed is a left join, verifies **AC-3**.

Unit tests (vitest, beside the source in `packages/shared`):
- `splitExplanationAtAnchor`: case insensitive match, first occurrence only, casing preserved from the explanation, regex special characters in the anchor (`.`, `(`, `?`), trimmed anchor, anchor under 3 characters, null/empty explanation, null anchor, not found, verifies **AC-1**, **AC-2**.
- `restoreQuizAnswers`: a valid record is returned; extra, missing or unknown question ids, out of range option indexes, and non object input all return null, verifies **AC-5**.
- Generation validation: out of range or missing `sourceIndex`, anchor not in explanation, and empty explanation each throw before any insert; a valid draft resolves ids from the same pool array used in the prompt, verifies **AC-6**, **AC-7**.
- Backfill plan building: a null `sourceIndex` produces a no source entry, an anchor not found produces `sourceAnchor: null`, and an invalid quiz is left out of the plan, verifies **AC-8**.
- `buildQuizSourceLinkClickedEvent` returns the event name and the four properties, verifies **AC-9**.

Manual checks (no React component tests in this repo today):
- Backfill: a dry run writes nothing and saves the plan; `--apply <plan>` writes exactly the plan and only the three source columns; applying the same plan twice changes nothing, verifies **AC-8**.
- Analytics: with consent, one click sends one event to PostHog; without consent nothing is sent, verifies **AC-9**.
- Constraint: setting both FKs on a row in the SQL editor is rejected; deleting a referenced article (on a branch or a throwaway draft) nulls the FK and keeps the question, verifies **AC-10**.

## Build plan

Tracer Bullet: prove one real linked question end to end (schema → shared read → web render) before widening to generation, backfill, mobile and analytics.

1. Migration `supabase/migrations/<timestamp>_quiz_question_sources.sql`: the three nullable columns, both FKs `on delete set null`, the `quiz_questions_single_source` check, and the two FK indexes. Run it in the Supabase SQL editor on `BartendingAppWeb`, then regenerate `packages/shared/src/database.types.ts`, satisfies **AC-10**
2. Shared read: extend `fetchQuizDetail` to select `source_anchor` and embed `learn_articles!source_article_id(id, title, category)` and `recipes!source_recipe_id(id, name)` (plain embeds, never `!inner`), map them to `source`/`sourceAnchor` (article only when `category` is in `LEARN_CATEGORIES`), and add `splitExplanationAtAnchor` and `restoreQuizAnswers` with unit tests, satisfies **AC-1**, **AC-2**, **AC-3**
3. Web render: in `apps/web/src/quizzes/quiz-player.tsx`'s result view, render the explanation through `splitExplanationAtAnchor` with the locale aware `Link` inside the explanation `Text`, the `t.rich` "Read more" fallback, and nothing when `source` is null; add `quizzes.readMore` to `messages/en.json` and `es.json`. Set one live question's source by hand in Studio to prove the thread end to end, satisfies **AC-1**, **AC-2**, **AC-3**, **AC-4**
4. Web kept result: save `answers` to `sessionStorage` on submit, restore in `useEffect` behind a `restored` flag through `restoreQuizAnswers`, recompute the score, plus a "Take again" button (`quizzes.takeAgain`, en/es), satisfies **AC-5**
5. Generation: in `packages/shared/src/quizGeneration.ts`, add the `QuizSourcePoolItem` type, `sourceIndex` and `sourceAnchor` in the zod schema, a required `explanation`, the anchor rule in both prompts, index and anchor validation through `splitExplanationAtAnchor` (abort with no insert), id resolution before `insertQuizDraft`, and the new columns in the insert. Update both scripts to build the pool (`id` added to both selects). Extend `quizGeneration.test.ts`, satisfies **AC-6**, **AC-7**
6. Backfill: new `packages/shared/scripts/backfill-quiz-sources.ts` plus a `backfill-quiz-sources` package script. The dry run writes the plan file and prints the table; `--apply <file>` writes the plan with the `where` guard; `--quiz` limits it to one quiz. Run the dry run, review the table, then apply across all 7 quizzes, satisfies **AC-8**
7. Mobile render: in `apps/mobile/src/app/quizzes/[id].tsx`'s result view, the same inline link (nested pressable `Text`, `accessibilityRole="link"`), the English "Read more" fallback and the dead target behavior using `router.push`; the in memory answers `Map` in `apps/mobile/src/quizzes/` with `restoreQuizAnswers`; and an English "Take again". On a device or simulator, confirm Back from both a recipe link and a Learn link shows the result, satisfies **AC-1**, **AC-2**, **AC-3**, **AC-4**, **AC-5**
8. Analytics: `quizSourceLinkClicked` name, properties type and `buildQuizSourceLinkClickedEvent` in `packages/shared/src/analytics.ts` (with a test), sent from both apps' link press handlers through `track` before navigating, satisfies **AC-9**

## Consequences

**Positive**:
- The quiz result screen feeds users back into Learn and recipe pages instead of ending the session there.
- Source visibility rides on existing RLS, so a later unpublish or soft delete never produces a dead link, with no new code to keep in sync.
- Every future quiz gets links at no extra review cost, and a bad anchor is a one cell fix in Studio.

**Negative / tradeoffs**:
- One link per question. Comparison questions ("which of these drinks uses X") can only point at one recipe.
- Generation is stricter: an otherwise fine Haiku response now fails if any anchor is missing from its explanation, so you may rerun the script more often.
- The backfill's anchors are matched against explanations written before anchors existed, so some will come back null and show the "Read more" line instead of an inline link. You can fix those by hand in Studio.
- Source and anchor ship to the client with the questions, so a determined user could see which recipe a question is about before answering. This is the same accepted low stakes leak as `correct_option_index` in spec 0026.
- Web now keeps quiz answers in `sessionStorage` and mobile in an in memory map: two small new client persistence surfaces, kept honest by one shared validator.
- Haiku can pick a wrong but valid source from a large pool. For new quizzes, your Studio review now also checks each question's source and anchor. For the backfill, the dry run table is that review.
- The quiz and its questions are still two separate inserts (unchanged from spec 0026), so "no partial quiz" covers validation failures, not a network failure on the second insert.
- Mobile quiz text, including the new labels, stays English only until the mobile quiz screen is localized.

**Neutral**:
- The "every question has a source" rule lives in the scripts, not the database, by design (so `on delete set null` stays safe).
- `quiz_questions` gains its first foreign keys outside `quizzes`, so the quiz detail read now joins three tables instead of two.

## Migration plan

**Strategy**: additive columns first, then a reviewed backfill (no feature flag; every client path already treats a null source as "no link").
**Phases**:
1. Apply the migration (three nullable columns, FKs, check, indexes) in the SQL editor. Existing rows get nulls, and both apps keep rendering exactly as today (AC-3 path).
2. Ship the shared read and client rendering. Questions with no source still render as today.
3. Run the backfill dry run, review the table, then run `--apply <plan file>`. Links appear on the next quiz load, with no deploy.
**Rollback**: Phase 3: `update quiz_questions set source_article_id = null, source_recipe_id = null, source_anchor = null` returns every question to plain text. Phase 2: revert the client commits. Phase 1: drop the three columns (nothing else depends on them).
**Risks**: a wrong source picked by Haiku on a published quiz sends users to an unrelated page. This is mitigated by applying exactly the reviewed plan file and by the fix being one Studio cell edit.

## Follow-up

- [ ] Translated quiz content (spec 0026 follow-up) will need translated anchors too: an anchor must match the translated explanation, so a `quiz_question_translations` table should carry its own `source_anchor`.
- [ ] The mobile quiz screens hardcode English ("Score", "Your answer", "(correct)", and now "Read more" and "Take again"); localize them to match web.
- [ ] If comparison questions turn out to be common, revisit a join table for many sources per question (Option 4).
- [ ] The source to grouping match (article category equals quiz `source_ref`, recipe within the tag or region) is enforced only by the scripts; a hand edit in Studio can break it unnoticed.
