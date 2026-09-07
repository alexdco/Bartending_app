# Scope: Bartending App

A recipe and pantry app for home bartenders: search cocktail recipes with instructions and images, track what is in your pantry, get drink ideas from what you already have, and browse popular drinks by region. Sign in is optional; guests get the full experience on device, signing in adds sync across devices.

**Build approach:** Tracer Bullet (prove the whole pipe works end to end with one thin real thread, then thicken it one segment at a time).
**Workflow:** Beta (after /develop: `/check verify`, then `/test`). The project default level of rigor. `/architect` is the recommended first stop for a feature with a real decision, but skippable when you already know the build. Any feature can carry its own tag (e.g. `· GA`) to do more or less.

_These are recommendations to keep your build orderly, not requirements. Skip anything that does not fit: if you already know how to build a feature, use `/develop` and skip `/architect`. You decide when a feature is `done`._

## At a glance

| # | Feature | Phase | Status |
|---|---------|-------|--------|
| 1 | Stack & architecture | Foundation | done |
| 2 | Coding standards & tooling | Foundation | in-progress |
| 3 | Data model | Foundation | in-progress |
| 4 | Design system & UI foundation | Foundation | in-progress |
| 5 | Recipe search and detail (core loop) | Slice 1 | in-progress |
| 6 | Guest pantry | Slice 2 | in-progress |
| 7 | Drink ideas from pantry | Slice 3 | planned |
| 8 | AI generated pantry drink ideas | Slice 4 | planned |
| 9 | Sign in and cross device sync | Slice 5 | planned |
| 10 | Recipe recommendations | Slice 6 | planned |
| 11 | Popular drinks by region | Slice 7 | planned |
| 12 | SEO for public recipe pages | Slice 8 | planned |
| 13 | Privacy policy and cookie consent | Slice 9 | planned |
| 14 | Basic product analytics | Slice 10 | planned |

## Foundations

### 1. Stack & architecture · done
Decide the stack for a product spanning mobile and web from one backend (recipe data source, mobile framework, web framework, API layer, hosting), then scaffold a runnable project so every later slice builds on real structure.
**Done when:** the stack is recorded in a spec and the empty scaffold boots locally (mobile and web) and passes build.
- [x] Decide the stack (spec): `/architect stack & architecture`
- [x] Scaffold from the decision: `/develop stack & architecture`
- [x] Smoke check it runs: `/test`
Spec [0001](../specs/0001-stack-and-architecture.md) · code in `apps/web`, `apps/mobile`, `packages/shared`

### 2. Coding standards & tooling
Capture conventions, then install lint, format, and pre-commit enforcement from the real scaffolded project.
**Done when:** root `AGENTS.md` reflects the real stack, and lint/format/pre-commit run clean.
- [x] Capture conventions + tooling choices: `/audit`
- [x] Install the tooling: `/develop tooling`
- [ ] Check it runs clean: `/test`
code in root `package.json`, `turbo.json`, `.prettierrc.json`, `.husky/`, plus per-package `eslint.config.*` and `typecheck` scripts

### 3. Data model
Core entities every feature builds on: recipes, ingredients, pantry items, users (optional accounts), favorites, regions/tags. Recipes and ingredient reference data are sourced from a public cocktail API and cached locally.
**Done when:** entities and relationships support search, pantry, generation, favorites, and region filtering without a breaking migration.
- [x] Design it (spec): `/architect data model`
- [x] Build it: `/develop data model` — applied to the live Supabase project `BartendingAppWeb` (ctuzjhhpnkkhooneporu) via the Supabase MCP server
  - [x] Migration, indexes, and RLS policies for all seven tables (recipes, ingredients, recipe_ingredients, tags, recipe_tags, pantry_items, favorites), satisfies AC-1, AC-2, AC-3, AC-5, AC-6, AC-7 — applied from `supabase/migrations/20260906202328_core_data_model.sql`; a follow up migration (`20260907000343_harden_search_path_and_extension_schema.sql`) pinned the `set_updated_at` function's search_path and moved `pg_trgm` into an `extensions` schema, clearing both security advisories
  - [x] Full text and trigram search indexes for recipe/ingredient search, satisfies AC-1 — applied in the same migration
  - [x] Generated TypeScript types in `packages/shared`, satisfies AC-1 through AC-5 — regenerated for real in `packages/shared/src/database.types.ts` from the live schema via the Supabase MCP type generator
  - [x] Import job (upsert, transactional, reconciliation via `deleted_at`), satisfies AC-6 — run twice against the live project (426 recipes, 293 ingredients, 60 tags, 1662 recipe_ingredients, 635 recipe_tags both times, confirming idempotent reimport); a within-recipe ingredient/tag name collision (two source names normalizing to the same canonical row) was hit on the first run and fixed in `20260907001512_import_catalog_dedupe_join_rows.sql` (`on conflict (recipe_id, ingredient_id) / (recipe_id, tag_id) do nothing`)
