# 0033. Learn article accuracy pass

**Date**: 2026-10-10
**Status**: In Progress

## Summary

This pass fixes the factual errors in the published Learn articles and gives every article its own search snippet (meta description, the short text Google shows under a link). Each article gets a new hand written `summary` column, and the database requires it. Corrections are AI drafted, checked against named sources, and approved by you one article at a time. They ship as dated SQL migration files, so every change is reviewable in git. The simple syrup food safety fix ships first, on its own.

## Context

> ⚠️ Premise note: only 5 of the 18 published articles were checked, and 4 of those 5 had errors, so the other 13 should be treated as likely wrong, not as fine. The fact checker here is also an AI, checking text another AI drafted, and it can repeat the same mistake with confidence. So every change must cite a named authoritative source (a food safety agency, a government label regulation, a producer's own technical documentation), and a claim with no source found gets removed or softened, never kept as is.

Spec [0025](0025-learn-section.md) shipped Learn with Haiku drafted articles reviewed in Supabase Studio. That review didn't catch errors. Today's live content (`BartendingAppWeb`, 18 `published` rows plus 1 `archived` jigger duplicate) includes a food safety error: "Simple Syrup and Other Bar Syrups, Explained" says syrup keeps indefinitely and never mentions refrigeration. Known errors also sit in the jigger, proof, and oak barrel articles, in a grenadine ratio, and in a "suggests complexity" sentence (scope feature 39).

On the SEO side, the article page's `generateMetadata` (`apps/web/src/app/[locale]/learn/[category]/[slug]/page.tsx`) sets no `description`, so every article falls back to the site wide "Recipes and pantry ideas for home bartenders." The category page builds its description from a template, which produces "Learn about other for home bartending." The Learn landing page sets none at all. The articles' opening paragraphs are generic hooks ("When you're shopping for spirits...") of 200+ characters with inline markdown. That makes them weak raw material for a snippet.

Constraints: one owner, no content tooling beyond Studio, writes to the live project run by hand in the dashboard SQL editor (not through MCP), and web routes revalidate every 60 seconds (spec 0025).

## Requirements

**User stories**:
- As a home bartender, I want Learn articles to be accurate, especially on food safety, so that I can trust what I read.
- As someone searching the web, I want each Learn result to show a snippet about that article, so that I can tell what it covers.
- As the app owner, I want every correction recorded with its source, so that I can see what changed and why.

**Acceptance criteria**:
- **AC-1**: The live simple syrup article tells the reader to refrigerate syrup and gives a bounded shelf life backed by a cited source. It no longer says or implies that syrup keeps indefinitely. This fix ships before any other part of this spec.
- **AC-2**: Every `published` article has an entry in the fact check review doc. Each entry lists the claims changed, with the named source behind each change, or says "no changes needed" along with what was checked. Each entry is approved by the owner before its correction is applied.
- **AC-3**: Every body correction lands through a dated migration file in `supabase/migrations/` that updates the row by `id`. After it's applied, each corrected row's live `md5(body_markdown)` matches the approved text.
- **AC-4**: The known findings from scope feature 39 are all corrected: jigger (bitters measured with the 1 oz side, pouring in sequence), proof (US label rules, the water explanation, the Negroni advice), oak barrels ("concentrated grain alcohol", char times), the grenadine ratio, and the "suggests complexity" sentence.
- **AC-5**: `learn_articles.summary` exists as `text not null`, with checks that its length is 70 to 160 characters and that it has no leading or trailing whitespace. Every row has one, whatever its status, and it's plain text (no markdown).
- **AC-6**: For every existing published article, the page's `<meta name="description">` and `og:description` both equal that article's `summary`, never the site wide description. (The not found page is out of scope.)
- **AC-7**: The Learn category list shows each article's `summary` under its title, on web and mobile.
- **AC-8**: Each Learn category page and the Learn landing page take their page title and a hand written meta description from the web message catalog, in English and Spanish. No description reads "Learn about other for home bartending."
- **AC-9**: The generation script drafts a `summary` and inserts it with the draft row. If the summary is outside 70 to 160 characters, has leading or trailing whitespace, or contains markdown, generation throws, the script exits non zero, and nothing is inserted.
- **AC-10**: The generation prompt carries explicit accuracy rules: storage and food safety guidance where relevant, no invented figures or ratios, and hedged wording for legal or label claims that differ by country.
- **AC-11**: A correction never changes an article's `published_at` (still the first publish date) or its `status`.

## Options considered

Two linked decisions: where the description comes from (A), and how corrections reach the table (B).

### A1: Required hand written `summary` column (chosen)

A new `summary text not null` column with a length check. It's backfilled for all rows, and the generator drafts it for new ones.

**Pros**: snippet quality is written for search, not taken from a narrative hook. The database guarantees it can't go missing. The same text also works as the list subtitle.
**Cons**: 19 summaries to write and review now. A migration that turns on a not null constraint on a live table needs a safe sequence.

### A2: Nullable `summary`, derived fallback

The column is optional. When it's empty, the description is derived from the first paragraph (markdown stripped, cut at a word boundary under 160 characters).

**Pros**: rollout is safer, and no article ever lacks a description.
**Cons**: two code paths plus a markdown stripper to test. The weak fallback text quietly becomes permanent for any article nobody gets back to.

### A3: Derive only

The description always comes from the first paragraph of `body_markdown`, with no schema change.

**Pros**: no migration, nothing to keep in sync.
**Cons**: these openings make poor snippets. Every article reads like "When you're shopping for spirits, you'll notice...". The description also changes whenever the body is edited.

### B1: Data migration files (chosen)

Dated SQL files in `supabase/migrations/` that replace each corrected body in full by `id`, using a dollar quoted string, with a comment per article. They're applied by hand in the SQL editor.

**Pros**: reviewable git diff, a permanent record of what changed, and repeatable. It also fits how you already apply writes to the live project.
**Cons**: long text inside SQL is clunky to read. A full body replacement overwrites any Studio edit made after the text was drafted.

### B2: Edit in Supabase Studio

The same flow as spec 0025's review: edit each row by hand.

**Pros**: fastest, and no new files.
**Cons**: no record of what changed or why, and this is the same flow that let the errors through.

### B3: Markdown files in the repo plus a sync script

Article source of truth moves to `content/learn/*.md`, upserted by `id`.

**Pros**: the best editing experience long term, with full history.
**Cons**: it changes the content workflow from spec 0025 (its deferred Option 2), which is a bigger decision than an accuracy pass needs.

## Decision

**Chosen option**: A1 (required `summary` column) and B1 (data migration files), with AI drafted fact checks that the owner approves one article at a time, and the simple syrup fix shipped first on its own.

Each article carries a required, hand written `summary` that feeds its meta description, its `og:description`, and its list subtitle. Every factual correction is a sourced, owner approved, full body replacement shipped as a dated migration.

**Implementation skills**: `supabase-postgres-best-practices` (`supabase/agent-skills`, `.agents/skills/supabase-postgres-best-practices/`) · `nextjs-app-router-patterns` (`wshobson/agents`, `.agents/skills/nextjs-app-router-patterns/`) · `vitest` (`antfu/skills`, `.agents/skills/vitest/`)

## Rationale

Studio review alone already failed here (4 of 5 checked articles wrong), so the fix has to leave a trail. B1 is the lightest way to get one: every change is a diff a person can read, with its reasoning in a comment and its sources in the review doc. B3 would give the same trail but reopens spec 0025's workflow decision mid hardening. It stays the natural upgrade if editing in SQL gets painful.

For descriptions, the deciding fact is the live content itself. The first paragraphs are scene setting hooks, so deriving from them (A3) produces snippets that all sound the same. A2's fallback would let that weak text survive forever with nobody noticing. With 19 rows, writing summaries by hand is an afternoon, and `not null` turns "every article has its own description" from a hope into a constraint.

Shipping the syrup fix alone follows Tracer Bullet: it proves the whole correction path (draft, source, approve, migrate, apply, check on both apps) on the single most urgent article, and it takes a food safety error offline the same day instead of after an 18 article review.

## Feature design

**Data model sketch** (`learn_articles`, changes only):

| Field | Type | Nullable | Notes |
|---|---|---|---|
| `summary` | text | not null (after backfill) | checks `char_length(summary) between 70 and 160` and `summary = btrim(summary)`; plain text, no markdown; feeds meta description, `og:description`, list subtitle |
| `body_markdown` | text | unchanged | corrected bodies replaced in full, by `id` |
| `updated_at` | timestamptz | unchanged | the existing `set_updated_at` trigger bumps it on every update, so the summary backfill bumps it on all rows (and the sitemap `lastmod` with it), even for articles whose body never changes. Accepted. |
| `published_at` | timestamptz | unchanged | the trigger only sets it on the first move to `published`; corrections don't touch `status` (AC-11) |

No `fact_checked_at` column: the review doc holds the record.

**State transitions**: none new. Corrections update published rows in place and never change `status`.

**API surface**:

| Endpoint | Method | Key inputs | Key outputs | Auth | Key errors |
|---|---|---|---|---|---|
| `learn_articles` list (`fetchArticlesByCategory`) | GET | `category`, `status=eq.published` | adds `summary` | public (RLS) | empty array |
| `learn_articles` detail (`fetchArticleDetail`) | GET | `id`, `category`, `status=eq.published` | adds `summary` | public (RLS) | null → not found |
| `generate-learn-article.ts` | CLI | title, category, topic | inserts draft with `summary` | service role | throws on an invalid summary (script exits non zero), no insert |
| Correction migrations | SQL editor | n/a | `update ... where id = ...` | dashboard (owner) | n/a |

**Value sourcing**:

| Action | Value produced / displayed | Source |
|---|---|---|
| Article page metadata (AC-6) | `description`, `openGraph.description` | `summary` column, through `fetchArticleDetail` (already called in `generateMetadata`) |
| Category list, web and mobile (AC-7) | subtitle under each title | `summary` column, through `fetchArticlesByCategory`; `summary: string` is a required field on `LearnArticleSummary` |
| Category page metadata (AC-8) | `title`, `description` | web message catalog keys `learn.categoryTitles.<category>` and `learn.categoryDescriptions.<category>` in `apps/web/messages/{en,es}.json`, read with `getTranslations` in the existing `generateMetadata` |
| Learn landing metadata (AC-8) | `title`, `description` | catalog keys `learn.landingTitle` and `learn.landingDescription` (en and es), read with `getTranslations` in a new async `generateMetadata` on `apps/web/src/app/[locale]/learn/page.tsx` |
| Catalog copy (AC-8) | 12 keys per locale (a title and a description for the landing page and each of the 5 categories) | AI drafted during `/develop`, Spanish included, approved by the owner before commit |
| Backfilled summaries (AC-5) | one summary per live row | drafted by AI during `/develop` from each article's current body, under the topic only rule (see Key invariants), approved by the owner, written in the backfill migration. Row ids and statuses are read from the live database right before the migration is written, never assumed from this spec |
| New article summary (AC-9) | `summary` | new `summary` field in the Haiku structured output (`ArticleDraftSchema`, whose description also states the summary rules), checked in code after parsing against shared `SUMMARY_MIN_CHARS` / `SUMMARY_MAX_CHARS` constants that the tests import too |
| Corrected body (AC-3, AC-4) | new `body_markdown` | AI drafted from the live body as read at drafting time, each change backed by a named source in the review doc, owner approved |
| Offending passages (AC-4) | which article holds each known finding | a search of live `body_markdown` for each phrase (grenadine ratio, "suggests complexity", and so on) at the start of the build; the matching article ids are recorded at the top of the review doc |
| Fact check record (AC-2) | per article: changed claims, sources, approval | `docs/reviews/2026-10-learn-article-fact-check.md` |
| Check after apply (AC-3) | live hash per corrected row | `select id, md5(body_markdown) from learn_articles where id in (...)`, compared to the expected md5 written as a comment above each block in the migration, computed from the exact bytes between the `$learn$` tags |

**Key invariants**:
- `summary` is never null, always 70 to 160 characters, and never has leading or trailing whitespace, enforced by the database.
- **Topic only summaries**: a summary says what the article covers, never a fact from it (no figures, ratios, shelf lives, or legal or label claims). That way a later body correction can't make a summary wrong, and summaries written before slice 3 stay valid. Slice 3 still rereads each summary against its corrected body.
- A body correction changes only `body_markdown` (and `summary` if slice 3 finds one stale). It never changes `status` or `published_at`.
- No correction ships without an owner approved entry in the review doc that names its sources.
- Summaries and catalog descriptions are plain text. The generator's check rejects `**`, `__`, a leading `#`, backticks, and `](`, and counts length with `[...summary].length` (code points, matching Postgres `char_length`). Backfilled text follows the same rules.

**Security model**: unchanged. `summary` is public on published rows like every other column, there's still no client write policy, and the generator and migrations write as the service role or dashboard owner. No PII, no compliance scope.

**Configuration required**: none. There are no new env vars, and the generator reuses `ANTHROPIC_API_KEY` and `SUPABASE_SERVICE_ROLE_KEY`.

**Settled implementation details**:
- **Dollar quote tag**: bodies use `$learn$...$learn$` (not bare `$$`, which article text could contain). Before writing, `/develop` confirms no body contains `$learn$`. The body is the exact text between the tags, with no newline added after the opening tag or before the closing one.
- **Line endings**: add a `.gitattributes` rule, `supabase/migrations/*.sql text eol=lf`, so Windows checkouts don't turn the newlines in a body into CRLF and break the md5 check.
- **Idempotent migrations**: SQL editor applies aren't recorded in `supabase_migrations.schema_migrations`, so a later `supabase db push` may run these files again. Every one must be safe to rerun: `add column if not exists`, constraints added only when missing (checked against `pg_constraint`), the guard and `set not null` harmless when already done, and body updates that are full replacements by `id` (rerunning writes the same text). Timestamps follow the latest existing file (`20261010120000`).
- **Caching**: the Learn routes have no `revalidate` export today (spec 0025 called for one, but it never landed), so the check after apply loads a fresh render instead of waiting a fixed window.
- **Subtitle UI**: on both apps, the summary renders below the title in the existing muted body text variant, with no truncation (160 characters at most). Mobile React Query caches refetch on their normal schedule, so no cache bust is needed.
- **Metadata scope**: `openGraph` on the article page gains `description` alongside its existing `title` and `url`. Twitter cards and `og:locale` are out of scope.
- **Stale edit guard**: corrections are drafted from the live body read during `/develop`. Don't edit those rows in Studio until the migration is applied, and the md5 check after apply catches any overwrite or no op. Runner up: an `and updated_at = '<read value>'` guard on each update. It was rejected because a mismatch quietly updates nothing, which the md5 check catches anyway.
- **Summary check in the generator**: validate length and the absence of markdown in code after `messages.parse()` and return an explicit error (the house error pattern), rather than relying on schema length constraints the structured output feature may not enforce. Runner up: truncate silently. It was rejected because it produces broken sentences.
- **Correction migration granularity**: one migration for the syrup fix (slice 1), one for the summary column and backfill, and one for all remaining body corrections, each article in its own commented block. Runner up: one file per article. It was rejected because it means 17 near identical files.
- **English summaries on `/es` pages**: article bodies are English only (spec 0025), so the `/es` meta description is the English summary as well. Translation waits for the `learn_article_translations` follow up from spec 0025.
- **Unpublished rows**: archived and draft rows get a summary too (the constraint needs one), but their bodies aren't fact checked, since they're never shown. Today that's only the archived jigger duplicate.

**Critical test scenarios**:
- Happy path: after slice 1, the live simple syrup page on web and mobile mentions refrigeration and a shelf life, verifies **AC-1**, **AC-3**.
- Metadata: an article page's rendered head has `description` and `og:description` equal to its summary, verifies **AC-6**.
- List: a category list on web and mobile shows a summary under each title, verifies **AC-7**.
- Category copy: `/en/learn`, `/es/learn`, `/en/learn/other`, and `/es/learn/other` show catalog titles and hand written descriptions, verifies **AC-8**.
- Generator unit tests (`learnArticleGeneration.test.ts`): a 60 character summary, a 170 character summary, one with a trailing space, and one containing `**` each throw with no insert; a valid one is inserted, verifies **AC-9**.
- Rerun safety: applying the summary migration a second time succeeds and changes nothing, verifies **AC-5**.
- Prompt test: the built prompt contains the accuracy rules, verifies **AC-10**.
- Migration guard: applying the backfill while any row still lacks a summary aborts the whole migration, verifies **AC-5**.
- After the final migration: every corrected row's md5 matches, and `published_at` and `status` are unchanged from a snapshot taken before, verifies **AC-3**, **AC-11**.

## Build plan

Tracer Bullet: slice 1 runs the whole correction path on the one urgent article, and each later slice thickens a part of it.

0. Search live `body_markdown` for each known finding's phrase and record the matching article ids at the top of the review doc. Add the `.gitattributes` LF rule, satisfies **AC-2**, **AC-3**, **AC-4**.
1. **Slice 1, simple syrup.** Fact check the simple syrup article, cite sources, and get owner approval. If step 0 placed the grenadine ratio here, fix it in this slice; otherwise it waits for slice 3. Start the review doc with its entry, write `supabase/migrations/<ts>_learn_fix_simple_syrup.sql`, have the owner apply it, run the md5 check, and confirm the page on web and mobile, satisfies **AC-1**, **AC-2**, **AC-3**.
2. **Slice 2, summary thread.** Read the live ids and statuses, draft one topic only summary per row, and get owner approval. Then write the idempotent migration `<ts>_learn_articles_summary.sql`, which:
   - adds `summary` as nullable, with both check constraints;
   - backfills every row by `id`;
   - runs a `do` block that raises if any row is still null;
   - sets `not null`.

   After it's applied, regenerate `packages/shared/src/database.types.ts`, add `summary` to `LearnArticleSummary` and both fetch selects, and update the generator in the same slice: the `summary` field in `ArticleDraftSchema`, the check after parsing, and the insert. Without that, the generator fails once the column is not null. Satisfies **AC-5**, **AC-9**.
3. Web article `generateMetadata`: `description` and `openGraph.description` from `summary`, satisfies **AC-6**.
4. Web and mobile category lists: a summary subtitle under each title, satisfies **AC-7**.
5. Web catalog keys `learn.categoryTitles.*`, `learn.categoryDescriptions.*`, `learn.landingTitle`, and `learn.landingDescription` in `en.json` and `es.json` (owner approved copy). The category page's `generateMetadata` reads them, and the landing page gets a new async `generateMetadata` that does too, satisfies **AC-8**.
6. Generator prompt accuracy rules, plus tests for the summary check and the prompt contents, satisfies **AC-9**, **AC-10**.
7. **Slice 3, remaining corrections.** Fact check the other 17 published articles one at a time, starting with the known ones (jigger, proof, oak barrels, then whichever article holds the "suggests complexity" sentence). Add each approved entry to the review doc, then write `<ts>_learn_article_corrections.sql` with one commented block per changed article. Reread each summary against its corrected body, and fix any that went stale in the same migration. Snapshot `published_at` and `status` before apply, then run the md5 and snapshot checks after, satisfies **AC-2**, **AC-3**, **AC-4**, **AC-5**, **AC-11**.

## Migration plan

**Strategy**: three sequential data migrations, each applied by the owner in the dashboard SQL editor, with code deployed after the schema migration.
**Phases**:
1. Syrup body fix (data only, no code change).
2. Summary column: add nullable, backfill, guard, set not null, in one transaction. Then regenerate types and deploy the web, mobile, and generator changes. The code reads `summary` only after the column exists.
3. Remaining body corrections (data only).

**Rollback**: phases 1 and 3 are reversed by applying the previous body from git history (the migration's own diff, or the md5 snapshot plus an export, taken before apply, of the touched rows that `/develop` saves locally). Phase 2 is reversed with `alter table learn_articles drop column summary` after reverting the code deploy.
**Risks**: a Studio edit made after drafting gets overwritten (mitigated by the freeze and the md5 check); deploying code before phase 2 is applied breaks article pages (mitigated by the ordering above); a fact correction that is itself wrong (mitigated by the named source requirement and owner approval).

## Consequences

**Positive**:
- The food safety error is offline within the first slice.
- Every Learn page gets its own search snippet, and the database guarantees new articles can't ship without one.
- Every factual change has a source and an approval on record, which Studio review never gave.

**Negative / tradeoffs**:
- Full article bodies inside SQL files are clunky to read and review.
- Rows under correction are frozen in Studio until the migration is applied.
- The owner writes or approves 19 summaries and roughly 18 fact check entries. That's real review time, and the pass is only as good as that review.
- `/es` article pages still show an English description.

**Neutral**:
- `updated_at` moves on every corrected row, so the sitemap `lastmod` changes and search engines may recrawl.
- The generator's output contract grows a field, and spec 0025's `ArticleDraftSchema` description is now out of date in that respect.

## Follow-up

- [ ] Spec 0025 promised `revalidate = 60` on the Learn routes, but the code has none. Decide whether Learn pages should revalidate on a timer or render dynamically, and fix whichever side is wrong (/sync flags spec drift).

- [ ] Spec 0025's Value sourcing row for the generator should mention the new `summary` field (/sync flags spec drift).
- [ ] If editing bodies in SQL proves painful during slice 3, revisit spec 0025's Option 2 (markdown files plus a sync script) as its own decision.
- [ ] Consider a recurring accuracy review whenever new articles are generated: the prompt rules reduce errors, but they don't replace a sourced check.
