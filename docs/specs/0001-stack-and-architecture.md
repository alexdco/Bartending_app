# 0001. Stack and architecture for the bartending app

**Date**: 2026-09-06
**Status**: Accepted

## Summary

This decision sets the whole technical foundation for the bartending app: separate native mobile apps (iOS and Android) built with React Native (via Expo, for easier native tooling), a separate Next.js web app for the public recipe pages and browsing, and one shared Supabase backend (a hosted service that bundles a database, sign in, and file storage) behind both, all inside one shared repository (a monorepo) so non UI logic is written once. Drink recipes come from TheCocktailDB, a ready made public cocktail database, imported once into our own database rather than called live on every request. Everything below builds on this stack, so getting it right now avoids a costly rebuild later.

## Context

The product is a recipe and pantry app for home bartenders: search cocktail recipes with images and instructions, keep a pantry of ingredients on hand, get drink ideas (both matched from real recipes and AI generated) from that pantry, browse popular drinks with a region filter, and optionally sign in for cross device sync. It targets both mobile (iOS and Android) and a public facing web app, at small team or solo scale, with no fixed deadline or budget ceiling and no regulatory compliance scope beyond ordinary account data and basic privacy practice.

The main forces at play: the product needs a working recipe library on day one (nobody wants an empty cocktail app), the web app carries real SEO weight since recipe pages are a natural organic growth channel, the pantry must work for guests with no account and later sync once someone signs in, and the team explicitly chose to build native mobile and web as two separate codebases rather than one shared cross platform codebase, trading build effort for per platform experience and flexibility. The AI generated drink idea feature also needs an AI provider and a real cost profile, since it runs on every request rather than once at build time.

## Requirements

**User stories**:
- As an engineer, I want a decided, coherent stack so every later feature spec builds on real structure instead of re litigating tooling.
- As a home bartender, I want the app to work smoothly on my phone and to find recipes easily on the web, whichever I open first.

**Acceptance criteria** (the contract; this is a decision only spec, so these describe the scaffold, not app features):
- **AC-1**: A runnable React Native (Expo) project exists for mobile (iOS and Android) with React Navigation, TanStack Query, and the EAS build tooling wired in.
- **AC-2**: A runnable Next.js project exists for web, deployed to the chosen host, serving a placeholder page.
- **AC-3**: The Supabase project is provisioned with the chosen database, auth (including anonymous sign in), and storage enabled, and both the mobile and web apps can read a health check value from it.
- **AC-4**: Lint, format, and type checking run clean on both the mobile and web projects (captured further in the Coding standards & tooling feature, not repeated here).
- **AC-5**: TheCocktailDB's catalog is imported into our own normalized Postgres tables (recipes, ingredients, and the join between them), not called live from the clients.

## Options considered

### Option 1: Native mobile (React Native) + separate Next.js web + Supabase backend

Two separate client codebases, mobile and web, both talking to one shared Supabase backend for data, auth, and storage. This is the option the engineer chose during the stack walk.

**Pros**:
- Each client is free to use the UI idioms and libraries best suited to its platform, since they are not constrained by a shared abstraction layer.
- Next.js on web gives full control over server rendering for SEO, which a shared cross platform framework's web output does not always match as cleanly.
- Supabase as one shared backend still means the data model, auth, and business rules are written once regardless of how many clients exist.

**Cons**:
- Two client codebases to build and maintain instead of one; any UI feature (like the pantry or drink search) is designed and built twice.
- No shared UI component code between mobile and web, so consistency between them takes deliberate design system work rather than shared code.
- A small team feels this cost most directly, since it roughly doubles the client side surface area to maintain over time.

### Option 2: Shared cross platform framework (React Native + Expo, with a web build) + Supabase backend

One largely shared codebase (React Native via Expo, using tools like Next.js plus a code sharing layer) targets mobile and web together, cutting duplicate UI work.

**Pros**:
- Most UI and business logic is written once and shared across mobile and web, which is meaningfully faster for a small team.
- Still pairs with the same Supabase backend, so this option differs only at the client layer.

**Cons**:
- The web output of a shared cross platform framework is typically less SEO optimized out of the box than a purpose built Next.js app, which cuts against the app's SEO goal for public recipe pages.
- Per platform polish (native feeling gestures, platform specific patterns) takes more deliberate work to achieve than with fully separate native built clients.