- [x] Verify it: `/check verify data model` — PASS. All 7 ACs met live against BartendingAppWeb; reconciliation (AC-6) exercised end to end (soft delete + restore via real reimport); RLS/grants (AC-7) confirmed via live policy introspection. `region` browsing (part of AC-5) has no data yet, expected per spec's own Follow-up (tagging method deferred to the recipe search and detail feature).
- [ ] Test it: `/test data model`
Spec [0002](../specs/0002-data-model.md) · code in `supabase/migrations`, `packages/shared/src/database.types.ts`, `packages/import-job`

### 4. Design system & UI foundation
Visual language, layout primitives, and base components shared by mobile and web so recipe cards, pantry chips, and detail pages feel cohesive and accessible (WCAG AA).
**Done when:** `design.md` covers type/color/spacing/components, and base components handle focus and keyboard on web and touch targets on mobile.
- [x] Design it (spec): `/architect design system & UI foundation`
- [x] Build it: `/develop design system & UI foundation`
  - [x] Write `docs/design/design.md` (tokens, typefaces, spacing, radii) and its automated WCAG contrast test in `packages/shared` (`tokens.test.ts`, 16 pairs, all passing), satisfies AC-2, AC-5, AC-6
  - [x] Shared TypeScript token module in `packages/shared` (`tokens.ts`: semantic color/spacing/type/radii tokens, both themes), satisfies AC-1
  - [x] Wire tokens into web (Tailwind v4 + generated `@theme` block, CSS variables, `prefers-color-scheme`, Fraunces/Inter via `next/font`) and mobile (`useTheme()` hook over `Appearance`, replacing the scaffold `theme.ts`/`global.css`; a `LegacyColors`/`useLegacyTheme()` shim keeps the pre-existing Expo starter screens compiling untouched), satisfies AC-1, AC-2
  - [x] Build the core component set (Button, Text, Card, Chip, Input, Spinner, EmptyState) on both platforms; web uses native elements plus Radix `Toggle` for Chip (a native `<button>` needs no Radix wrapper), mobile via `StyleSheet` with accessibility props and 44×44 minimum hit targets, satisfies AC-3, AC-4
  - [x] Document the finished component inventory (real props, states, bases) in `docs/design/design.md`, satisfies AC-6
- [x] Verify it: `/check verify design system & UI foundation` — PASS. All 6 ACs met with live evidence (fresh typecheck/lint/test/build, a temporary live render of all 7 components on web and mobile). Mobile's full on-device visual/touch confirmation wasn't possible (no simulator in this environment); confirmed via compiled bundle content instead.
- [ ] Test it: `/test design system & UI foundation`
Spec [0003](../specs/0003-design-system-ui-foundation/index.md) · code in `packages/shared`, `apps/web`, `apps/mobile`, `docs/design/design.md`

## Slice 1: Recipe search and detail (core loop)

