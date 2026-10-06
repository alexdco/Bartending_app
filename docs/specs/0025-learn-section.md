# 0025. Learn section

**Date**: 2026-09-19
**Status**: Accepted

## Summary

This adds a new "Learn" area to the app, alongside Home, Search, Pantry, Drink Ideas, Popular, and Service in the nav. It holds short educational articles about bar tools, spirits, wine, and beer, grouped into categories. Articles start as AI drafted text (using the app's existing Claude Haiku integration, the same one used for translations and ingredient classification), written from a topic you give it, then you review and edit the draft directly in the database before it goes live. Nothing about this feature lets other users write or comment on content; it is read only, curated content.

## Context

The app today teaches nothing about the craft itself: it helps a user find and make a recipe, but there is no place to learn what a jigger does, what separates a rye from a bourbon, or how a lager differs from an ale. This is a gap in the product's stated purpose (a home bartender's app), not a nice to have bolted on.

The team is one person, with no admin panel and no content team. Any content feature has to work within that constraint: drafting has to be cheap (hence AI assisted, following the pattern already proven by spec 0020's translation pipeline and spec 0022's ingredient classification, both offline scripts using the same Claude Haiku SDK call), and review has to use tools that already exist (Supabase Studio) rather than new build effort spent on an editor UI nobody but the owner will ever use.

This spec covers the content library only: browsing, reading, and the generation/review workflow behind it. A later feature (quizzes, already queued behind this one in the scope) will read this content and the recipe catalog to test a user's knowledge; it is out of scope here.

## Requirements

**User stories**:
- As a home bartender, I want to read short articles about tools, spirits, wine, and beer, so that I can learn the craft, not just look up recipes.
- As the app owner, I want to generate a draft article from a topic with one command, so that I can populate the section without writing every word myself.
- As the app owner, I want to review and edit a draft before it's visible to anyone, so that nothing inaccurate or badly written ships.

**Acceptance criteria**:
- **AC-1**: A user can open "Learn" from the nav (web and mobile) and see all five categories (Tools, Spirits, Wine, Beer, Other), regardless of whether a category has any published articles yet.
- **AC-2**: Opening a category shows every `published` article in that category (title at minimum); a category with none shows an empty state, not an error.
- **AC-3**: Opening an article shows its title and its body, rendered from markdown (headings, lists, bold/italic, links).
- **AC-4**: A `draft` or `archived` article is never visible to a user: not in a category list, and not reachable by its detail URL (renders not found).
- **AC-5**: An unknown article id (or a category value outside the fixed set) renders a not found state, not an error page or a blank screen.
- **AC-6**: Learn is fully public: a guest with no session can browse and read, same as recipes; nothing here depends on sign in or bartender mode.
- **AC-7**: Running the generation script with a title, category, and topic prompt creates one new `learn_articles` row with `status = 'draft'`, populated with a Haiku generated markdown body from that prompt.
- **AC-8**: Running the generation script twice with the same title creates two separate draft rows (no dedupe); nothing is silently skipped or overwritten.
- **AC-9**: An article only becomes visible to users after its `status` is changed to `published` directly in the database (Supabase Studio or SQL); there is no in app publish action.

## Options considered

### Option 1: Offline script + Supabase Studio review (recommended)

A CLI script generates one Haiku drafted article per run into `learn_articles` with `status = 'draft'`. The owner reviews and edits the row, and flips `status` to `published`, directly in Supabase Studio's table editor. The app only ever reads `published` rows.

**Pros**:
- No new UI to build beyond the read side; matches the exact pattern already proven twice (spec 0020, spec 0022).
- Editing raw markdown in a table cell is perfectly workable for a single owner at this content volume.
- Zero new auth surface: no admin login, no write API, nothing new to secure.

**Cons**:
- Editing markdown in Supabase Studio's table editor is a plain text box, not a rich editor; long articles are a little awkward to proofread there.
- Doesn't scale past one owner; a second content reviewer would need direct database access, which is a real limit if the team ever grows.