**This option is the runner up.** It was surfaced as the recommended default during the stack walk; the engineer explicitly chose Option 1 (separate codebases) for more per platform control and flexibility, accepting the extra build cost.

## Decision

**Chosen option**: Option 1: Native mobile (React Native) + separate Next.js web + Supabase backend, refined into a shared logic monorepo

Build the mobile apps in React Native via Expo, the web app in Next.js, each with its own independent UI, but inside one shared repository (a monorepo) with a shared package for types, the Supabase client, and the pantry matching logic, so that non UI logic is written once. Both talk to one shared Supabase backend for data, auth, and file storage. TheCocktailDB is imported once into our own Postgres tables as the recipe data source, and Anthropic's Claude Haiku model generates AI drink ideas from a user's pantry.

**Implementation skills**: `supabase-postgres-best-practices` (`supabase/agent-skills`, `.agents/skills/supabase-postgres-best-practices/`) · `react-native-best-practices` (`callstackincubator/agent-skills`, `.agents/skills/react-native-best-practices/`) · `nextjs-app-router-patterns` (`wshobson/agents`, `.agents/skills/nextjs-app-router-patterns/`)

## Rationale

The engineer's own priority, stated directly during the stack walk, was per platform control and flexibility over build speed, which is exactly the tradeoff Option 1 makes explicit: two codebases in exchange for each client being free of a shared abstraction layer's constraints. Given the web app's SEO requirement for public recipe pages (a stated cross cutting goal from product scoping), a purpose built Next.js app is also the safer choice for that specific requirement than a shared framework's web output, which reinforces rather than fights the engineer's pick.

Supabase over a custom built API server or Firebase follows from two already made calls: the team chose a BaaS (managed backend) over hand rolling auth and storage, and chose a relational (Postgres) database over a document store, specifically because recipes, ingredients, pantry items, and regions have real relational structure (a recipe has many ingredients; a pantry belongs to a user). Supabase is the mainstream BaaS built directly on Postgres, so it satisfies both prior decisions at once without a mismatch. TheCocktailDB is the only mature, low cost, commercially licensed cocktail recipe API surfaced in current research, so building or licensing an alternative recipe source would add cost and delay with no compensating benefit at this stage.