### 5. Recipe search and detail (core loop)
The thinnest real thread through the whole product: a user (signed in or guest) searches cocktail recipes by name or ingredient, sees results with images, and opens a detail page with full instructions and image. Works on mobile and web against the real recipe data source. No pantry, no generation, no accounts yet.
**Done when:** a user can search, see image backed results, open a detail page with instructions, and it works on both mobile and web against real data.
- [x] Design it (spec): `/architect recipe search and detail`
- [x] Build it: `/develop recipe search and detail`
  - [x] `search_recipes` Postgres function (union search, ranking, pagination, soft delete exclusion) plus regenerated shared types, satisfies AC-1, AC-2, AC-3, AC-5
  - [x] Web image config (`next.config.ts` TheCocktailDB domain), satisfies AC-6
  - [x] Shared query layer (`searchRecipes`/`useRecipeDetail` TanStack Query hooks) and `RecipeCard`/`RecipeDetailHeader` components on spec 0003's design system, satisfies AC-1 through AC-8
  - [x] Web search page (`/`) and detail page (`/recipes/[id]`), satisfies AC-1 through AC-8
  - [x] Mobile Search tab and detail screen (pushed via Expo Router), satisfies AC-1 through AC-8
  - [x] Cross platform parity check (same query, same live data, both platforms), satisfies AC-9
- [ ] Verify it: `/check verify recipe search and detail`
- [ ] Test it: `/test recipe search and detail`
Spec [0004](../specs/0004-recipe-search-and-detail/index.md) · code in `supabase/migrations`, `packages/shared`, `apps/web`, `apps/mobile`

## Slice 2: Guest pantry

### 6. Guest pantry
A pantry list a user (guest or signed in) can add and remove ingredients from, stored on device. This is the segment the generator and recommendations later depend on.
**Done when:** a user can add, remove, and view pantry ingredients, and it persists across app restarts on device.
- [x] Design it (spec): `/architect guest pantry`
- [x] Build it: `/develop guest pantry`
  - [x] Anonymous session bootstrap on both platforms (`ensureAnonymousSession`, persisted storage, wired into mobile `_layout.tsx` and web `providers.tsx`), satisfies AC-10
  - [x] `search_ingredients` Postgres function plus the shared `pantry.ts` fetch/add/remove layer, satisfies AC-1, AC-2, AC-9
  - [x] Shared TanStack Query hooks with optimistic update and rollback, satisfies AC-6, AC-7, AC-8
  - [x] Dedicated pantry screen/page (mobile and web) with the ingredient search picker and empty state, satisfies AC-1, AC-2, AC-3
  - [x] Recipe detail inline add and "already in pantry" marker, plus cross platform parity check, satisfies AC-4, AC-5
- [ ] Verify it: `/check verify guest pantry`
- [ ] Test it: `/test guest pantry`
Spec [0005](../specs/0005-guest-pantry.md) · code in `packages/shared`, `apps/web`, `apps/mobile`, `supabase/migrations`

## Slice 3: Drink ideas from pantry

### 7. Drink ideas from pantry
Filters the existing recipe library down to drinks the user can make now (or is close to making) with what is in their pantry.
**Done when:** given pantry contents, the user sees a list of matching or near matching real recipes, ranked by fewest missing ingredients.
- [ ] Design it (spec): `/architect drink ideas from pantry`

## Slice 4: AI generated pantry drink ideas

### 8. AI generated pantry drink ideas
On top of the recipe matching, offer an AI generated novel drink idea from the pantry contents when no strong existing match is found (or as an extra option).
**Done when:** a user can request a generated idea from their pantry and receives a plausible, safely worded original recipe with ingredients and steps, clearly labeled as generated.
- [ ] Design it (spec): `/architect AI generated pantry drink ideas`

## Slice 5: Sign in and cross device sync

### 9. Sign in and cross device sync
Optional sign in. Guests keep full functionality on device; signing in syncs pantry, favorites, and preferences to the account and across devices.
**Done when:** a signed out user retains full guest functionality; a signed in user's pantry and favorites sync across two devices.
- [ ] Design it (spec): `/architect sign in and cross device sync`

## Slice 6: Recipe recommendations