### Option 2: Offline script + local file review

The script writes each draft to a local Markdown file (with front matter for title/category) instead of directly into Postgres. The owner edits the file, then a second "publish" script reads it and upserts the row as `published`.

**Pros**:
- Editing in a real text editor (or any Markdown tool) is more pleasant than a database table cell.
- Drafts live in git history if committed, giving a free audit trail of edits.

**Cons**:
- Two scripts and a two step flow instead of one, more moving parts for marginal benefit at this content volume.
- Introduces a new local file format and directory to maintain that has no other purpose in the app.

### Option 3: In app admin editor

Build a real authenticated screen (web, most likely) where the owner can write, edit, and publish articles directly in the app, backed by normal authenticated mutations.

**Pros**:
- Best editing experience: a real rich text or markdown preview, no raw SQL or table editor needed.
- Sets up infrastructure a future multi contributor content model could reuse.

**Cons**:
- Meaningful build effort (auth gated routes, a new write API, an editor UI) for a need that is, today, one person occasionally writing five kinds of articles.
- Nothing in the current product has an admin surface at all; this would be the first, a new pattern to secure and maintain for a single user's convenience.

## Decision

**Chosen option**: Option 1: Offline script + Supabase Studio review

Draft generation is a local script (mirroring `classify-ingredients.ts`/`translate-catalog.ts`), and review/publish happens by editing the row directly in Supabase Studio.

## Rationale

The team is one person with no content tooling today, and the project already has a proven, working pattern for exactly this shape of work (spec 0020, spec 0022): a local script calls Haiku with structured output, writes to Postgres, the owner reviews. Reusing it costs almost nothing to build and behaves exactly as the owner already expects from the other two AI assisted pipelines in this codebase.

Option 3 (an in app editor) solves a problem the project doesn't have yet: multiple contributors, or an editing experience Supabase Studio genuinely can't provide. Building it now would be the first admin surface in the app, adding real auth and API surface to maintain for a workflow that runs a few times a week at most. Option 2 is workable but adds a second script and a new file format for a marginal editing improvement; if raw markdown in Studio ever proves too painful in practice, moving to file based review is a cheap follow up, not a blocked path.

## Feature design

**Data model sketch**:

`learn_articles` (no foreign keys, standalone table):

| Field | Type | Nullable | Notes |
|---|---|---|---|
| `id` | uuid | not null (PK) | `default gen_random_uuid()` |
| `title` | text | not null | |
| `category` | enum (`tools`, `spirits`, `wine`, `beer`, `other`) | not null | fixed set, matches `ingredients.category`'s enum pattern (spec 0022) |
| `body_markdown` | text | not null | the article content |
| `status` | enum (`draft`, `published`, `archived`) | not null, default `draft` | controls visibility; no separate soft delete |
| `source_topic` | text | nullable | the topic prompt given to Haiku, kept for audit/regeneration |
| `created_at` | timestamptz | not null, default `now()` | |
| `updated_at` | timestamptz | not null, default `now()` | maintained by the existing `set_updated_at` trigger function |
| `published_at` | timestamptz | nullable | set when `status` moves to `published` |

No slug column: the URL slug is computed the same way recipe slugs are (`slugify(title) + '-' + id`, see `packages/shared/src/seo.ts`), so no extra column or sync to keep consistent.

**State transitions**:

`draft` → `published` → `archived` (and back), all transitions made manually by editing the row; no in app trigger for any transition.

**API surface**:

| Endpoint | Method | Key inputs | Key outputs | Auth | Key errors |
|---|---|---|---|---|---|
| `learn_articles` (PostgREST, list) | GET | `category` (eq filter), `status=eq.published` | `id`, `title`, `category`, `published_at` | public (RLS scoped) | empty array if none |
| `learn_articles` (PostgREST, detail) | GET | `id` (eq filter), `category` (eq filter), `status=eq.published` | `id`, `title`, `category`, `body_markdown`, `published_at` | public (RLS scoped) | empty result → render not found |