A cross check of this spec found the original "two fully separate codebases" framing overstated its own cost: TheCocktailDB has no region field and no real popularity signal, so both the popular drinks by region feature and pantry matching against its 15 unnormalized ingredient text fields need our own imported, normalized copy of the data anyway (see the Proposed stack and Consequences below). Once that import exists, the strongest argument against sharing logic (that a shared cross platform framework's web output hurts SEO) no longer forces fully duplicated logic too: a monorepo with one shared package for types, the Supabase client, and the matching algorithm keeps every UI decision (React Native for mobile, Next.js for web) exactly as chosen, while removing the "every feature built twice" cost the original Cons list named. This is a refinement of Option 1, not a switch to Option 2: the two client UIs remain fully separate.

Expo (managed, with a dev client) replaces the original "bare React Native" pick because the reason bare was chosen, keeping native module access open, no longer requires giving up Expo's tooling: a custom dev client plus config plugins gives the same native access while adding free over the air updates and removing friction against the already chosen EAS build pipeline.

## Feature design

Not applicable in the usual sense; this is an ARCHITECTURE decision spec, so the "feature design" is the stack itself, recorded below in `## Proposed stack`. Several design points are pinned here because they are foundational (a later feature spec would otherwise have to invent them):

**Recipe data ingestion**: TheCocktailDB is not called live from the clients. A one time (then periodically refreshed) import job pulls its full catalog into our own Postgres tables: `recipes`, `ingredients` (canonicalized, since TheCocktailDB's 15 flat ingredient text fields per recipe are inconsistently named), and a `recipe_ingredients` join table. This is what makes pantry matching, full text search, and the region and popularity feature below possible, and it removes TheCocktailDB's uptime as a dependency for every user request, only the periodic import job depends on it. Before building the importer, confirm TheCocktailDB's commercial license permits bulk caching of its data (see Follow-up).

**Region and popularity are our own data, not TheCocktailDB's**: TheCocktailDB has no region field and no real popularity ranking (its "popular" endpoint returns fixed sample data, not live rankings). The imported `recipes` table gets its own `region` column, populated by hand or LLM assisted tagging during import, and "popularity" is computed from our own Postgres counters (view counts, favorite counts) once the app has real usage, not sourced from the third party API at all.

**Guest sessions and the pantry**: every guest gets a real Supabase anonymous session from first launch (Supabase Auth supports this natively), rather than a local only, account less mode. The pantry (`pantry_items`, keyed by `user_id` and `ingredient_id`) is a normal row owned by that anonymous user from the start. Signing in later is an identity link on the same session, not a data migration: the user's `user_id` stays the same, so their pantry is already in the right place with no upload or merge step. Row level security policies scope every pantry read and write to `auth.uid()`, with an explicit check that blocks anonymous users from writing to tables they should not touch. An anonymous user idle for more than 30 days is a candidate for a scheduled cleanup job, so guest accounts do not accumulate forever.

**AI drink generation call path and safety**: the mobile and web clients never call the Anthropic API directly (that would expose the API key in client code). Instead, a Supabase Edge Function receives the pantry contents and requires a valid Supabase session (anonymous sessions included, since guests can use this feature too). The function looks up and increments a per user daily quota row in Postgres in the same transaction before calling the model (a small limit for anonymous users, a larger one for signed in users), rejecting the call once the quota is spent. The prompt takes a list of canonical ingredient IDs from our own imported ingredients table, never free text, which also closes off prompt injection through pantry contents. `max_tokens` is capped, the output follows a strict schema, and the response is labeled in the UI as AI generated. The Anthropic account carries a hard spend limit and a budget alert as a backstop. Generations are cached by a hash of the sorted pantry ingredient set, since repeat pantries are common and this cuts cost directly.

**Value sourcing**: not applicable in the usual per action sense, since this is a foundational decision, not a feature with acceptance criteria that display data. The one runtime value worth naming here because it is easy to get wrong: the AI generation quota count is sourced from a Postgres row keyed by `user_id` (anonymous or signed in), never from client provided state, so a client cannot bypass its own limit by resetting local state.

## Proposed stack

| Layer | Choice | Reason |
|---|---|---|
| Repository layout | One monorepo (e.g. managed with pnpm workspaces and Turborepo) | Keeps the mobile app, web app, and a shared package (types, the Supabase client, pantry matching logic) in one place, so non UI logic and generated database types are written once and stay in sync across both clients. |
| Mobile framework | React Native via Expo (managed, with a custom dev client) | One codebase per native platform pair (iOS + Android); Expo's managed workflow with a dev client keeps full native module access (through config plugins) while adding free over the air updates and pairing cleanly with the already chosen EAS build pipeline. |
| Mobile navigation | React Navigation | The standard, most maintained navigation library for React Native, with native stack and bottom tab navigators covering this app's screen flow. |
| Mobile/web data fetching | TanStack Query | Handles server state (recipes, pantry data) with the same caching model on both mobile and web, keeping client behavior consistent across the two codebases. |
| Web framework | Next.js (App Router) | Server rendering and static generation make public recipe pages genuinely SEO indexable, which a client only rendered app cannot do without extra work. |
| Backend | Supabase | One managed platform bundling Postgres, auth (including anonymous sessions), row level security, file storage, and edge functions, matching the team's BaaS and relational database choices at once. |
| Primary database | PostgreSQL (via Supabase) | Recipes, ingredients, pantry items, and regions have clear relational structure; Postgres also supports the JSON columns and full text search this app's tagging and search needs, once the recipe catalog is imported (see Feature design). |
| Local storage (mobile pantry) | Expo SQLite (or AsyncStorage) as a thin local cache, Postgres as the source of truth | The pantry is a small, single writer list of ingredient IDs; a hand written cache plus a real anonymous Supabase session (see Feature design) is enough, avoiding a heavier sync framework for a low complexity problem. |
| Auth | Supabase Auth, anonymous sessions from first launch | Every guest gets a real (anonymous) session immediately; signing in later links an identity to the same session rather than migrating data, which removes an entire class of merge and conflict bugs. |
| Recipe data source | TheCocktailDB, imported into our own Postgres tables | Mature, actively maintained public cocktail database with images, ingredients, and instructions; commercial use is a one time ten dollar license fee. Imported once (not called live) since it has no region or real popularity data of its own, and its per recipe ingredient fields need normalizing for pantry matching to work. |
| AI provider (drink generation) | Anthropic Claude, Haiku tier, called from a quota checked Supabase Edge Function | A small, fast, inexpensive model tier is sufficient for a short creative recipe generation task; routing the call through an edge function with a per user quota keeps the API key off the client and bounds cost. |
| Web hosting | Vercel | Built specifically for Next.js: fast SEO friendly rendering, preview deploys, and edge middleware with minimal configuration. |
| Mobile build & release | Expo EAS Build and Submit | Handles iOS and Android signing, over the air updates, and app store submission without the team maintaining its own build machines or CI signing setup. |
| Observability | Sentry | One tool with SDKs across React Native, Next.js, and Supabase Edge Functions, giving unified error and crash reporting across every part of the stack from one dashboard. |

## Consequences

**Positive**:
- Each client (mobile, web) keeps its own UI free to use the idioms best suited to its platform, while the monorepo's shared package means data types, the Supabase client, and the pantry matching logic are each written once.
- Anonymous sessions from first launch mean signing in never requires a pantry migration or merge step; the data was already in the right place.
- The relational data model and Supabase's row level security give a solid, well understood security foundation for pantry and account data from day one.
- Importing TheCocktailDB into our own tables means the app has a populated, normalized recipe library immediately, with search and pantry matching that do not depend on a third party API staying up.

**Negative / tradeoffs**:
- Building and maintaining two client UIs (mobile, web) still costs more engineering time than one shared UI codebase would, for every screen going forward, even with shared non UI logic.
- The team now depends on a third party recipe data source (TheCocktailDB) for the initial import; if it ever shuts down or changes licensing terms, refreshing or replacing the catalog becomes a real project (though the app keeps working on its own already imported copy in the meantime).
- Running Supabase, Vercel, and Expo EAS together means three separate billing relationships and dashboards to operate, instead of one.
- Region tagging and popularity ranking are now the team's own data to create and maintain (by hand or LLM assisted tagging at first), rather than something a third party API supplies for free.

**Neutral**:
- The recipe import job (TheCocktailDB into Postgres) is a new pattern the team has not built yet, and needs a periodic refresh strategy once shipped.
- Routing AI generation through a quota checked Supabase Edge Function is a new pattern (serverless function, per user rate limiting, external AI API) the team has not used yet in this codebase.
- Anonymous Supabase users accumulate over time and count toward billing; a periodic cleanup job for long idle anonymous accounts becomes necessary once real usage exists.

## Follow-up

- [ ] Provision the Supabase project, TheCocktailDB commercial API key, and Anthropic API key as real accounts/credentials before scaffolding begins.
- [ ] Confirm TheCocktailDB's commercial license permits bulk importing and caching its catalog in our own database, not only live per request calls, before building the import job.
- [ ] Connect the Supabase MCP server (its connection is a user configuration step in the agent's MCP settings) so later specs and builds can inspect the real database schema directly.
- [ ] Decide the recipe import job's refresh schedule and how region tags are produced (hand curated vs LLM assisted) in the recipe search and detail feature's own spec; this spec only fixes that the data is imported and owned by us, not the operational detail.
- [ ] Decide the specific per user AI generation quota numbers (e.g. daily limits for anonymous vs signed in users) in the AI generated pantry drink ideas feature's own spec; this spec only fixes that a quota, enforced server side, must exist.
- [ ] Age gate / content warning for an alcohol focused app: confirm app store policy requirements (e.g. a 17+ rating or an age gate) before submission; this can block release if missed.

## References

**Project sources**:
- The scope's Build approach and Workflow header (`docs/scope/scope.md`), which set Tracer Bullet and Beta as this project's defaults.
- The engineer's own stack walk answers: separate native mobile and web, BaaS backend, relational database, local first offline pantry, TheCocktailDB, Supabase, Claude Haiku, Vercel, EAS, and Sentry.

**Practices & standards**:
- Monolith and boring technology first: a managed BaaS and proven frameworks over custom infrastructure, for a small team's operational reality.
- Server side API keys: routing the AI provider call through a server side function rather than the client, standard practice for any API key that must not be exposed publicly.

**Links** (web verified):
- TheCocktailDB API docs: https://www.thecocktaildb.com/api.php
- Anthropic Claude pricing: https://platform.claude.com/docs/en/about-claude/pricing