### 10. Recipe recommendations
Simple rules based "you may also like" suggestions using pantry contents, favorites, and recently viewed recipes (shared ingredients/tags), working for guests via local activity too.
**Done when:** a user sees a suggestions section that changes based on their pantry, favorites, and recent views, with a sane default when there is no activity yet.
- [ ] Design it (spec): `/architect recipe recommendations`

## Slice 7: Popular drinks by region

### 11. Popular drinks by region
A browsable section of popular drinks, curated per region using recipe source data and tagging, with a region filter.
**Done when:** a user can browse a popular drinks list and filter it by region, and results are real curated recipes with images.
- [ ] Design it (spec): `/architect popular drinks by region`

## Slice 8: SEO for public recipe pages

### 12. SEO for public recipe pages
Public recipe and popular drinks pages on web get metadata, clean URLs, and structured data so they are discoverable via search engines.
**Done when:** public recipe pages have unique titles/descriptions, structured data for recipes, a sitemap, and clean shareable URLs.
- [ ] Design it (spec): `/architect SEO for public recipe pages`

## Slice 9: Privacy policy and cookie consent

### 13. Privacy policy and cookie consent
A privacy policy page and cookie/consent notice for the web app, covering account data and analytics collection.
**Done when:** the privacy policy is published and linked from the app, and a consent notice appears before non essential tracking runs.
- [ ] Design it (spec): `/architect privacy policy and cookie consent`

## Slice 10: Basic product analytics

### 14. Basic product analytics
Track core activation events (search performed, pantry item added, drink idea generated, recipe favorited) to measure whether users complete a core action.
**Done when:** activation events fire for the core actions and are visible in an analytics dashboard, for both guest and signed in users.
- [ ] Design it (spec): `/architect basic product analytics`

## Deferred
Out of scope for the current build pass, kept so the plan stays honest.
- **Multi language / internationalization**: translate the app into additional languages · needs a decision
- **Ads or subscription monetization**: no monetization in this build pass; revisit once there is usage · needs a decision
- **User submitted recipes**: community recipe submission and moderation · needs a decision
- **ML/collaborative recommendations**: usage based recommendation model once there is a real user base · needs a decision

## Legend

**The decision box.** Every feature carries exactly one, the sub-task whose label ends with `(spec)`. Its wording varies, so skills locate it by that `(spec)` suffix, never by an exact label. Every other box is an execution box and `/architect` never ticks one.

**Feature lifecycle**: the scope updates as a feature moves; each row is what it shows and who sets it:

| State | Set by | The feature shows |
|---|---|---|
| `planned` · needs a decision | `/scope` | one box: `Design it (spec): /architect <feature>` |
| `in-progress` (designed) | **`/architect` at spec capture** | `Design it` ticked; spec linked; `Build it: /develop <feature>` + **2 to 5 milestones**; the tier's closing boxes (`Verify it`, `Test it`); any surfaced follow-up enrolled |
| `in-progress` (building) | `/develop` | milestone sub-boxes tick one by one; code pointer filled |
| `in-progress` (verified) | `/check verify` | `Build it` + milestones ticked; `Verify it` ticked |
| `done` | **you, when you decide it is** (any skill sets it when you say so); `/sync` reconciles | boxes you ran ticked, skipped ones marked skipped; Beta's last stage (after `/test`) is the suggested point to call it done; `/sync` captures conventions |

- **Next step** = the first unticked box (always a command or a tracked milestone).
- **needs a decision** = run `/architect` first; otherwise straight to `/develop` (or `/audit` for standards & tooling). The tag drops once the spec is captured.
- **Atomic build tasks live in the spec's `## Build plan`, not here**: the scope carries only the milestone rollup.
- **Status** `planned` → `in-progress` → `done`, plus `existing` (pre-workflow) and `dropped` (de-scoped, kept for history).
- **Workflow** (header line) is the project default, what runs after `/develop`: **Beta** = `/check verify` then `/test`. A feature built on an unratified decision (an `Assumed` spec) stays flagged, but that never blocks `done`.
- **Pointer line** (`spec <n> · code in <path>`): the spec link added by `/architect`, the code path by `/develop`.