No dedicated Postgres function: this is a plain filtered table read, unlike search/recommendations which need ranking logic. RLS enforces the `published` only visibility, so the client filter is a courtesy, not the security boundary.

**Value sourcing**:

| Action | Value produced / displayed | Source |
|---|---|---|
| Learn landing (AC-1) | the 5 category tiles | a fixed client side constant list (`tools`, `spirits`, `wine`, `beer`, `other`), not queried, since it must render even with zero content |
| Category list (AC-2) | which category to filter by | the `category` route param (web `learn/[category]/page.tsx`, mobile route param), validated against the fixed enum; an invalid value renders not found (AC-5) |
| Article detail (AC-3) | which article to show | the `id` parsed out of the slug in the URL, via the same `extractIdFromRecipeSlug`-style helper used for recipes (spec 0011); the read also filters on the `category` route param, and a match where the found row's category differs from the URL's category renders not found (AC-5), so a valid id under the wrong category never silently renders |
| Article detail (AC-3) | rendered body | `body_markdown` column, rendered through a markdown component (see Configuration/library note below) |
| Generation script (AC-7) | `title`, `category`, `source_topic` | CLI arguments passed by the owner when running the script |
| Generation script (AC-7) | `body_markdown` | the Haiku response, via `messages.parse()` with a zod schema, mirroring `ingredientClassification.ts`'s structured output pattern; the schema constrains shape (300 to 800 words, starts with an `##` subheading, no top level `#` heading since the title renders separately from `title`), so the first generated article doesn't become an accidental, undocumented format standard |

**Key invariants**:
- A row is visible to any client read only when `status = 'published'`; enforced by RLS, not just application filtering.
- `category` is always one of the five fixed values; enforced by a Postgres enum or check constraint, not just application validation.
- `published_at` is set automatically, not by the owner's hand: a `BEFORE UPDATE` trigger sets it to `now()` the first time `status` transitions to `published` (only when it is still `null`, so it always reflects "first published", not the most recent edit). This also fixes the list ordering below: without it, a forgotten manual edit would leave a published row with a null `published_at`, silently missing from any `published_at` ordered list.
- The category list (AC-2) orders by `published_at desc, id` for a stable, deterministic order; there is no manual curation of order in this feature (would need a `sort_order` column, not part of this data model).

**Security model**:
- Public read: anyone, including a guest with no Supabase session, can `select` rows where `status = 'published'`. Matches the existing `recipes` table's public read RLS shape.
- No client write: no `insert`/`update`/`delete` RLS policy for any role reachable from the apps. The generation script and any manual edit use the service role key (same as the other offline scripts), which bypasses RLS by design.
- No bartender mode gating, no auth requirement, no role model: Learn is general audience content, unrelated to the Service/bartender mode feature (spec 0023).

**Configuration required**:
- No new environment variables for the app: the generation script reuses the existing `ANTHROPIC_API_KEY` and `SUPABASE_SERVICE_ROLE_KEY` pattern already required by `classify-ingredients.ts`/`translate-catalog.ts`.
- New dependency: a markdown rendering library for web and mobile (none is installed today). Recommend `react-markdown` on web (the de facto standard for React, no `dangerouslySetInnerHTML`, works cleanly with Next.js Server Components) and `react-native-markdown-display` on mobile (the commonly used renderer for Expo/React Native, supports the same `StyleSheet` based theming the app already uses elsewhere). Both render plain markdown only; no HTML pass through, since the source is always Haiku generated or owner edited text, never user input.
- Web route revalidation: the three Learn routes (`learn`, `learn/[category]`, `learn/[category]/[slug]`) use `export const revalidate = 60` (a short revalidation window), not the default static/indefinite caching. Content here changes rarely but a de-published (archived) article must stop rendering within a bounded time, not indefinitely from a stale build; 60 seconds is cheap for this traffic volume and matches how quickly a manual unpublish should take effect.

**Critical test scenarios**:
- Happy path: a guest opens Learn, taps Spirits, opens a published article, and reads the rendered body, verifies **AC-1**, **AC-2**, **AC-3**, **AC-6**.
- Failure case: a user navigates directly to a `draft` article's URL (guessed or stale link) and gets a not found state, not the content, verifies **AC-4**, **AC-5**.
- Generation: running the script twice with the same title produces two distinct draft rows, neither overwriting the other, verifies **AC-7**, **AC-8**.

## Build plan

Per the project's Tracer Bullet approach (root `AGENTS.md`), this ships as one thin end to end thread (schema → one real generated article → both apps reading it) before adding any polish.

1. Migration: `learn_articles` table (all columns above), the `category`/`status` enums or check constraints, the public-read-published RLS policy, and wiring the existing `set_updated_at` trigger onto `updated_at`, satisfies **AC-4**, **AC-6**, **AC-9**
2. Regenerate shared TypeScript types (`packages/shared/src/database.types.ts`) from the live schema, satisfies **AC-1** through **AC-9** (typed reads/writes)
3. Generation script `packages/shared/scripts/generate-learn-article.ts`: CLI args for title/category/topic, Haiku call via `messages.parse()` with a zod schema for the markdown body, insert as `status = 'draft'`, satisfies **AC-7**, **AC-8**
4. Shared `packages/shared/src/learnArticles.ts`: fetch functions for the category list read and the single article read (both filtered to `published`), plus the slug helper reusing `packages/shared/src/seo.ts`'s pattern, satisfies **AC-1** through **AC-6**
5. Add `react-markdown` (web) and `react-native-markdown-display` (mobile) dependencies
6. Web: `Learn` nav entry in `site-nav.tsx`'s `navLinks`; `apps/web/src/app/[locale]/learn/page.tsx` (category grid), `apps/web/src/app/[locale]/learn/[category]/page.tsx` (article list, not found on an invalid category), `apps/web/src/app/[locale]/learn/[category]/[slug]/page.tsx` (article detail, not found on unknown/unpublished id), satisfies **AC-1** through **AC-6**
7. Mobile: `Learn` tab entry in `app-tabs.tsx`'s `NativeTabs`; `apps/mobile/src/app/learn/index.tsx` (category grid), `apps/mobile/src/app/learn/[category]/index.tsx` (article list), `apps/mobile/src/app/learn/[category]/[id].tsx` (article detail, navigated by bare `id`, not the web's SEO slug, since mobile has no public URL/indexing need), satisfies **AC-1** through **AC-6**
8. Run the generation script for a first real article in each category (or at least one to prove the pipe end to end), review and publish it manually in Supabase Studio, confirm it renders correctly on both apps, satisfies **AC-1** through **AC-9** end to end

## Consequences

**Positive**:
- Adds real educational content to the app at very low ongoing cost (one script run per article, review time only).
- Reuses two already proven patterns (offline Haiku generation, direct-in-Studio review) instead of inventing a third content workflow.
- The fixed category enum keeps the nav and landing grid stable and predictable as content grows.

**Negative / tradeoffs**:
- Editing markdown in Supabase Studio's table editor is plain text, not a rich preview; proofreading a long article there is somewhat clunky.
- No audit log of who edited what or when beyond `updated_at`; acceptable for a single owner, would need revisiting with more than one reviewer.
- Every article needs a manual publish step; there is no way to schedule or batch publish from inside the app.

**Neutral**:
- Two new markdown rendering dependencies (one per app), the first content of this shape in the codebase.
- `learn_articles` is a genuinely standalone table (no foreign keys into it), so it adds no coupling risk to the existing recipe/pantry schema.

## Follow-up

- [ ] If Learn should support Spanish (matching spec 0020), add a `learn_article_translations` table later, mirroring `recipe_translations`; deferred here since the English content itself is still new and unproven.
- [ ] If Supabase Studio's plain text editing proves too painful in practice, revisit Option 2 (local file review) as a lighter upgrade than a full admin UI.
- [ ] Learn quizzes (already queued in scope as feature 29) depends on this feature's published content and its `category`/`id` shape; no action needed now, just a forward pointer.
