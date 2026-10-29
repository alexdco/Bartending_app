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
| 3 | Data model | Foundation | done |
| 4 | Design system & UI foundation | Foundation | done |
| 5 | Recipe search and detail (core loop) | Slice 1 | in-progress |
| 6 | Guest pantry | Slice 2 | in-progress |
| 7 | Drink ideas from pantry | Slice 3 | in-progress |
| 8 | AI generated pantry drink ideas | Slice 4 | in-progress |
| 9 | Sign in and cross device sync | Slice 5 | in-progress |
| 10 | Recipe recommendations | Slice 6 | in-progress |
| 11 | Popular drinks by region | Slice 7 | in-progress |
| 12 | SEO for public recipe pages | Slice 8 | in-progress |
| 13 | Privacy policy and cookie consent | Slice 9 | in-progress |
| 14 | Basic product analytics | Slice 10 | in-progress |
| 15 | Recipe favoriting | Slice 11 | in-progress |
| 16 | Idle anonymous account cleanup job | Slice 12 | in-progress |
| 17 | Personalized homepage | Slice 13 | in-progress |
| 18 | Green and charcoal rebrand | Foundation | in-progress |
| 19 | User profile and nav badge | Slice 14 | in-progress |
| 20 | Sentry error monitoring | Slice 15 | planned |
| 21 | Cron job run monitoring | Slice 16 | planned |
| 22 | Mobile friendly collapsible nav | Slice 14 | in-progress |
| 23 | Multi language support | Slice 17 | in-progress |
| 24 | Recipe ingredient unit conversion | Slice 18 | in-progress |
| 25 | Batch cocktail conversion | Slice 19 | in-progress |
| 26 | Bartender Mode | Slice 20 | in-progress |
| 27 | Recipe rating | Slice 21 | in-progress |
| 28 | Learn section | Slice 22 | done |
| 29 | Learn quizzes | Slice 23 | in-progress |
| 30 | Recipe comments | Slice 24 | done |
| 31 | Comment moderation admin UI | Slice 25 | in-progress |
| 32 | Admin recipe management | Slice 26 | in-progress |
| 33 | Shopping list | Slice 27 | in-progress |
| 34 | Recipe comment photos | Slice 28 | in-progress |
| 35 | Admin privilege escalation fix | Hardening | in-progress |
| 36 | Privacy page crash and real contact | Hardening | planned |
| 37 | Production site URL, canonicals, and crawl rules | Hardening | done |
| 38 | Locale aware links | Hardening | in-progress |
| 39 | Learn article accuracy pass | Hardening | in-progress |
| 40 | AI quota abuse via anonymous sessions | Hardening | in-progress |
| 41 | Finish Spanish UI translation | Hardening | in-progress |
| 42 | Batch calculator correctness | Hardening | in-progress |
| 43 | Shopping list follow ups | Hardening | done |
| 44 | Recipe catalog cleanup | Hardening | in-progress |
| 45 | Brand, metadata, and launch readiness | Hardening | in-progress |
| 46 | Empty states, UX polish, and accessibility | Hardening | in-progress |
| 47 | Recipe page performance | Hardening | in-progress |
| 48 | Repo hygiene | Hardening | in-progress |
| 49 | EAS build and submit setup | Hardening | in-progress |
| 50 | Self hosted recipe images | Hardening | done |
| 51 | Quiz answer source links | Slice 23 | in-progress |

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

### 3. Data model · done
Core entities every feature builds on: recipes, ingredients, pantry items, users (optional accounts), favorites, regions/tags. Recipes and ingredient reference data are sourced from a public cocktail API and cached locally.
**Done when:** entities and relationships support search, pantry, generation, favorites, and region filtering without a breaking migration.
- [x] Design it (spec): `/architect data model`
- [x] Build it: `/develop data model` — applied to the live Supabase project `BartendingAppWeb` (ctuzjhhpnkkhooneporu) via the Supabase MCP server
  - [x] Migration, indexes, and RLS policies for all seven tables (recipes, ingredients, recipe_ingredients, tags, recipe_tags, pantry_items, favorites), satisfies AC-1, AC-2, AC-3, AC-5, AC-6, AC-7 — applied from `supabase/migrations/20260906202328_core_data_model.sql`; a follow up migration (`20260907000343_harden_search_path_and_extension_schema.sql`) pinned the `set_updated_at` function's search_path and moved `pg_trgm` into an `extensions` schema, clearing both security advisories
  - [x] Full text and trigram search indexes for recipe/ingredient search, satisfies AC-1 — applied in the same migration
  - [x] Generated TypeScript types in `packages/shared`, satisfies AC-1 through AC-5 — regenerated for real in `packages/shared/src/database.types.ts` from the live schema via the Supabase MCP type generator
  - [x] Import job (upsert, transactional, reconciliation via `deleted_at`), satisfies AC-6 — run twice against the live project (426 recipes, 293 ingredients, 60 tags, 1662 recipe_ingredients, 635 recipe_tags both times, confirming idempotent reimport); a within-recipe ingredient/tag name collision (two source names normalizing to the same canonical row) was hit on the first run and fixed in `20260907001512_import_catalog_dedupe_join_rows.sql` (`on conflict (recipe_id, ingredient_id) / (recipe_id, tag_id) do nothing`)
- [x] Verify it: `/check verify data model` — PASS. All 7 ACs met live against BartendingAppWeb; reconciliation (AC-6) exercised end to end (soft delete + restore via real reimport); RLS/grants (AC-7) confirmed via live policy introspection. `region` browsing (part of AC-5) has no data yet, expected per spec's own Follow-up (tagging method deferred to the recipe search and detail feature).
- [x] Test it: `/test data model` — 26 vitest tests in `packages/import-job/src/{transform,theCocktailDb}.test.ts` (AC-1, AC-5, AC-6 import side); AC-4 already covered by `packages/shared/src/pantryMatching.test.ts`; DB side AC-2/3/6/7 stay verified live (no local Postgres harness)
Spec [0002](../specs/0002-data-model.md) · code in `supabase/migrations`, `packages/shared/src/database.types.ts`, `packages/import-job`

### 4. Design system & UI foundation · done
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
- [x] Test it: `/test design system & UI foundation` — 25 new vitest tests: `packages/shared/src/contrastRatio.test.ts` (WCAG math, AC-5), `tokens.test.ts` extended (theme key parity, hex validity, pair parity, scale ordering; AC-1, AC-2, AC-5), `apps/web/src/app/theme.generated.test.ts` (generated CSS matches tokens: dark default, light media query, `data-theme` overrides, `@theme` exposure; AC-1, AC-2). Components and theme hooks not covered, since there's no jsdom/Testing Library or React Native test setup yet
Spec [0003](../specs/0003-design-system-ui-foundation/index.md) · code in `packages/shared`, `apps/web`, `apps/mobile`, `docs/design/design.md`

### 18. Green and charcoal rebrand
Replaces the dark amber and copper "cocktail bar" palette from feature 4 with a dark charcoal and green palette, matching a reference screenshot; also grows Card corner radius and switches Chip's selected state to a solid accent fill. Colors only: font, spacing, and structure are unchanged.
**Done when:** both themes in `packages/shared/src/tokens.ts` use the new palette, the WCAG contrast test still passes, Card and Chip reflect the new radius/fill, `docs/design/design.md` is updated, and no screen in either app still shows the old amber/copper colors.
- [x] Design it (spec): `/architect green and charcoal rebrand`
- [x] Build it: `/develop green and charcoal rebrand`
  - [x] Replace dark/light color token values in `packages/shared/src/tokens.ts` and confirm the WCAG contrast test still passes, satisfies AC-1, AC-2, AC-3 — all 16 `verifiedContrastPairs` pass (`pnpm test`)
  - [x] Update Card radius and Chip selected fill on both web and mobile, satisfies AC-4 — Card now uses `radius.large` on both platforms; web Chip's selected state already used a solid `color.accent` fill (Radix `data-[state=on]`), mobile Chip's selected state already used `theme.accent`/`theme.accentText`, so both were already compliant once the token values changed
  - [x] Update `docs/design/design.md`'s palette and component notes, satisfies AC-5
  - [x] Visual pass (via source search, not a live render) over the repo for leftover amber/copper hex values, satisfies AC-6 — none found outside the regenerated `apps/web/src/app/theme.generated.css` (rebuilt via `pnpm --filter web generate-theme`) and stale `.next/` build cache (regenerates on next build); a live on-screen check in both apps still hasn't been done in this environment
- [ ] Verify it: `/check verify green and charcoal rebrand`
- [ ] Test it: `/test green and charcoal rebrand`
Spec [0014](../specs/0014-green-charcoal-rebrand/index.md) · code in `packages/shared`, `apps/web`, `apps/mobile`, `docs/design/design.md`

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
- [ ] Verify it: `/check verify recipe search and detail` · last run 2026-10-26: BLOCKED (web passes every AC including AC-5; mobile steps and AC-9 parity still need an emulator or phone)
  - [x] Fix AC-5 ranking: `/debug recipe search ranking`. Applied live 2026-10-26; checked: "margarita" returns Margarita first, "gin" returns Gin names first. `search_recipes` gives every full text name match the same `ts_rank`, so ties fall to A to Z and "House Margarita" outranks "Margarita" (same for "gin"). Fix written as `supabase/migrations/20261010140000_search_recipes_rank_fix.sql` (length normalized `ts_rank`, trigram fallback moved to its own bucket after full text) and verified against live data with a read only query; apply it in the SQL editor, then rerun `/check verify`
- [x] Test it: `/test recipe search and detail` — closed on a layout only change to `RecipeDetailHeader` (centered `max-w-3xl` hero, `sizes` hint corrected to 768px); no new tests, since class names and image hints aren't durable assertions and `apps/web` has no component test setup yet
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
- [x] Design it (spec): `/architect drink ideas from pantry`
- [x] Build it: `/develop drink ideas from pantry`
  - [x] `match_recipes_to_pantry` Postgres function (one ranked, paginated list at or under the near match cutoff, short recipe floor exception, session required), satisfies AC-1, AC-2, AC-3, AC-6, AC-7, AC-9 — applied to the live Supabase project `BartendingAppWeb` (ctuzjhhpnkkhooneporu) via `supabase/migrations/20260907133100_match_recipes_to_pantry_function.sql`; security advisor clean, verified live (no-session 28000 error, missing-count-exception qualifying a 0.5 ratio recipe)
  - [x] Extend spec 0005's pantry mutation hooks to also invalidate the drink ideas query key, satisfies AC-5 — both apps' `use-pantry-mutations.ts`
  - [x] Shared `drinkIdeas.ts` fetch function in `packages/shared`, plus a `useDrinkIdeas()` infinite query hook per app (web and mobile, matching the existing per-app hook pattern used by `useRecipeSearch`, since shared has no React dependency), satisfies AC-1, AC-2, AC-3, AC-8
  - [x] `RecipeCard` missing ingredients prop, satisfies AC-2 — both apps' `recipe-card.tsx`, using a shared `formatMissingIngredients` truncation helper
  - [x] Dedicated drink ideas screen/page (mobile and web), client side section split, empty state, and retryable error state, satisfies AC-1 through AC-4, AC-6, AC-8 — `apps/web/src/app/drink-ideas/page.tsx` (+ nav link) and `apps/mobile/src/app/drink-ideas.tsx` (+ tab entry)
  - [x] Cross platform parity check — both apps share identical query keys, page size/cutoff constants, and section split logic via the same `fetchDrinkIdeaMatches`
- [ ] Verify it: `/check verify drink ideas from pantry`
- [ ] Test it: `/test drink ideas from pantry`
Spec [0006](../specs/0006-drink-ideas-from-pantry/index.md) · code in `packages/shared`, `apps/web`, `apps/mobile`, `supabase/migrations`

## Slice 4: AI generated pantry drink ideas

### 8. AI generated pantry drink ideas
On top of the recipe matching, offer an AI generated novel drink idea from the pantry contents when no strong existing match is found (or as an extra option).
**Done when:** a user can request a generated idea from their pantry and receives a plausible, safely worded original recipe with ingredients and steps, clearly labeled as generated.
- [x] Design it (spec): `/architect AI generated pantry drink ideas`
- [x] Build it: `/develop AI generated pantry drink ideas`
  - [x] `ai_generation_quota` migration (no client RLS policy, atomic reservation), satisfies AC-4, AC-8 — applied to the live Supabase project `BartendingAppWeb` (ctuzjhhpnkkhooneporu) via `supabase/migrations/20260907145247_ai_generation_quota.sql` and `supabase/migrations/20260907145830_reserve_ai_generation_quota_function.sql` (atomic reservation function); verified live (two-of-two-then-reject test against a temporary user, cleaned up), security advisor clean (only the expected `rls_enabled_no_policy` info lint, by design)
  - [x] `generate-drink-idea` Supabase Edge Function (auth check, pantry read, quota reservation, Claude Haiku call via `messages.parse()`, pantry verification, retry/error handling, Sentry), satisfies AC-1, AC-4, AC-6, AC-7, AC-8 — `supabase/functions/generate-drink-idea/index.ts`, deployed and ACTIVE on the live project; `ANTHROPIC_API_KEY` (and optional `SENTRY_DSN`) must still be set as Edge Function secrets by the engineer (no MCP tool available here to set secrets; the CLI needs an interactive `supabase login` this environment can't do)
  - [x] Shared `generateDrinkIdea.ts` fetch wrapper in `packages/shared`, satisfies AC-1, AC-6, AC-7 — `packages/shared/src/generateDrinkIdea.ts`, exported from `packages/shared/src/index.ts`
  - [x] Generate action and result card on the drink ideas page (spec 0006), both apps, satisfies AC-1 through AC-4, AC-6, AC-7 — web: `apps/web/src/drink-ideas/{use-generate-drink-idea.ts,generated-recipe-card.tsx}` wired into `drink-ideas-page-client.tsx`; mobile: `apps/mobile/src/drink-ideas/{use-generate-drink-idea.ts,generated-recipe-card.tsx}` wired into `apps/mobile/src/app/drink-ideas.tsx`
  - [x] Cross platform parity check — both apps share the same `generateDrinkIdea` fetch wrapper, the same minimum pantry gate, and the same error-reason-to-message mapping
- [ ] Verify it: `/check verify AI generated pantry drink ideas`
- [ ] Test it: `/test AI generated pantry drink ideas`
Spec [0007](../specs/0007-ai-generated-pantry-drink-ideas/index.md) · code in `packages/shared`, `apps/web`, `apps/mobile`, `supabase/functions`, `supabase/migrations`

## Slice 5: Sign in and cross device sync

### 9. Sign in and cross device sync
Optional sign in. Guests keep full functionality on device; signing in syncs pantry, favorites, and preferences to the account and across devices.
**Done when:** a signed out user retains full guest functionality; a signed in user's pantry and favorites sync across two devices.
- [x] Design it (spec): `/architect sign in and cross device sync`
- [x] Build it: `/develop sign in and cross device sync`
  - [x] `user_preferences` migration and RLS policies, satisfies AC-9 — applied live via `supabase/migrations/20260907201908_user_preferences.sql`; security advisor clean
  - [x] Shared `auth.ts` (sign up/in/out, password reset, change email) and `preferences.ts` in `packages/shared`, satisfies AC-1 through AC-3, AC-5 through AC-8
  - [x] `delete-account` Edge Function and shared wrapper, satisfies AC-10 — `supabase/functions/delete-account/index.ts`, deployed and ACTIVE
  - [x] Account/profile screen or page (mobile and web) and the shared auth callback route (email confirmation, password reset, email change), satisfies AC-1, AC-2, AC-4 through AC-6, AC-8, AC-10, AC-11 — engineer still needs to configure the web callback URL and mobile custom scheme as allowed redirect URLs in the Supabase Auth dashboard (no MCP tool exposes this setting)
  - [x] Session expiry handling and cross platform parity check, satisfies AC-7, AC-11, AC-12
- [ ] Verify it: `/check verify sign in and cross device sync`
- [ ] Test it: `/test sign in and cross device sync`
Spec [0008](../specs/0008-sign-in-and-cross-device-sync/index.md) · code in `packages/shared`, `apps/web`, `apps/mobile`, `supabase/functions`, `supabase/migrations`

## Slice 6: Recipe recommendations

### 10. Recipe recommendations
Simple rules based "you may also like" suggestions using pantry contents and recently viewed recipes (shared ingredients), working for guests via local activity too. Favorites was dropped from this revision's signal set since favoriting doesn't exist in the app yet; see spec 0009's Follow-up.
**Done when:** a user sees a suggestions section on the recipe detail page that changes based on their pantry and recent views, with a stable default when there is no activity yet.
- [x] Design it (spec): `/architect recipe recommendations`
- [x] Build it: `/develop recipe recommendations`
  - [x] `recommend_recipes` Postgres function (weighted ingredient overlap scoring, stable name ordered fallback, offset pagination) plus regenerated shared types, satisfies AC-1, AC-2, AC-3, AC-8, AC-9 — applied to the live Supabase project `BartendingAppWeb` (ctuzjhhpnkkhooneporu) via `supabase/migrations/20260907210000_recommend_recipes_function.sql`; security advisor clean; verified live (pantry-only scoring, cold-start name-ordered fallback, recent-view-only scoring, malformed/duplicate/unknown/soft-deleted `recent_recipe_ids` silently ignored, no-session 28000 error, zero soft-deleted leakage)
  - [x] Local recently viewed tracking (shared pure `appendRecentlyViewed` helper + per app storage adapter) wired into recipe detail, satisfies AC-6 — `packages/shared/src/recentlyViewed.ts`, `apps/web/src/recipes/recently-viewed-storage.ts` (localStorage), `apps/mobile/src/recipes/recently-viewed-storage.ts` (AsyncStorage)
  - [x] Shared `recommendations.ts` fetch function and `useRecipeRecommendations()` hook (web + mobile), satisfies AC-1, AC-4, AC-7 — `packages/shared/src/recommendations.ts`, `apps/web/src/recipe-recommendations/use-recipe-recommendations.ts`, `apps/mobile/src/recipe-recommendations/use-recipe-recommendations.ts`
  - [x] Extend pantry mutation hooks to invalidate the recommendations query, satisfies AC-5 — both apps' `use-pantry-mutations.ts`
  - [x] "You may also like" section on the recipe detail page (web + mobile) with a "See more" action to a dedicated full page/screen and retryable error state, satisfies AC-1, AC-4, AC-7 — web: `apps/web/src/recipe-recommendations/{recommendations-section.tsx,more-like-this-client.tsx}` + `apps/web/src/app/recipes/[slug]/more-like-this/page.tsx` (relocated from `[id]` to `[slug]` by spec 0011's SEO slugged URLs); mobile: `apps/mobile/src/recipe-recommendations/recommendations-section.tsx` + `apps/mobile/src/app/recipe/[id]/more-like-this.tsx` (detail screen relocated to `apps/mobile/src/app/recipe/[id]/index.tsx` to coexist with the new nested route)
  - [x] Cross platform parity check — both apps share identical query key shape, page size/cap constants, and byte-identical pantry mutation invalidation
- [ ] Verify it: `/check verify recipe recommendations`
- [ ] Test it: `/test recipe recommendations`
Spec [0009](../specs/0009-recipe-recommendations/index.md) · code in `packages/shared`, `apps/web`, `apps/mobile`, `supabase/migrations`

## Slice 7: Popular drinks by region

### 11. Popular drinks by region
A browsable section of popular drinks, curated per region using recipe source data and tagging, with a region filter.
**Done when:** a user can browse a popular drinks list and filter it by region, and results are real curated recipes with images.
- [x] Design it (spec): `/architect popular drinks by region`
- [ ] Build it: `/develop popular drinks by region`
  - [ ] Migration applied live (`region` check constraint, `fame_score`, `popularity_rank`, the partial unique index); the one time tagging + apply scripts are written (`packages/shared/scripts/{tag-regions,apply-regions}.ts`) but not yet run against the live catalog, needs `ANTHROPIC_API_KEY` run locally by the engineer, satisfies AC-3, AC-7
  - [x] `popular_recipes_by_region` and `list_popular_regions` Postgres functions plus regenerated shared types, satisfies AC-1, AC-2, AC-3
  - [x] Shared `packages/shared/src/popularByRegion.ts` fetch layer and per app TanStack Query hooks, satisfies AC-1, AC-5, AC-6
  - [x] Web `/popular` page and mobile `Popular` tab (region picker, ranked list reusing `RecipeCard`, loading/error/empty states), satisfies AC-1 through AC-5
  - [x] Cross platform parity check, satisfies AC-6
- [ ] Verify it: `/check verify popular drinks by region`
- [ ] Test it: `/test popular drinks by region`
Spec [0010](../specs/0010-popular-drinks-by-region/index.md) · code in `supabase/migrations`, `packages/shared`, `apps/web`, `apps/mobile`

## Slice 8: SEO for public recipe pages

### 12. SEO for public recipe pages
Public recipe and popular drinks pages on web get metadata, clean URLs, and structured data so they are discoverable via search engines.
**Done when:** public recipe pages have unique titles/descriptions, structured data for recipes, a sitemap, and clean shareable URLs.
- [x] Design it (spec): `/architect SEO for public recipe pages`
- [x] Build it: `/develop SEO for public recipe pages`
  - [x] Site base URL config + slug and region-matching helpers, satisfies AC-3, AC-5, AC-6, AC-9 — `NEXT_PUBLIC_SITE_URL` in `apps/web/.env.local`, `metadataBase` on the root layout, `packages/shared/src/seo.ts` (`slugify`, `buildRecipeSlugPath`, `extractIdFromRecipeSlug`, `matchRegionSlug`, `absoluteUrl`), `apps/web/src/lib/site-url.ts`
  - [x] Recipe detail metadata, JSON-LD, and slugged URL with legacy redirect, satisfies AC-1, AC-2, AC-3 — `apps/web/src/app/recipes/[slug]/page.tsx` (moved from `[id]`; a bare or mis-slugged id 308s to the canonical slug via the same route), `apps/web/src/recipes/recipe-json-ld.ts`; verified live (unique title, valid Recipe JSON-LD, 308 from bare UUID to slugged canonical, 404 on unknown/deleted id)
  - [x] Search page dynamic metadata + noindex on query pages, satisfies AC-4 — `apps/web/src/app/page.tsx` `generateMetadata` reading the `q` search param; `apps/web/src/recipes/search-page-client.tsx` now syncs `q` into the URL via `router.replace` (it previously held the query only in local state, a gap the spec assumed already existed); verified live (`?q=margarita` renders a "margarita recipes" title with `noindex, follow`, bare `/` stays indexable)
  - [x] Popular page server rendering, per-region routes, and redirects, satisfies AC-5, AC-6 — `apps/web/src/app/popular/page.tsx` (redirects to the first region, or an empty state when none are tagged yet) and `apps/web/src/app/popular/[region]/page.tsx` (server rendered, per-region metadata, `notFound()` on an unmatched slug); replaces the old client only `popular-page-client.tsx`/`use-popular-by-region.ts` (removed). Region redirect/404 paths verified via the `seo.ts` slug/match logic directly (unit level), not live: no region has been tagged against the catalog yet (feature 11's tagging script hasn't been run), so `listPopularRegions()` returns empty in this environment
  - [x] Sitemap and robots, satisfies AC-7, AC-8 — `apps/web/src/app/sitemap.ts` (every non deleted recipe's slugged URL, home, real region URLs), `apps/web/src/app/robots.ts` (disallows `/account`, `/auth`, `/pantry`); verified live
- [x] Verify it: `/check verify SEO for public recipe pages`
- [ ] Test it: `/test SEO for public recipe pages`
Spec [0011](../specs/0011-seo-for-public-recipe-pages/index.md) · code in `apps/web`, `packages/shared`

## Slice 9: Privacy policy and cookie consent

### 13. Privacy policy and cookie consent
A privacy policy page and cookie/consent notice for the web app, covering account data and analytics collection.
**Done when:** the privacy policy is published and linked from the app, and a consent notice appears before non essential tracking runs.
- [x] Design it (spec): `/architect privacy policy and cookie consent`
- [x] Build it: `/develop privacy policy and cookie consent`
  - [x] Shared privacy policy URL constant + `/privacy` page content (data categories, effective date, contact, account deletion reference), satisfies AC-1, AC-2, AC-3, AC-5
  - [x] Web site footer with a `/privacy` link, satisfies AC-4
  - [x] Cookie consent notice bar (client component + localStorage helper), satisfies AC-6, AC-7, AC-8, AC-9
  - [x] Mobile account screen "Privacy Policy" row via `ExternalLink`, plus cross platform check, satisfies AC-5
- [ ] Verify it: `/check verify privacy policy and cookie consent`
- [ ] Test it: `/test privacy policy and cookie consent`
Spec [0012](../specs/0012-privacy-policy-and-cookie-consent/index.md) · code in `packages/shared/src/seo.ts`, `apps/web/src/app/privacy/`, `apps/web/src/components/site-footer.tsx`, `apps/web/src/consent/`, `apps/mobile/src/app/account.tsx`

## Slice 10: Basic product analytics

### 14. Basic product analytics
Track core activation events (search performed, pantry item added, drink idea generated) using PostHog, to measure whether users complete a core action. Recipe favoriting does not exist yet (spec 0009 deferred it), so its event is deferred too; see spec 0013's Follow-up.
**Done when:** activation events fire for the core actions and are visible in the PostHog dashboard, for both guest and signed in users.
- [x] Design it (spec): `/architect basic product analytics`
- [x] Build it: `/develop basic product analytics`
  - [x] Shared event builders, types, and unit test in `packages/shared`, plus each app's PostHog client module (init, no op fallback, `track()` wrapper), satisfies AC-5, AC-7, AC-8, AC-9 — `packages/shared/src/{analytics.ts,analytics.test.ts}`, `apps/web/src/analytics/posthog-client.ts`, `apps/mobile/src/analytics/posthog-client.ts`; no `PostHogProvider`/autocapture wiring used on either platform, so AC-7 holds by construction
  - [x] Web consent store wiring so PostHog only initializes after cookie notice acceptance, satisfies AC-4 — `apps/web/src/consent/consent-storage.ts` grew a subscriber list notified from `acceptCookieConsent()`; `apps/web/src/app/providers.tsx` subscribes and calls `initAnalyticsIfConsented`
  - [x] Identity establishment (`posthog.identify`) from each app's root, satisfies AC-6 — `apps/web/src/app/providers.tsx` and `apps/mobile/src/app/_layout.tsx`, each reading `useSession()` once and calling `identify(session.user.id)` guarded against re-firing the same id
  - [x] Event wiring: pantry add mutation, search page client, drink ideas page client (matched + AI paths, including the Edge Function's new `pantry_size` field), satisfies AC-1, AC-2, AC-3 — both apps' `use-pantry-mutations.ts` (`onSuccess`, not `onSettled`), `search-page-client.tsx`/`search.tsx` (last fired query ref), `drink-ideas-page-client.tsx`/`drink-ideas.tsx` (first page effect) and `use-generate-drink-idea.ts`; `supabase/functions/generate-drink-idea/index.ts` now returns `pantry_size`, mirrored in `packages/shared/src/generateDrinkIdea.ts`'s `GeneratedDrinkIdea` type
  - [x] Update spec 0012's consent notice copy and the `/privacy` page for the new PostHog data category, plus cross platform check — `apps/web/src/consent/consent-banner.tsx`, `apps/web/src/app/privacy/page.tsx`; both apps share identical event names/property shapes via the same shared builders (locked by the shared unit test), and `identify` fires once per app instance on both
- [ ] Verify it: `/check verify basic product analytics`
- [ ] Test it: `/test basic product analytics`
Spec [0013](../specs/0013-basic-product-analytics/index.md) · code in `packages/shared`, `apps/web`, `apps/mobile`, `supabase/functions`

## Slice 11: Recipe favoriting

### 15. Recipe favoriting
A toggle favorite control on the recipe card and detail page, backed by the existing `favorites` table from spec 0002. Surfaced repeatedly as a real gap: spec 0009 (recipe recommendations) dropped favorites from its signal set because this does not exist yet, and spec 0013 (basic product analytics) deferred a `recipe_favorited` event for the same reason.
**Done when:** a signed in or guest user can favorite and unfavorite a recipe from the card or detail page, see their favorites list, and it persists across sessions for signed in users.
- [x] Design it (spec): `/architect recipe favoriting`
- [x] Build it: `/develop recipe favoriting`
  - [x] `recommend_recipes` migration adding the favorited-recipes weighted signal (0.75) and the already-favorited exclusion, plus regenerated shared types, satisfies AC-7 — applied to the live Supabase project `BartendingAppWeb` (ctuzjhhpnkkhooneporu) via `supabase/migrations/20260909053700_recommend_recipes_favorites_signal.sql`; security advisor clean (only the pre-existing expected `ai_generation_quota` info lint); signature unchanged so no type regeneration was needed
  - [x] Shared `favorites.ts` fetch/add/remove/list layer in `packages/shared`, plus `isFavorited` added to `fetchRecipeDetail`, satisfies AC-1, AC-3, AC-4, AC-6, AC-10 — `packages/shared/src/favorites.ts`, `packages/shared/src/recipes.ts`
  - [x] Per app query/mutation hooks (`useFavoriteRecipeIds`, `useFavoriteRecipes`, `useToggleFavorite`) with optimistic update, silent rollback, and invalidation of the favorites and recommendations query keys, satisfies AC-2, AC-3, AC-5, AC-8 — both apps' `favorites/use-favorites.ts` and `favorites/use-favorite-mutations.ts`, mirroring `use-pantry-mutations.ts`'s pattern
  - [x] Favorite toggle on `RecipeCard` and the recipe detail page, plus the `recipe_favorited` analytics event on confirmed success, satisfies AC-1, AC-2, AC-9 — both apps' `recipe-card.tsx`/`recipe-detail-header.tsx`, a new `favorites/favorite-toggle.tsx` per app, `buildRecipeFavoritedEvent` in `packages/shared/src/analytics.ts` fired from each mutation's `onSuccess`
  - [x] Dedicated favorites list page/screen, paginated, with empty state, plus cross platform parity check, satisfies AC-4, AC-5, AC-1 through AC-10 — web `/favorites` (`apps/web/src/app/favorites/page.tsx` + nav link) and mobile `apps/mobile/src/app/favorites.tsx` (reachable from the account screen); both share byte identical query key shapes, page size constant (`FAVORITES_PAGE_SIZE` = `RECIPE_SEARCH_PAGE_SIZE`), and mutation behavior
- [ ] Verify it: `/check verify recipe favoriting`
- [ ] Test it: `/test recipe favoriting`
Spec [0015](../specs/0015-recipe-favoriting/index.md) · code in `packages/shared`, `apps/web`, `apps/mobile`, `supabase/migrations`

## Slice 12: Idle anonymous account cleanup job

### 16. Idle anonymous account cleanup job
A scheduled job that sweeps anonymous Supabase sessions idle past a retention window, per spec 0001's original design. Never built; spec 0008 (sign in and cross device sync) flagged that whenever this job is designed, it must explicitly exclude `linked` (non anonymous) users from the sweep.
**Done when:** idle anonymous sessions past the retention window are cleaned up on a schedule, and a linked user is never swept.
- [x] Design it (spec): `/architect idle anonymous account cleanup job`
- [x] Build it: `/develop idle anonymous account cleanup job`
  - [x] Enable `pg_cron`/`pg_net` and add the `select_idle_anonymous_accounts()`/`is_candidate_still_idle()` SQL functions, satisfies AC-1, AC-2, AC-2b, AC-4, AC-7b
  - [x] Register the weekly pg_cron job (Vault secret, `net.http_post` call), satisfies AC-3, AC-9
  - [x] `cleanup-anonymous-accounts` Edge Function (auth check, candidate log, per id re-check + delete, partial failure handling, Sentry), satisfies AC-5, AC-6, AC-7, AC-7b, AC-8, AC-9
  - [x] Deploy and confirm the scheduled job is registered live, satisfies AC-3
- [ ] Verify it: `/check verify idle anonymous account cleanup job`
- [ ] Test it: `/test idle anonymous account cleanup job`
Spec [0017](../specs/0017-idle-anonymous-account-cleanup-job/index.md) · code in `supabase/migrations`, `supabase/functions/cleanup-anonymous-accounts`

## Slice 13: Personalized homepage

### 17. Personalized homepage
Replaces the current search-first landing page (`/` on web, the default Search tab on mobile) with a browsable homepage of carousels (recommended drinks, recently viewed, drink ideas from pantry, popular by region), built on the existing recommendations, recently viewed, drink ideas, and popular-by-region data. Search moves to its own dedicated route/tab.
**Done when:** a user lands on a homepage with multiple scrollable carousels of real recipes drawn from their pantry and activity, a stable default for users with no activity yet, and search remains fully reachable from its own route/tab on both platforms.
- [x] Design it (spec): `/architect personalized homepage`
- [x] Build it: `/develop personalized homepage`
  - [x] Route split: web's new `/search` (carrying the current search experience, unconditionally `noindex`) plus the `/?q=` redirect, and web's `/` rewritten to a homepage shell; mobile's unused `explore` tab removed, `index` confirmed first/default, satisfies AC-8, AC-10, AC-11
  - [x] Shared horizontal carousel UI pattern (web CSS scroll snap row, mobile horizontal `FlatList`) plus the hero, satisfies AC-2, AC-8, AC-9
  - [x] Drink ideas carousel (zero-match call to action card, session-error retry banner) and the new `fetchRecipesByIds` shared function powering the recently viewed carousel, satisfies AC-1, AC-3, AC-4, AC-5, AC-9
  - [x] Recommended drinks carousel (homepage-scoped query, no "see more"), satisfies AC-1, AC-3, AC-9
  - [x] Region shortcut row and popular by region carousel, including mobile's new `region` route param on the Popular screen, satisfies AC-1, AC-3, AC-6, AC-7, AC-9, AC-13
  - [x] Guest/signed-in parity and cross platform parity check, satisfies AC-12
- [ ] Verify it: `/check verify personalized homepage`
- [ ] Test it: `/test personalized homepage`
Spec [0016](../specs/0016-personalized-homepage/index.md) · code in `packages/shared/src/{recipes.ts,homepage.ts}`, `apps/web/src/{app/page.tsx,app/search,homepage}`, `apps/mobile/src/{app/index.tsx,homepage}`

## Slice 14: User profile and nav badge

### 19. User profile and nav badge
Right now a signed in user has no visual sign that they are signed in. Add a real user profile (a name field, collected at sign up or added after) and show an initials badge in the top right corner of the nav on web and in a new thin header bar above the mobile tab bar, so sign in state is visible at a glance. The name lives as a new `display_name` column on the existing `user_preferences` table.
**Done when:** a signed in user's initials appear as a badge in the top right nav (web) and the mobile header bar, a guest sees a neutral state instead, and a name can be set and edited from the account page.
- [x] Design it (spec): `/architect user profile and nav badge`
- [x] Build it: `/develop user profile and nav badge`
  - [x] Data model and shared logic: migration for `display_name`, regenerated types, the shared initials algorithm, `avatarSize` token, and the column scoped save function, satisfies AC-1, AC-2, AC-6, AC-7, AC-10, AC-11 — applied live to `BartendingAppWeb` via `supabase/migrations/20260910120000_user_preferences_display_name.sql`; `packages/shared/src/{initials.ts,preferences.ts,tokens.ts}`
  - [x] Sign up flow: optional name field on sign up plus the non blocking post link save, satisfies AC-4 — `packages/shared/src/auth.ts` (`signUpWithPassword`), both apps' sign up forms
  - [x] Web: account page name field with live preview, and the nav badge in `site-nav.tsx`, satisfies AC-1 through AC-3, AC-5, AC-8, AC-9, AC-11
  - [x] Mobile: account screen name field with live preview, and the new header bar badge above the tab bar, satisfies AC-1 through AC-3, AC-5, AC-8, AC-9, AC-11 — `app-tabs.web.tsx` untouched (stale starter template, not the real app, per spec's own allowance)
  - [x] Cross platform parity check — both apps consume the same `getInitials`/`validateDisplayName`/`updateDisplayName`/`avatarSize` exports from `@bartendingapp/shared`
- [ ] Verify it: `/check verify user profile and nav badge`
- [ ] Test it: `/test user profile and nav badge`
Spec [0018](../specs/0018-user-profile-and-nav-badge/index.md) · code in `packages/shared`, `apps/web`, `apps/mobile`, `supabase/migrations`

### 22. Mobile friendly collapsible nav
The web nav (`apps/web/src/components/site-nav.tsx`) is one non wrapping flex row with no responsive behavior today. Below 768px, it collapses behind a hamburger toggle in the upper right that opens a Radix Dialog side drawer holding the nav links and the full account menu (Account, Theme, Sign out); desktop keeps today's inline layout unchanged. Adds a `breakpoints.mobileNav` and a `motion.drawerDurationMs` token to `packages/shared/src/tokens.ts`, wired into the web app's generated theme CSS. Mobile app is out of scope here; it already has its own tab bar (feature 19).
**Done when:** on a mobile viewport, the nav links and account menu collapse behind a single upper right toggle that opens and closes a side drawer with all current nav links and account content reachable and operable by keyboard/touch; on a desktop viewport, the nav is unchanged from today.
- [x] Design it (spec): `/architect mobile friendly collapsible nav`
- [x] Build it: `/develop mobile friendly collapsible nav`
  - [x] Add and wire the new breakpoint/motion tokens (`tokens.ts` plus `generate-theme-css.mjs`), satisfies AC-1, AC-2, AC-7
  - [x] Build the `MobileNavToggle`/`MobileNavDrawer` components (icon, aria labeling, drawer content with full account parity including Account, Theme, Sign out), satisfies AC-3, AC-4, AC-9
  - [x] Wire the `md:` visibility split and all drawer close behaviors (overlay, Escape, toggle, link click, route change), satisfies AC-1, AC-2, AC-5
  - [x] Add the resize `matchMedia` force close and the full height/scroll/animation styling, satisfies AC-6, AC-7
- [ ] Verify it: `/check verify mobile friendly collapsible nav`
- [ ] Test it: `/test mobile friendly collapsible nav`
Spec [0019](../specs/0019-mobile-friendly-collapsible-nav/index.md) · code in `packages/shared/src/tokens.ts`, `apps/web/scripts/generate-theme-css.mjs`, `apps/web/src/components/site-nav.tsx`, `apps/web/src/app/globals.css`

## Slice 15: Sentry error monitoring

### 20. Sentry error monitoring · needs a decision
Real Sentry install across web, mobile, and Supabase Edge Functions (the observability layer named in `AGENTS.md` but never built as its own feature). Spec 0007 left `SENTRY_DSN` as an optional secret an engineer still has to set; spec 0016 left recently viewed and homepage error paths logging via `console.error` with a `TODO` marker, waiting on this.
**Done when:** errors on web, mobile, and Edge Functions reach Sentry with useful context, the deferred `console.error` TODOs are swapped to `Sentry.captureException`, and `SENTRY_DSN` is a real configured secret rather than optional/unset.
- [ ] Design it (spec): `/architect sentry error monitoring`

## Slice 16: Cron job run monitoring

### 21. Cron job run monitoring · needs a decision
Alert if the idle anonymous account cleanup job (feature 16, spec 0017) silently stops firing, whether from a bad Vault secret or an unreachable function. Spec 0017 flagged this as a real gap but not required for its initial build, since per run Sentry reporting already covers the more likely failure mode of individual delete failures within a run that does fire.
**Done when:** a run that never fires in the expected window (not just a run that fires and fails) is flagged, whether via a periodic check or a Sentry cron monitor.
- [ ] Design it (spec): `/architect cron job run monitoring`

## Slice 17: Multi language support

### 23. Multi language support
Adds Spanish alongside English across web, mobile, and the recipe catalog itself: app chrome through standard i18n libraries, recipe/ingredient/tag content translated once via the existing Claude Haiku integration and cached in Postgres. Auto detects a user's language from device or browser, remembers a manual override, and never blocks on a missing translation (falls back to English).
**Done when:** a Spanish speaking user can browse, search, use pantry and drink ideas, and read recipe instructions entirely in Spanish, with English available as a stable fallback and no broken or blank content.
- [x] Design it (spec): `/architect multi language / internationalization`
- [x] Build it: `/develop multi language support`
  - [x] Data model: `recipe_translations`/`ingredient_translations`/`tag_translations`/`recipe_ingredient_translations`, `recipes_localized`/`ingredients_localized` views, `user_preferences.locale`, per locale search indexes, satisfies AC-6, AC-9, AC-13, AC-14, AC-15, AC-17
  - [x] UI i18n wiring: `next-intl` on web (`[locale]` routing) and `i18next`/`react-i18next`/`expo-localization` on mobile, satisfies AC-1, AC-3, AC-5
  - [x] Catalog translation pipeline: one-time backfill script plus the import job's ongoing translation step (hash gated), satisfies AC-9, AC-11, AC-17. Backfill script and import job wiring are done and typecheck/lint/build clean; the actual one-time run against the live catalog (427 recipes) is still pending, tracked in spec 0020 build plan step 3.
  - [x] Locale aware reads: search/browse/recommend/pantry-match functions, plus `fetch_recipe_detail`/`fetch_pantry_items`/`fetch_favorite_recipes`/`fetch_recipes_by_ids` RPC functions replacing the detail/pantry/favorites/homepage PostgREST embeds (the originally planned `recipes_localized`/`ingredients_localized` views were dropped, see spec 0020's Correction), satisfies AC-2, AC-6, AC-7, AC-13, AC-14
  - [x] Locale switch control, sign in merge behavior, and `generate-drink-idea`'s locale aware generation with corrected pantry verification, satisfies AC-4, AC-10, AC-16
  - [x] Locale aware recipe slugs, sitemap, and hreflang alternates, satisfies AC-8, AC-12
- [ ] Verify it: `/check verify multi language support`
- [ ] Test it: `/test multi language support`
Spec [0020](../specs/0020-multi-language-support/index.md) · code in `packages/shared`, `apps/web`, `apps/mobile`, `supabase/migrations`, `supabase/functions`

## Slice 18: Recipe ingredient unit conversion

### 24. Recipe ingredient unit conversion
On the recipe detail page, add a toggle so a user can switch how ingredient measurements are displayed, between oz, ml, and cl. Converted values round to the nearest tenth.
**Done when:** a user on a recipe detail page can toggle ingredient units between oz, ml, and cl, and every measured ingredient amount updates and rounds to the nearest tenth.
- [x] Design it (spec): [0021](../specs/0021-recipe-ingredient-unit-conversion/index.md)
- [x] Build it: /develop recipe ingredient unit conversion
  - [x] Schema migration (amount_value/amount_unit/amount_max_value on recipe_ingredients) plus the upsert conflict handling fix on both import paths, satisfies AC-5, AC-6 — applied live to BartendingAppWeb
  - [x] Measure parsing function, wired into both the TheCocktailDB and custom recipe import call sites, satisfies AC-3, AC-5, AC-6, AC-7
  - [x] Conversion and formatting functions in packages/shared (oz/ml/cl math, formatOunces, per locale unit labels), satisfies AC-2, AC-7
  - [x] Unit toggle UI on web and mobile ingredient lists, satisfies AC-1, AC-3, AC-4, AC-7
  - [x] Run the import job to populate existing recipes, satisfies AC-5 — run live (426 catalog recipes, 2 custom recipes; 841/1665 ingredient lines parsed)
- [x] Verify it: `/check verify recipe ingredient unit conversion` — PASS (web). Live browser driven (toggle click, ml/cl/oz values, unparseable line stays unchanged, Spanish locale), live schema and import job evidence. Mobile UI not exercised (no simulator/device in this environment); `units.ts` has no committed test file yet (`/test` to add).
- [ ] Test it: `/test recipe ingredient unit conversion`
Spec [0021](../specs/0021-recipe-ingredient-unit-conversion/index.md) · code in `supabase/migrations`, `packages/shared`, `packages/import-job`, `apps/web`, `apps/mobile`

## Slice 19: Batch cocktail conversion

### 25. Batch cocktail conversion
Given a recipe and a target number of servings, scale every ingredient into a batch quantity in oz, ml, or liters, with an optional dilution percentage (none/15/20/25/custom) and a choice of which ingredients to batch (everything, alcohol only, everything except citrus, or a custom ingredient selection). Displays total batch volume. Builds on feature 24's parsed ingredient amounts; adds a Haiku classified `category` column on `ingredients` to drive the alcohol/citrus presets.
**Done when:** a bartender can enter a serving count for any recipe, choose a batching scope and unit, optionally apply dilution, and see every batched ingredient amount plus total volume, rounded to bartender friendly values with no floating point display errors.
- [x] Design it (spec): [0022](../specs/0022-batch-cocktail-conversion/index.md)
- [ ] Build it: `/develop batch cocktail conversion`
  - [x] Ingredient category migration (`category` + hash gated `category_source_name_hash` on `ingredients`, `fetch_recipe_detail` extended) and classification (Haiku structured output call in `packages/shared/src/ingredientClassification.ts`, wired into both import call sites, plus the one time `classify-ingredients.ts` backfill script mirroring spec 0020's pattern), satisfies AC-4, AC-9 — applied live to `BartendingAppWeb` (ctuzjhhpnkkhooneporu) via `supabase/migrations/20260915000000_batch_cocktail_conversion.sql` and `20260915000100_ingredient_category_source_hash.sql`; security advisor clean (no new findings)
  - [x] Batch computation functions in `packages/shared/src/batch.ts` (scaling, scope/selection filtering, dilution, liter unit support, single-pass rounding from unrounded ml), satisfies AC-2, AC-3, AC-4, AC-6, AC-7, AC-8 — 15 unit tests covering every AC in `batch.test.ts`, all passing
  - [x] "Batch this recipe" panel on the recipe detail page, web (`apps/web/src/recipes/batch-panel.tsx`) and mobile (`apps/mobile/src/recipes/batch-panel.tsx`) (servings, scope, unit, dilution, flagged lines, total volume), satisfies AC-1, AC-3, AC-4, AC-5, AC-6, AC-7, AC-10
  - [ ] Run the classification backfill against the live catalog, satisfies AC-9 — script is written and typechecks (`pnpm classify-ingredients` in `packages/shared`) but not yet run: needs `ANTHROPIC_API_KEY`/`SUPABASE_SERVICE_ROLE_KEY` run locally by the engineer (no MCP tool exposes the real service role key in this environment)
- [ ] Verify it: `/check verify batch cocktail conversion`
- [ ] Test it: `/test batch cocktail conversion`
Spec [0022](../specs/0022-batch-cocktail-conversion/index.md) · code in `supabase/migrations`, `packages/shared`, `packages/import-job`, `apps/web`, `apps/mobile`

## Slice 20: Bartender Mode

### 26. Bartender Mode
A part of the app for working bartenders during a shift, with full parity on mobile and web: a shared "bar" (venue/team) that staff join with a real account, house recipes that override a catalog cocktail or stand alone, a curated current menu, and an out of stock (86'd) ingredient list any staff member can update. Adds ranked search with bartender shorthand ("old f" for Old Fashioned) and ingredient list matching ("gin campari vermouth" for Negroni), plus a distraction free "Quick Build Mode" screen (large type, high contrast, oz/ml/parts toggle, keep screen awake, offline tolerant) so a bartender can find the correct spec in about 2 to 3 seconds. Also fully usable by an independent bartender with no bar: search, Quick Build, and pinning work standalone, and the Service screen presents that as a complete workflow rather than an incomplete setup. Umbrella spec split into four child decisions: the bar data model, search, Quick Build Mode, and independent bartender mode. Mobile shipped first; web parity (the first three child specs, plus a browser equivalent for keep-awake and offline persistence) was added in a later spec revision.
**Done when:** an owner can create a bar and invite staff by email; house recipes, the current menu, and the 86 list stay in sync across every staff member; search resolves shorthand and ingredient list queries and ranks house/menu/pinned results first; Quick Build Mode renders a recipe in large, high contrast type with a working unit toggle, keep-awake option, and offline support that survives an app restart; and a bartender with no bar sees a working solo view rather than an empty state — all of the above on both mobile and web.
- [x] Design it (spec): `/architect bartender mode`
- [x] Build it: `/develop bartender mode` (all milestones below built, mobile and web)
  - [x] Bar data model (mobile): bars/bar_members/bar_invites/bar_recipes/bar_menu_items/bar_ingredient_stock/pinned_recipes schema, RLS (including the linked-account-only and `WITH CHECK` rules), and the Service tab shell with bar switcher and no-bar empty state, satisfies AC-1 through AC-10 (bar data model spec) — applied live to `BartendingAppWeb`
  - [x] House recipe creation, invite send/accept, and 86 toggle UI (mobile, owner/staff scoped), satisfies AC-2 through AC-5, AC-10 (bar data model spec); house recipe edit/delete, menu reorder, and pin reorder UI deferred (tracked in spec 0023-bar-data-model.md Follow-up)
  - [x] Ranked search (mobile): `recipe_aliases` table, ingredient overlap RPC (F1 scored), and the unified `search_bartender` RPC with deterministic 7-tier ranking, plus the mobile search screen, satisfies AC-1 through AC-6 (search spec) — applied live to `BartendingAppWeb`, verified end to end (Negroni scores 1.0 for "gin campari vermouth"); the `classify-method-and-aliases` backfill script exists but has not been run against the live catalog yet, so seeded shorthand aliases are still pending
  - [x] Quick Build Mode screen (mobile): large type layout (existing `display` scale reused, no new token), method/straining line, unit toggle (oz/ml/parts) with the parts ratio edge case handling, keep-awake, and fast exit, satisfies AC-1 through AC-5, AC-7, AC-8 (Quick Build spec) — also required extending `fetch_recipe_detail` to surface method/straining, not caught by the original spec
  - [x] Offline persistence (mobile): AsyncStorage query persister across app restarts, the "not available offline" state, and bar-removal cache eviction, satisfies AC-6, AC-9 (Quick Build spec)
  - [x] Bar management on web: "Service" nav item/shell, bar switcher, no-bar/guest empty states, house recipe creation, invite send (owner) and invite accept (an in-app "pending invites for my email" list, backed by a new `list_my_pending_invites` security definer RPC — `bar_invites`' own RLS only let an owner read invites, so this narrow read path was added and flagged to the engineer during the build, approved), 86 toggle, and pin/unpin (added on web now, ahead of mobile which has the mutations but no UI yet — flagged to the engineer, approved), all under `apps/web/src/app/[locale]/service/`, reusing `packages/shared/src/bar.ts` unchanged aside from the new `listMyPendingInvites` wrapper, satisfies AC-1 through AC-10 (bar data model spec)
  - [x] Search on web: Service search page (`apps/web/src/app/[locale]/service/search/`) wired to the existing `search_bartender` RPC via `searchBartender`, debounced, tiered, query kept in the URL for back-navigation restore, no new backend work, satisfies AC-1 through AC-6 (search spec)
  - [x] Quick Build Mode on web: the same screen (`apps/web/src/app/[locale]/service/build/[kind]/[id]/`), keep-awake via the Screen Wake Lock API with a disabled/unsupported fallback and visibilitychange re-acquire, a `localStorage` backed offline persister (`local-storage-persister.ts`) wrapped via `PersistQueryClientProvider` in `providers.tsx` (gated to mount after hydration — `PersistQueryClientProvider` does not establish its QueryClient context synchronously during Next.js static prerendering, which would otherwise break every statically generated page; a plain `QueryClientProvider` is used until the client has mounted, same `QueryClient` instance throughout), bar-removal eviction on window focus plus a 5 minute fallback interval, and sign-out/user-change cache clearing for the shared-terminal case, satisfies AC-1 through AC-9 (Quick Build spec)
  - [x] Independent bartender mode (mobile + web): replaced the "No bar joined yet" empty state with a working solo panel shown whenever there is no current bar, regardless of `isLinked`, including guests (mobile previously hid this section for guests; web showed a separate sign in card instead) — presentation only, no schema or backend change, satisfies AC-1 through AC-6 (independent bartender mode spec)
  - [x] Bartender Mode on/off toggle (mobile + web): `bartender_mode_enabled` column on `user_preferences` (migration applied, schema confirmed live), account menu toggles on both platforms (web `NavBadge`/`DrawerAccountSection`, mobile `AccountMenu`/`account.tsx`), route guards that redirect away from Bartender Mode routes when off (web `service/layout.tsx`, mobile `useBartenderModeGuard` across all 5 gated screens) with no effect on existing bar membership or data, and an invite-accept exemption/auto-enable on both platforms, satisfies AC-1 through AC-10 (bartender mode toggle spec); typecheck/lint/vitest (48 passing) and `next build` (full static generation) all green
  - [x] Quick Build Mode condensed instructions line (mobile + web): a new shared pure helper (`packages/shared/src/quickBuildInstructions.ts`) composes each ingredient's already-formatted amount and name plus method, straining, glass, and garnish into one arrow-joined "bare minimum" line (e.g. "1.5 oz Applejack → 1 oz Grapefruit Juice → Shake → Double Strain → Coupe → Grapefruit Twist"), rendered alongside (not replacing) the existing large-type ingredient list and bold method line on both `apps/web/src/service/quick-build-page-client.tsx` and `apps/mobile/src/app/bartender-build/[kind]/[id].tsx`; satisfies Quick Build spec AC-1's "method as one bold line" intent with a fuller condensed build sequence
- [ ] Verify it: `/check verify bartender mode` — recommended before `done`; web verified via `next build` (full static generation succeeds), lint, typecheck, the existing vitest suite (45 passing), and a dev-server smoke check of all six new routes (200s, correct empty/guest states rendered); no real browser/device interaction testing has been run in this environment
- [x] Test it: `/test bartender mode` — 16 new unit tests on `packages/shared/src/preferences.ts` (AC-1, AC-8, AC-9); route guard/redirect logic (AC-4, AC-5, AC-7) and the invite-accept auto-enable sequencing (AC-10) are React hooks with no hook-testing infra in this repo yet, deferred to `/check verify`'s manual steps
Spec [0023](../specs/0023-bartender-mode/index.md) · code in `supabase/migrations`, `packages/shared`, `apps/mobile`, `apps/web`

## Slice 21: Recipe rating

### 27. Recipe rating
A signed in user can rate any recipe from 1 to 5 stars on its detail page, change that rating anytime, and see a recipe's average rating and count (guests see the average too, but can't rate). Personal ratings feed back into the existing "You may also like" recommendations (feature 10): a user's own 4 and 5 star rated recipes add weight to the ingredient overlap scoring in `recommend_recipes`, alongside pantry, favorites, and recently viewed.
**Done when:** a signed in user can submit and change a 1 to 5 star rating on a recipe, everyone sees that recipe's average rating and count (or a neutral "no ratings yet" state), a guest sees the picker disabled with a sign in prompt, and a user's own 4 to 5 star ratings measurably shift their "You may also like" recommendations toward similar ingredients.
- [x] Design it (spec): [0024](../specs/0024-recipe-rating/index.md)
- [x] Build it: `/develop recipe rating`
  - [x] `ratings` table migration (RLS, check constraint, non anonymous write gate) plus regenerated shared types, satisfies AC-1, AC-2, AC-3, AC-9 — applied to the live Supabase project `BartendingAppWeb` (ctuzjhhpnkkhooneporu) via `supabase/migrations/20260917120000_recipe_ratings.sql`; security advisor clean (no new findings beyond the expected owner-scoped anon-access info lint, matching favorites/pantry_items); check constraint and non anonymous RLS gate confirmed live
  - [x] `recipe_rating_summary` function (average + count, excludes soft deleted recipes), satisfies AC-4, AC-5, AC-8 — applied via `supabase/migrations/20260917120100_recipe_rating_summary_function.sql`; verified live (`{average: null, count: 0}` for an unrated recipe)
  - [x] `recommend_recipes` extended with the rating weighted signal (5 star = 1.0, 4 star = 0.6) and rated-recipe exclusion, satisfies AC-6, AC-7, AC-8 — applied via `supabase/migrations/20260917120200_recommend_recipes_ratings_signal.sql` (full function replace, favorites/pantry/recent signals unchanged)
  - [x] Shared `ratings.ts` helpers plus the star rating UI (web and mobile): average/count display, neutral zero state, session gated picker, recommendations query invalidation on rate, satisfies AC-1 through AC-5 — `packages/shared/src/ratings.ts` (+ `ratings.test.ts`), both apps' `ratings/{use-ratings.ts,use-rating-mutations.ts,star-rating.tsx,recipe-rating.tsx}`, wired into `recipe-detail-header.tsx` on both platforms
- [ ] Verify it: `/check verify recipe rating`
- [ ] Test it: `/test recipe rating`
Spec [0024](../specs/0024-recipe-rating/index.md) · code in `supabase/migrations`, `packages/shared`, `apps/web`, `apps/mobile`

## Slice 22: Learn section

### 28. Learn section · done
A new top level "Learn" nav item (web and mobile, alongside Home/Search/Pantry/Drink Ideas/Popular/Service) holding curated educational pages about bar tools, spirits, wine, beer, and related basics. Articles are drafted via the existing Claude Haiku integration from a topic prompt (same one time generation pattern as spec 0020's translation pipeline and spec 0022's ingredient classification, never called live from clients) and reviewed/edited by the app owner directly in Supabase Studio before publishing; no user submitted content or comments/ratings in this feature. English only for v1; category is a fixed enum (tools, spirits, wine, beer, other).
**Done when:** a user can browse Learn articles by category (tools, spirits, wine, beer, other) and open one to read it, on both web and mobile, and every published article started as an owner reviewed Haiku generated draft.
- [x] Design it (spec): `/architect learn section`
- [x] Build it: `/develop learn section`
  - [x] `learn_articles` migration (check constraints, RLS, `published_at` trigger) plus regenerated shared types, satisfies AC-4, AC-6, AC-9 — applied to the live Supabase project `BartendingAppWeb` (ctuzjhhpnkkhooneporu) via `supabase/migrations/20260919050000_learn_articles.sql`; security advisor clean (no new findings)
  - [x] Generation script (`generate-learn-article.ts`, Haiku structured output) and the shared `learnArticles.ts` fetch layer, satisfies AC-7, AC-8 — `packages/shared/src/{learnArticleGeneration.ts,learnArticles.ts}`, `packages/shared/scripts/generate-learn-article.ts`
  - [x] Markdown rendering dependency on both apps, satisfies AC-3 — `react-markdown` (web), `react-native-markdown-display` (mobile)
  - [x] Web Learn nav entry and category/article routes, satisfies AC-1 through AC-6 — `apps/web/src/app/[locale]/learn/{page.tsx,[category]/page.tsx,[category]/[slug]/page.tsx}`, `site-nav.tsx` nav entry
  - [x] Mobile Learn tab entry and category/article routes, satisfies AC-1 through AC-6 — `apps/mobile/src/app/learn/{index.tsx,[category]/index.tsx,[category]/[id].tsx}`, `app-tabs.tsx` tab entry
  - [x] Generate and publish a first real article end to end, satisfies AC-1 through AC-9 — run during `/check verify` on 2026-09-19: `pnpm generate-learn-article --title "What Is a Jigger?" --category tools --topic "..."` against `BartendingAppWeb`, run twice to also prove AC-8 (two distinct draft rows, `d7389446…` and `5c7e190d…`); `d7389446…` flipped to `published` in Supabase Studio/SQL (confirmed `published_at` trigger fired), `5c7e190d…` flipped to `archived` as the AC-4 fixture
- [x] Verify it: `/check verify learn section`
- [x] Test it: `/test learn section`
Spec [0025](../specs/0025-learn-section.md) · code in `supabase/migrations`, `packages/shared`, `apps/web`, `apps/mobile`

## Slice 23: Learn quizzes

### 29. Learn quizzes
Lets a user test their knowledge of recipes and Learn content (tools/spirits/wine/beer) via quizzes, built once feature 28 has published content and the existing recipe catalog to draw questions from. Supersedes the deferred "Bartender training / quiz mode" line (originally from spec 0023, a study mode for house recipes separate from live service); this initial version scopes to general recipe/Learn content quizzes only, with house recipe quizzing left as a possible later extension. Quizzes are AI drafted the same way Learn articles are (spec 0026): one quiz per Learn category, or per recipe tag/region grouping; questions are multiple choice or true/false with a fixed order; a user's best score per quiz is remembered, guest or signed in.
**Done when:** a user can take a quiz on a Learn topic or on recipes, get scored, and see their result, on both web and mobile.
- [x] Design it (spec): `/architect learn quizzes`
- [x] Build it: `/develop learn quizzes`
  - [x] Migration: `quizzes`/`quiz_questions`/`quiz_attempts` tables, RLS policies, and the `published_at` trigger, plus regenerated shared types, satisfies AC-6, AC-7, AC-11 — applied to the live Supabase project `BartendingAppWeb` (ctuzjhhpnkkhooneporu) via `supabase/migrations/20260930000000_learn_quizzes.sql`; also adds a `submit_quiz_attempt` security invoker Postgres function (PostgREST upsert can't express the "only overwrite if higher" condition AC-5 needs); security advisor clean (only the expected `auth_allow_anonymous_sign_ins` info lint, matching favorites/pantry_items)
  - [x] Generation scripts (Learn category quiz, recipe tag/region quiz) using the existing Haiku pipeline, satisfies AC-8, AC-9, AC-10 — `packages/shared/src/quizGeneration.ts` (kept out of the export barrel, service role only) plus `packages/shared/scripts/{generate-learn-category-quiz,generate-recipe-quiz}.ts`, mirroring `generate-learn-article.ts`'s single-call, no-dedupe shape
  - [x] Shared `quizzes.ts` fetch/upsert layer in `packages/shared`, satisfies AC-1 through AC-7
  - [x] Web: Quizzes index and detail pages, plus quiz links on Learn category and Popular by region pages, satisfies AC-1 through AC-7 — no recipe tag browsing page exists in the app yet (only `popular/[region]`), so the tag grouping link surface from AC-1 has no page to attach to today; the recipe tag source type and generation path still work, exercised end to end via the Quizzes index instead
  - [x] Mobile: Quizzes tab, index and detail screens, plus the same conditional links, satisfies AC-1 through AC-7
  - [x] Run both generation scripts for a first real quiz each, review and publish manually, confirm end to end on both apps, satisfies AC-1 through AC-11 — "Bar Tools Quiz" (learn_category/tools) and "IBA Classics Quiz" (recipe_tag) generated, reviewed, and published live; confirmed rendering on the web dev server (Quizzes index, quiz detail, and the Learn category page's conditional link); mobile screens share the same shared fetch layer and were confirmed via typecheck/lint, not a live device render (no simulator in this environment)
- [ ] Verify it: `/check verify learn quizzes`
- [ ] Test it: `/test learn quizzes` — unit tests already added alongside the build (`quizzes.test.ts`, `quizGeneration.test.ts`), full `/test` pass still pending
Spec [0026](../specs/0026-learn-quizzes.md) · code in `supabase/migrations`, `packages/shared`, `apps/web`, `apps/mobile`

### 51. Quiz answer source links · in-progress
On the quiz result screen, each question's explanation links to the Learn article or recipe that holds its answer: the anchor phrase inside the explanation becomes the link, with a "Read more" line as the fallback. Questions store their source and anchor, both generation scripts produce them, and a reviewed backfill fills in the existing quizzes. Following a link and going Back keeps the result screen. Extends feature 29.
**Done when:** every published quiz question on web and mobile links to its source article or recipe from the result screen, Back returns to the same result, and newly generated quizzes carry sources automatically.
- [x] Design it (spec): `/architect quiz answer source links`
- [x] Build it: `/develop quiz answer source links`
  - [x] One linked question end to end: migration (source FKs, anchor, check), shared read plus `splitExplanationAtAnchor`, web inline link and "Read more" fallback, satisfies AC-1 to AC-4, AC-10
  - [x] Kept result and "Take again" on web (sessionStorage) and mobile (in memory), plus the mobile result screen links, satisfies AC-1 to AC-5
  - [x] Generation scripts emit and validate source and anchor, satisfies AC-6, AC-7
  - [x] Backfill script (dry run plan file, then apply) run across all 7 quizzes, satisfies AC-8
  - [x] `quiz_source_link_clicked` analytics on both apps, satisfies AC-9
- [ ] Verify it: `/check verify quiz answer source links`
- [ ] Test it: `/test quiz answer source links`
Spec [0042](../specs/0042-quiz-answer-source-links.md) · code in `supabase/migrations`, `packages/shared`, `apps/web`, `apps/mobile`

## Slice 24: Recipe comments

### 30. Recipe comments · done
A signed in user can post, edit, and delete their own comments on a recipe's detail page (plain text, 1 to 1000 characters); anyone, signed in or guest, can read them. Comments are a flat list, newest first, paginated with stable keyset pagination so a comment posted mid scroll never shifts already loaded rows. No threading, rate limiting, or moderation in this first version.
**Done when:** a signed in user can post, edit, and delete their own comments on a recipe, any viewer (guest or signed in) can read the full paginated comment list with a neutral zero state, a guest sees a sign in prompt instead of a working composer, and ownership/soft delete rules are enforced by the database, not only the UI.
- [x] Design it (spec): [0027](../specs/0027-recipe-comments/index.md)
- [x] Build it: `/develop recipe comments`
  - [x] `comments` table migration (trimmed length check constraint, keyset friendly index, conditional `updated_at` trigger, column level update grant, soft delete scoped RLS on select/insert/update, owner scoped RLS on update/delete) plus regenerated shared types, satisfies AC-1, AC-2, AC-3, AC-5, AC-6, AC-10, AC-11
  - [x] Shared `comments.ts` module (validation, error mapping) plus keyset paginated query and mutation hooks (optimistic update, refetch-on-zero-rows resolution), satisfies AC-1 through AC-4, AC-7, AC-10
  - [x] Comment list, composer, edit, and delete UI on the recipe detail page (web and mobile), plus cross platform parity check, satisfies AC-1 through AC-11
- [x] Verify it: `/check verify recipe comments`
- [x] Test it: `/test recipe comments`
Spec [0027](../specs/0027-recipe-comments/index.md) · code in `supabase/migrations`, `packages/shared`, `apps/web/src/comments`, `apps/mobile/src/comments`

## Slice 25: Comment moderation admin UI

### 31. Comment moderation admin UI
Gives you, the site's one admin, a way to see every comment posted across all recipes and delete any of them, closing the moderation gap spec 0027 shipped without (today the only recourse is a hand run SQL command). Adds an `is_admin` flag on `user_preferences`, widens the `comments` delete RLS policy to also allow an admin, and builds a server gated, unlisted `/admin/comments` page on web only (mobile is out of scope for this admin surface).
**Done when:** you can open `/admin/comments`, see a paginated, newest first list of comments across all recipes with recipe and author context, delete any comment from it, and a non admin or guest hitting the route is redirected to the home page with no admin content ever reaching them.
- [x] Design it (spec): [0028](../specs/0028-comment-moderation-admin-ui.md), server session prerequisite: [0029](../specs/0029-server-side-session-reading-web.md)
- [ ] Build it: `/develop comment moderation admin ui`
  - [x] `is_admin` column migration on `user_preferences` (excluded from the `authenticated` update grant) plus the widened `comments` delete RLS policy (owner OR admin), and regenerated shared types, satisfies AC-3, AC-5
  - [x] Adopt `@supabase/ssr` per spec 0029: the three client factories (browser, cookie aware server, public anon), the middleware cookie refresh composed into `proxy.ts`, and the one time anonymous session carry over, satisfying this feature's own AC-4 (a gated page needs a real server side session read to redirect before any markup reaches a non admin)
  - [x] Shared `isAdmin` check and an admin scoped, keyset paginated comments query (joined to recipe name) in `packages/shared`, satisfies AC-1, AC-2, AC-6
  - [x] Web: server gated `/admin/comments` page (redirect on non admin, built under `[locale]` per spec 0029's canonical pattern) with the comment list and a delete action per row, satisfies AC-1 through AC-6
  - [ ] Manually set `is_admin = true` for your own account and confirm end to end, satisfies AC-1 through AC-6
- [ ] Verify it: `/check verify comment moderation admin ui`
- [ ] Test it: `/test comment moderation admin ui`
Spec [0028](../specs/0028-comment-moderation-admin-ui.md), [0029](../specs/0029-server-side-session-reading-web.md) · code in `supabase/migrations`, `packages/shared`, `apps/web/src/app/[locale]/admin`, `apps/web/src/lib`, `apps/web/src/proxy.ts`

## Slice 26: Admin recipe management

### 32. Admin recipe management
Gives you, the site's one admin, a page to create, edit, and soft delete recipes by hand, independent of the TheCocktailDB import job in `packages/import-job`. Adds a `source` column on `recipes` (catalog vs admin), `is_admin` scoped write policies on the recipe tables, and two Postgres functions (`admin_upsert_recipe`, `admin_delete_recipe`) for the transactional multi table save and soft delete.
**Done when:** you can open `/admin/recipes`, see a searchable paginated list of recipes with a source indicator, add a new recipe with ingredients and tags, edit any existing recipe (imported or admin made), and soft delete one, all while a non admin or guest hitting the route is redirected with no admin content ever reaching them.
- [x] Design it (spec): [0030](../specs/0030-admin-recipe-management/index.md)
- [x] Build it: `/develop admin recipe management`
  - [x] `recipes.source` column, `is_admin` scoped INSERT/UPDATE policies on `recipes`/`ingredients`/`recipe_ingredients`/`recipe_tags`, and the `admin_upsert_recipe`/`admin_delete_recipe` functions, plus regenerated shared types, satisfies AC-2, AC-3, AC-4, AC-5, AC-7, AC-8 — applied to the live Supabase project `BartendingAppWeb` (ctuzjhhpnkkhooneporu) via `supabase/migrations/20260930200000_admin_recipe_management.sql`; all 12 `is_admin` scoped RLS policies and both `SECURITY DEFINER` functions confirmed live via introspection; security advisor clean (the two new functions showing up as admin/authenticated callable is expected, matching the existing `accept_bar_invite`-style pattern: the in-function `is_admin` check is the real gate, not the grant)
  - [x] Shared admin recipes query module in `packages/shared` (keyset paginated list with search, single recipe fetch with ingredients/tags, form validation, and `admin_upsert_recipe`/`admin_delete_recipe` RPC wrappers), satisfies AC-1, AC-2, AC-3, AC-5 — `packages/shared/src/adminRecipes.ts`, exported from `packages/shared/src/index.ts`
  - [x] Web: server gated `/admin/recipes` list page (search box, source indicator, delete action) plus one shared add/edit form component used by both `/admin/recipes/new` and `/admin/recipes/[id]/edit`, and a shared `AdminNav` linking it with `/admin/comments`, satisfies AC-1 through AC-6, AC-8 — `apps/web/src/app/[locale]/admin/recipes/{page.tsx,new/page.tsx,[id]/edit/page.tsx}`, `apps/web/src/admin/{admin-nav.tsx,admin-recipe-list.tsx,admin-recipe-form.tsx,use-admin-recipes.ts,use-admin-recipe-mutations.ts}`; `/admin/comments` also updated to render the new shared `AdminNav`
- [ ] Verify it: `/check verify admin recipe management`
- [ ] Test it: `/test admin recipe management`
Spec [0030](../specs/0030-admin-recipe-management/index.md) · code in `supabase/migrations`, `packages/shared`, `apps/web/src/app/[locale]/admin`

## Slice 27: Shopping list

### 33. Shopping list
A shopping list tab next to Pantry where a user keeps track of ingredients they want to buy. Each recipe's ingredient list gets a new "add to shopping list" button next to the existing "add to pantry" button, shown only for ingredients the user doesn't already have. Marking an item bought moves it from the shopping list into the pantry in one atomic action. Built entirely on the pantry feature's already proven session, RLS, and query hook pattern.
**Done when:** a user can add, remove, and view shopping list items from a dedicated tab, add an ingredient to the list straight from a recipe page, and mark an item bought so it moves into the pantry, with every change reflected live across open views.
- [x] Design it (spec): [0031](../specs/0031-shopping-list/index.md)
- [x] Build it: `/develop shopping list`
  - [x] `shopping_list_items` migration (mirroring `pantry_items`' RLS) plus the atomic `buy_shopping_list_item` Postgres function, satisfies AC-1, AC-2, AC-4, AC-11
  - [x] Shared `shoppingList.ts` fetch/add/remove/buy module and TanStack Query hooks with optimistic update and rollback, satisfies AC-1, AC-2, AC-4, AC-7, AC-9, AC-10
  - [x] Dedicated shopping list tab/page (mobile and web), reusing the pantry ingredient search picker and empty state, with a buy action per item, satisfies AC-1, AC-2, AC-3, AC-4, AC-8
  - [x] Recipe detail "add to shopping list" button next to "add to pantry," shown only for missing ingredients and reflecting on list state, plus cross platform parity check, satisfies AC-5, AC-6, AC-7
- [ ] Verify it: `/check verify shopping list`
- [x] Test it: `/test shopping list`
Spec [0031](../specs/0031-shopping-list/index.md) · code in `supabase/migrations`, `packages/shared`, `apps/web`, `apps/mobile`

## Slice 28: Recipe comment photos

### 34. Recipe comment photos
A signed in user can attach up to 3 photos to a recipe comment, on web and mobile, and a comment can be text, photos, or both. Photos are resized, converted to JPEG, and stripped of metadata on the client, uploaded to a public `comment-photos` bucket under the user's own folder, and attached in one atomic Postgres function call. The admin can remove a single photo or a whole comment, and a daily sweep deletes stored files nothing points to.
**Done when:** a user can post, edit (add, remove, replace, reorder, alt text), and delete comments with up to 3 photos on web and mobile, anyone can view them in a thumbnail row with a full size viewer, every limit and ownership rule is enforced by the database and storage policies, the admin can remove one photo from `/admin/comments`, and unreferenced files are cleaned up.
- [x] Design it (spec): [0032](../specs/0032-recipe-comment-photos/index.md)
- [ ] Build it: `/develop recipe comment photos`
  - [x] `comment_photos` migration (nullable body, storage bucket and policies, `post_comment`/`edit_comment`/`admin_delete_comment_photo` functions) plus the shared `commentPhotos.ts` module and `comments.ts` updates, satisfies AC-2, AC-4, AC-7, AC-8, AC-13
  - [x] Web thread: picker, canvas processing (HEIC via `heic2any`), upload, post, edit, delete, thumbnails, and the full size viewer, satisfies AC-1, AC-3 to AC-6, AC-9, AC-10
  - [x] Mobile: `expo-image-picker` plus `expo-image-manipulator` (new dev client build) with the same flows, satisfies AC-1, AC-3 to AC-6, AC-9, AC-10, AC-15
  - [ ] Admin photo moderation, orphan sweep Edge Function and cron, `delete-account` folder cleanup, SEO guard, i18n strings, and parity check, satisfies AC-6, AC-11, AC-12, AC-14, AC-15
- [x] Verify it: `/check verify recipe comment photos`
- [x] Test it: `/test recipe comment photos`
Spec [0032](../specs/0032-recipe-comment-photos/index.md) · code in `supabase/migrations`, `packages/shared`, `apps/web`, `apps/mobile`

## Hardening: app review fixes (Oct 2026)

Findings from the Cocktailist App Review (2026-10-08, production at cocktailist-five.vercel.app plus a code review at `bf23df8`), checked against the repo on 2026-10-09. The review's `review-fixes.patch` was never applied, so every item below is still open in code. Recommended to work this phase before finishing the remaining in-progress slices, in this order. The AC-5 search ranking fix sits on feature 5.

### 35. Admin privilege escalation fix · GA
Any visitor, including an anonymous session, can insert their own `user_preferences` row with `is_admin: true`, because only UPDATE is limited by column. That account then passes every admin policy (comment deletion, `admin_upsert_recipe`, `admin_delete_recipe`).
**Done when:** no client role can set or change `is_admin` on insert or update (column limited INSERT grant plus a guard trigger, or a separate admins table with no client grants), and the live `is_admin = true` rows are audited (1 row on 2026-10-09, a signed in account, likely yours).
- [x] Build it: `/develop admin privilege escalation fix`
- code in `supabase/migrations/20261010120000_lock_down_is_admin.sql`

### 36. Privacy page crash and real contact
`/privacy` and `/en/privacy` return 500 (reproduced locally 2026-10-09). Likely cause: `t.rich("contactBody", { email: () => ... })` against a message that uses `{email}` as a plain argument. The page also lists `privacy@bartendingapp.example.com`, which can't receive mail.
**Done when:** the privacy page renders in both locales, and it lists a contact address that really works (you supply it).
- [x] Build it: `/develop privacy page crash fix` (crash fixed 2026-10-10: `contactBody` now uses an `<email></email>` rich tag; still owed: a real contact address to replace `privacy@bartendingapp.example.com`)
- code in `apps/web/messages/en.json`, `apps/web/messages/es.json`, `apps/web/src/app/[locale]/privacy/page.tsx`

### 37. Production site URL, canonicals, and crawl rules
Canonicals, `og:url`, `sitemap.xml`, and `robots.txt` all point to `http://localhost:3000` because `NEXT_PUBLIC_SITE_URL` isn't set in Vercel (and is missing from `.env.example`). Recipe canonicals, `og:url`, and JSON-LD drop the locale prefix, so the Spanish canonical points to English. `robots.ts` rules lack the locale prefix, so `/en/pantry` stays crawlable. The sitemap has no Learn articles.
**Done when:** production metadata, sitemap, and robots use the real domain; each locale's recipe page is canonical to itself; robots rules match `/*/pantry`, `/*/account`, `/*/auth`, `/*/shopping-list`, `/*/favorites`, `/*/admin`, `/*/service`; Learn articles are in the sitemap.
- [x] Build it: `/develop production site URL and crawl rules` (built 2026-10-10; still owed, a manual step: set `NEXT_PUBLIC_SITE_URL` to the real domain in Vercel Production. Until then production falls back to Vercel's production domain, previews to their own deployment URL)
- code in `packages/shared/src/seo.ts` (`resolveSiteUrl`, `localizedPath`), `packages/shared/src/learnArticles.ts`, `apps/web/src/lib/site-url.ts`, `apps/web/src/app/robots.ts`, `apps/web/src/app/sitemap.ts`, `apps/web/src/app/[locale]/` page metadata

### 38. Locale aware links
15 files import `next/link` instead of `Link` from `@/i18n/navigation` (site footer, logo, recipe card, carousel, Learn and Quizzes pages, favorites, consent banner, and others), so any recipe opened from `/es/...` lands on English.
**Done when:** no web file imports `next/link` directly, an ESLint `no-restricted-imports` rule blocks it, and navigating from any `/es` page stays on `/es`.
- [x] Build it: `/develop locale aware links` (built 2026-10-10: all 15 `next/link` imports, the 4 client `useRouter` calls, and the home and popular server redirects now go through `@/i18n/navigation`; ESLint blocks `next/link` and the locale unaware `next/navigation` helpers)
- code in `apps/web/eslint.config.mjs`, `apps/web/src/i18n/navigation.ts` (helpers), and every former `next/link` call site under `apps/web/src/`

### 39. Learn article accuracy pass
Four of five articles checked had errors. Most urgent is a food safety error: "Simple Syrup… Explained" says syrup keeps indefinitely and never mentions refrigeration. Also: jigger (bitters with the 1 oz side, pouring in sequence), proof (US label rules, the water explanation, Negroni advice), oak barrels ("concentrated grain alcohol", char times), the grenadine ratio, and the "suggests complexity" sentence. Article pages reuse the site wide meta description, and the "Other" category reads "Learn about other for home bartending."
**Done when:** every published article has been fact checked and corrected (simple syrup first), each article has its own meta description, and category descriptions read naturally.
- [x] Design it (spec): `/architect learn article accuracy pass`
- [ ] Build it: `/develop learn article accuracy pass`
  - [ ] Slice 1: simple syrup fact check, sourced and approved, shipped as its own migration (after locating every known finding in live bodies), satisfies AC-1, AC-2, AC-3
  - [ ] Slice 2: required `summary` column with backfill, shared types and fetch layer, article metadata, summary subtitles on web and mobile, generator summary and accuracy prompt, satisfies AC-5, AC-6, AC-7, AC-9, AC-10
  - [ ] Catalog titles and descriptions for the Learn landing and category pages (en and es), satisfies AC-8
  - [ ] Slice 3: fact check the remaining published articles, one corrections migration, md5 and snapshot checks, satisfies AC-2, AC-3, AC-4, AC-11
- [ ] Verify it: `/check verify learn article accuracy pass`
- [ ] Test it: `/test learn article accuracy pass`
Spec [0033](../specs/0033-learn-article-accuracy-pass.md) · code in `supabase/migrations`, `packages/shared`, `apps/web`, `apps/mobile`, `docs/reviews`

### 40. AI quota abuse via anonymous sessions · GA
The AI drink idea quota is per user, and anyone can mint fresh anonymous sessions for a fresh quota, running up Anthropic costs.
**Done when:** creating new anonymous sessions no longer gets around the AI quota (e.g. CAPTCHA on anonymous sign in, or a per IP limit in the Edge Function), with the choice recorded in a spec.
- [x] Design it (spec): `/architect AI quota abuse via anonymous sessions`
- [ ] Build it: `/develop AI quota abuse via anonymous sessions`
  - [x] Trusted IP header probe on the live project (gate: no trustworthy header means back to `/architect`), satisfies AC-8. Probed 2026-10-11: `cf-connecting-ip` is the only trusted source (a forged one is rejected by Cloudflare), the `x-forwarded-for` fallback was dropped; recorded as the IP source note in spec 0034; second network check still open; delete the `debug-ip-headers` function in the dashboard
  - [x] Counter tables plus reserve and release Postgres functions, hand run SQL checks recorded here, satisfies AC-1, AC-2, AC-3, AC-4, AC-4b, AC-11. Applied 2026-10-11 to `BartendingAppWeb` via `supabase/migrations/20261011120000_ai_quota_abuse_limits.sql` and `20261011120100_register_ai_quota_cleanup_cron.sql`; types regenerated; security advisor clean for the new objects (only the expected `rls_enabled_no_policy` info). Hand run checks (`supabase/tests/ai_quota_limits_check.sql`, 2026-10-11): 20 of 20 PASS covering tier limits, IP limit, guest cutoff at 1600, full cap at 2000, all or nothing, precedence, release and its zero floor, bad input, permissions, and the cleanup job. Concurrency still to check with parallel calls against the deployed function
  - [x] IP bucket helpers with vitest, and the Edge Function wired to the new limits, release on failure, 429 reasons, and Sentry signals (`IP_HASH_SECRET` set first), satisfies AC-1 to AC-5, AC-7, AC-8, AC-9. `supabase/functions/_shared/ip-bucket.ts` (17 vitest cases) and `generate-drink-idea` deployed as version 5 on 2026-10-11 with `IP_HASH_SECRET` and `ANTHROPIC_API_KEY` set; also fixed a runtime crash where the SDK zod helper needed the zod v4 API (`npm:zod@3.25.76/v4`). Live checks 2026-10-11: guest gets 5 then 429 `user_limit` with `signInHelps: true`; a forged `X-Forwarded-For` and `True-Client-IP` stayed in the caller's one IP bucket; two parallel calls for a last slot gave exactly one 200 and one 429; every failed generation released its user, IP, and total slots back to 0. Not exercised live: the 503 without the secret and the Sentry threshold warnings
  - [x] Shared wrapper plus reason specific messages on web and mobile, satisfies AC-5, AC-6. Code in `packages/shared/src/generateDrinkIdea.ts`, `packages/shared/src/drinkIdeaLimitMessage.ts`, web `drink-ideas-page-client.tsx`, mobile `drink-ideas.tsx`; English copy on both screens until feature 41 translates them
  - [ ] Retention cron, privacy page copy, dashboard settings (anonymous sign in 10/hour, Anthropic spend limit), then drop the old reservation function, satisfies AC-4, AC-10, AC-12, AC-13
- [ ] Verify it: `/check verify AI quota abuse via anonymous sessions`
- [ ] Test it: `/test AI quota abuse via anonymous sessions`
- [ ] Review it (fresh model): `/check review AI quota abuse via anonymous sessions`
- [ ] Document it: `/document AI quota abuse via anonymous sessions`
Spec [0034](../specs/0034-ai-quota-abuse-hardening/index.md) · code in `supabase/functions`, `supabase/migrations`, `packages/shared`, `apps/web`, `apps/mobile`

### 41. Finish Spanish UI translation
Closes feature 23's unmet Done when. The web message catalog has 83 keys in only `common`, `nav`, `language`, `account`, `privacy`, and only 6 files call `useTranslations`/`getTranslations`. The hero, buttons, section headings, filter chips, footer, page titles, recipe page, batch panel, pantry, shopping list, and all of `/es/learn` stay English.
**Done when:** every user facing web string comes from the message catalog with a Spanish translation, and `/es` pages (including recipe and Learn pages) read in Spanish apart from content not yet translated.
- [x] Build it: `/develop finish Spanish UI translation` (built 2026-10-11: every web screen, including admin, now reads its copy from `messages/en.json` and `messages/es.json` (497 keys each, 24 namespaces); page metadata is translated; `src/i18n/messages.d.ts` types every key so a missing key fails typecheck; the drink idea limit message now follows the page locale. Catalog content (recipe and ingredient names, Learn article bodies, quiz titles, region names) is unchanged and stays English until translated)
- code in `apps/web/messages/`, `apps/web/src/i18n/messages.d.ts`, and every screen under `apps/web/src/`; `splitMissingIngredients` in `packages/shared/src/drinkIdeas.ts`

### 42. Batch calculator correctness
Dilution is computed on alcohol only, so batches come out under diluted (spec 0022 AC-6 itself needs changing). Common TheCocktailDB units don't parse (`shot`, `jigger`, `part`, `dl`, `Tblsp`, `1 ½ oz`), so lines show "not scaled" and recipes like Afterglow lose the batch panel. Tiny liter amounts show `0 l`. The batch units (oz / ml / liter) don't match the toggle (oz / ml / cl).
**Done when:** dilution is based on a decided volume, the common units parse (with a decided value for shot and jigger), parts scale relative to a chosen total, tiny amounts never show as zero, unit choices are consistent, and the import job is rerun so existing recipes pick up the new rules.
- [x] Design it (spec): [0035](../specs/0035-batch-calculator-correctness/index.md)
- [ ] Build it: `/develop batch calculator correctness`
  - [ ] Shot thread end to end: widened unit check plus pair check migration, unit type split and `toRecognizedUnit` guard at every cast site, shot and jigger parsing, `reparse-measures` script (AC-1, AC-2, AC-9, AC-12)
  - [x] Remaining parser forms and range guards: dl, l, tblsp, pint, qt, gal, `1 ½`, unit then extra words (AC-1, AC-2, AC-11)
  - [x] Batch math and panel, web and mobile: parts with part size input, dilution on all included lines, oz/ml/cl/l with the `<` floor, batch unit follows the toggle, new copy in the message catalog (AC-3 to AC-7, AC-13)
  - [ ] Admin save parses measures, and Quick Build parts view (AC-8, AC-10)
  - [ ] Live rollout: migrations, deploy web and mobile, reparse dry run then real run, confirm 0 changes on rerun (AC-9)
- [ ] Verify it: `/check verify batch calculator correctness`
- [ ] Test it: `/test batch calculator correctness`
Spec [0035](../specs/0035-batch-calculator-correctness/index.md) · code in `packages/shared`, `packages/import-job`, `supabase/migrations`, `apps/web`, `apps/mobile`

### 43. Shopping list follow ups · done
Review findings on feature 33: `fetch_shopping_list_items` has no `order by`, so items can shuffle; the add search doesn't mark ingredients already in the pantry; the first visit query runs before `ensureAnonymousSession` finishes and only recovers through retries (pantry has the same race); there are no tests for `shoppingList.ts` or its migration.
**Done when:** items load in a stable order, the add search marks pantry items, the first query waits for a session (shopping list and pantry), and `shoppingList.ts` has tests.
- [x] Build it: `/develop shopping list follow ups` (built 2026-10-11 on `feat/shopping-list-follow-ups`: stable oldest first order in `fetch_shopping_list_items`, "In your pantry" marker in the add search on web and mobile, pantry and shopping list queries wait for a session, 12 vitest cases for `shoppingList.ts`. `supabase/migrations/20261011150000_shopping_list_stable_order.sql` is live on `BartendingAppWeb`, checked 2026-10-11)
- code in `supabase/migrations/20261011150000_shopping_list_stable_order.sql`, `packages/shared/src/shoppingList.test.ts`, `apps/web/src/shopping-list/`, `apps/web/src/pantry/use-pantry.ts`, `apps/mobile/src/app/shopping-list.tsx`, `apps/mobile/src/shopping-list/`, `apps/mobile/src/pantry/use-pantry.ts`

### 44. Recipe catalog cleanup · in-progress
Inherited TheCocktailDB data problems: duplicates and misspellings ("Cuba Libra" and "Cuba Libre", "Holloween Punch" and "Halloween Punch"), crude names that are indexed and searchable, instructions that mention unlisted ingredients (Americano's soda water), odd casing ("red Sweet Vermouth", "Highball Glass"), and ice (and probably water) offered as "Add to pantry".
**Done when:** a decided policy for duplicates and crude names (keep, rename, or hide) is applied, a cleanup pass flags instructions naming unlisted ingredients, glass names are consistently cased, and ice and water are excluded from pantry and shopping list actions.
- [x] Design it (spec): `/architect recipe catalog cleanup`
- [ ] Build it: `/develop recipe catalog cleanup` (code built 2026-10-12 on `feat/recipe-catalog-cleanup`; migration `20261012120000_catalog_cleanup.sql` live on `BartendingAppWeb`, checked 2026-10-12; fix pass drafted in `catalogOverrides.json`; `supabase/tests/catalog_cleanup_check.sql` all 12 PASS on 2026-10-12; waiting on deploy, live import, and rerun)
  - [ ] Migration plus overrides file, import validation and dry run, and the web redirect proven end to end on Cuba Libra, satisfies AC-1, AC-2, AC-4, AC-12
  - [ ] All 10 hides, the soft delete checklist, favorites and pins moved, and the mobile redirect, satisfies AC-1, AC-2, AC-3, AC-5
  - [x] Shared glass and ingredient casing applied in the catalog import, the custom recipes import, and admin saves, satisfies AC-4, AC-6, AC-7
  - [ ] Ice and Water as staples: flag, matching, hidden buttons, `includeStaples` search option, satisfies AC-10, AC-11, AC-13
  - [ ] Unlisted ingredient report, fix pass, and live rollout ending with a rerun that changes nothing, satisfies AC-4, AC-8, AC-9
- [ ] Verify it: `/check verify recipe catalog cleanup`
- [ ] Test it: `/test recipe catalog cleanup`
Spec [0036](../specs/0036-recipe-catalog-cleanup/index.md) · code in `supabase/migrations`, `packages/import-job`, `packages/shared`, `apps/web`, `apps/mobile`

### 45. Brand, metadata, and launch readiness · in-progress
Most pages share the title "Bartending App" and one description while the header says "Cocktailist". There's no age gate or responsible drinking notice (alcohol apps usually need a 17+ rating) and no web app manifest.
**Done when:** one product name is used everywhere, each page has its own title and description, an age confirmation (or a decided alternative) meets app store expectations, and a web manifest with icon and name is served.
- [x] Design it (spec): `/architect brand, metadata, and launch readiness`
- [x] Build it: `/develop brand, metadata, and launch readiness` (built 2026-10-12 on `feat/brand-metadata-launch-readiness`; web gate proven in Chromium on dev and a production build, 29 checks; every route titled in en and es; manifest installable in Chrome. Mobile typechecks and Expo resolves the new config, but the gate, splash, and `cocktailist://` reset link have not run on a device yet. The learn article description waits on spec 0033's `summary` column)
  - [x] Thin thread: shared brand and age gate modules, title template, the Cocktailist swap, `#app-content` wrapper and gate store, and a minimal gate on web and mobile, satisfies AC-1, AC-2, AC-9, AC-10, AC-11, AC-13
  - [x] Gate hardening: exempt routes, storage fallback, consent banner and mobile PostHog held until confirmed, accessibility, responsible drinking notices, en/es copy, satisfies AC-11, AC-12, AC-14, AC-15, AC-16, AC-17
  - [x] Icon pipeline and mobile identity: `pnpm icons` from one SVG, every web and Expo asset, bundle ID, scheme, splash, template asset cleanup, satisfies AC-7, AC-8
  - [x] Manifest, share card, and metadata coverage: `manifest.ts`, `opengraph-image.tsx`, `buildOpenGraph`, a title on every route and a description on every indexable one, satisfies AC-1, AC-2, AC-3, AC-4, AC-5, AC-6
- [ ] Verify it: `/check verify brand, metadata, and launch readiness`
- [ ] Test it: `/test brand, metadata, and launch readiness`
Spec [0037](../specs/0037-brand-metadata-launch-readiness/index.md) · code in `packages/shared`, `apps/web`, `apps/mobile`, `assets/brand`, `scripts/generate-icons.mjs`, `scripts/brand.test.ts` · manual launch steps in the spec's _Launch checklist_

### 46. Empty states, UX polish, and accessibility · in-progress
New visitors hit thin pages: Popular says regions "haven't been tagged yet", Drink ideas shows only a heading, home pantry and recommendation sections are empty, and `/en/service` renders nothing. Rating stars show filled beside "No ratings yet". Back buttons need a fallback when there's no history. Recipe images have empty alt text, and the favorite button needs an `aria-label` and `aria-pressed`. Search defaults to A to Z ("A. J.", "A1", "ABC"); deciding on a popular first default is the open call.
**Done when:** every empty page offers a next step (e.g. "Add a few ingredients to get ideas"), Service shows content or a clear state, ratings display reads correctly, Back always goes somewhere sensible, images and the favorite button are labeled for screen readers, and the search default order is decided and applied.
- [x] Design it (spec): `/architect empty states, UX polish, and accessibility`
- [ ] Build it: `/develop empty states, UX polish, and accessibility`
  - [ ] Thin thread on fame data: popularity migration (codify columns, `search_recipes` fame order, `classic_recipes`, locked down `apply_region_proposals`), fame for every recipe in the tagging scripts, tagging run and top 50 spot check, classics row on web and mobile, Popular empty states, satisfies AC-1, AC-2, AC-3, AC-4, AC-15
  - [x] Empty and loading states: Drink ideas skips matching on an empty pantry, Service spinner and error with Retry, zero ratings without stars and a single rating label, satisfies AC-5, AC-6, AC-7, AC-15
  - [x] Back fallback on web (depth counter of real history pushes, per page parent routes) and the mobile Bartender build fallback, satisfies AC-8
  - [x] Labels, card structure, and keyboard: hero alt, favorite beside the card link with a fixed name, mobile row labels, skip link, nav focus styles, jsx-a11y lint, satisfies AC-9, AC-10, AC-11, AC-12, AC-13, AC-14, AC-15
- [ ] Verify it: `/check verify empty states, UX polish, and accessibility`
- [ ] Test it: `/test empty states, UX polish, and accessibility`
Spec [0038](../specs/0038-empty-states-ux-accessibility/index.md) · code in `supabase/migrations`, `packages/shared`, `apps/web`, `apps/mobile`

### 47. Recipe page performance · in-progress
Each recipe request fetches the recipe three times (`generateMetadata`, other locale alternates, the page). Hero images were requested at `w=3840`; commit `9bb462d` corrected the `sizes` hint, which still needs confirming in production.
**Done when:** a recipe request fetches the recipe once per locale (`fetchRecipeDetail` wrapped in React `cache()`, only the other locale's slug fetched for alternates), and production hero images are requested at a phone sized width on phones.
- [ ] Build it: `/develop recipe page performance` (built 2026-10-12 on `feat/recipe-page-performance`; in dev a recipe request now makes one `fetch_recipe_detail` call plus one light `fetch_recipes_by_ids` name lookup for the other locale, down from three detail calls, in en and es. Hero `sizes` checked locally (a 3x phone picks 1200w); still owes a check on the production site)
  - [x] `getRecipeDetail` wrapped in React `cache()`, shared by `generateMetadata` and the page; alternates use the light name lookup
  - [ ] Production hero images requested at a phone sized width on phones
- code in `apps/web/src/app/[locale]/recipes/[slug]/page.tsx`, `apps/web/src/recipes/recipe-detail-header.tsx`

### 48. Repo hygiene · in-progress
Debug captures are committed at the repo root (`.home.html`, `.search.html`, `.negroni.html`, `.noimg.html`, `.noimg2.html`, `.popular.html`, `.404.html`, `.sitemap.xml`). Skills are duplicated in `.agents/skills/` and `.claude/skills/` and will drift. CI is still missing (tracked under feature 2).
**Done when:** the captures are deleted and ignored, skills live in one place, and feature 2's CI workflow exists.
- [x] Design it (spec): `/architect repo hygiene`
- [ ] Build it: `/develop repo hygiene`
  - [ ] Base branch and CI: `main` created at `7200f44` and made the GitHub default (manual), clean checkout dry run, `.nvmrc` 24, and a green `ci.yml` that goes red on failure, satisfies AC-6, AC-7, AC-8, AC-9
  - [ ] Captures removed and `.debug/` plus root dot html and xml ignored, satisfies AC-1, AC-2
  - [ ] Skills consolidated in `.claude/skills/`, `.agents/` ignored, and the four `AGENTS.md` link sets repointed via `/sync`, satisfies AC-3, AC-4, AC-5
- [ ] Verify it: `/check verify repo hygiene`
- [ ] Test it: `/test repo hygiene`
Spec [0039](../specs/0039-repo-hygiene.md) · code in `.github/workflows/`, `.gitignore`, `.nvmrc`, `package.json`, `.claude/skills/`

### 49. EAS build and submit setup · in-progress · from spec 0037
The mobile app has no `eas.json`, so no store build can be made. Needs development, preview, and production profiles, version auto increment, and an EAS project linked to the `cocktailist` slug from feature 45.
**Done when:** `eas build --profile production` produces signed iOS and Android builds, and `eas submit` can upload them.
- [x] Design it (spec): `/architect EAS build and submit setup`
- [ ] Build it: `/develop EAS build and submit setup` (repo side built 2026-10-12 on `feat/eas-build-submit-setup`: `eas.json` with all four profiles and channels, `expo-updates` with the fingerprint runtime, `expo-dev-client`, the `check-public-env.mjs` build hook, gitignore backstops, the `app_channel` super property, and the build and update scripts; typecheck and 508 tests green. Waiting on the Expo account steps: org, `eas init`, `eas env:create`, `eas update:configure`, and the first builds on a phone)
  - [ ] Android tracer with no store accounts: Expo org and `eas init`, `eas.json` preview and production profiles, EAS environment variables plus `eas env:pull`, the build hook env check, gitignore backstops, and a working preview APK plus incrementing production `versionCode`, satisfies AC-1, AC-3a, AC-4, AC-5, AC-6, AC-10, AC-12
  - [ ] Over the air updates: `expo-updates` with fingerprint runtime and per profile channels, a preview update landing on device, and the `app_channel` PostHog super property, satisfies AC-7, AC-8, AC-9
  - [ ] Development client: `expo-dev-client`, `development` and `development-simulator` profiles, `start` on `--dev-client`, satisfies AC-2
  - [ ] iOS and store submit: both store accounts and app records, first iOS builds, manual first Play upload, service account and App Store Connect API key in EAS, `build:prod` auto submitting to TestFlight and Play internal, store forms answered, satisfies AC-2, AC-3b, AC-4, AC-11, AC-14
  - [x] `build:*` and `update:*` scripts in `apps/mobile/package.json` (plus `build:preview:android`, since `eas` rejects a second `--platform`), satisfies AC-6, AC-13
- [ ] Verify it: `/check verify EAS build and submit setup`
- [ ] Test it: `/test EAS build and submit setup`
Spec [0040](../specs/0040-eas-build-submit-setup/index.md) · code in `apps/mobile/eas.json`, `apps/mobile/app.json`, `apps/mobile/package.json`, `apps/mobile/scripts/`, `apps/mobile/src/analytics/`, `.gitignore`

### 50. Self hosted recipe images · done
Recipe images are hotlinked from TheCocktailDB (and Imgur via pasted admin URLs), so their outage or a hotlink block means no images, and every import silently undoes admin image fixes. Images move into a public `recipe-images` Supabase bucket as hero and card WebP files: admin uploads first, with the TheCocktailDB copy step behind `--copy-images` until they confirm copying is allowed.
**Done when:** the admin can upload, replace, and remove a recipe image that no import overwrites, cards on web and mobile load the 400px file, legacy Imgur links are migrated and removed from `next.config.ts`, orphaned files are swept daily, and TheCocktailDB recipes show a credit.
- [x] Design it (spec): `/architect self hosted recipe images`
- [x] Build it: `/develop self hosted recipe images`
  - [x] One admin upload end to end: migration (image columns, bucket and policies, `admin_set_recipe_image`, import guards), shared `recipeImages.ts`, the admin form file picker, and the remote pattern, satisfies AC-1 to AC-6, AC-11, AC-15
  - [x] Card sizes everywhere on web and mobile via `recipeImageUrl`, satisfies AC-10, AC-11
  - [x] Import job image state and the `--copy-images` copy with sharp, satisfies AC-7, AC-8, AC-9
  - [x] Orphan sweep Edge Function and cron, plus the `migrate:images` legacy migration and Imgur removal, satisfies AC-12, AC-13
  - [x] TheCocktailDB credit on recipe detail, satisfies AC-14
- [ ] Verify it: `/check verify self hosted recipe images` (skipped)
- [ ] Test it: `/test self hosted recipe images` (skipped)
Spec [0041](../specs/0041-self-hosted-recipe-images/index.md) · code in `supabase/migrations`, `supabase/functions`, `packages/shared`, `packages/import-job`, `apps/web`, `apps/mobile`

## Deferred
Out of scope for the current build pass, kept so the plan stays honest.
- **Ads or subscription monetization**: no monetization in this build pass; revisit once there is usage · needs a decision
- **User submitted recipes**: community recipe submission and moderation · needs a decision
- **ML/collaborative recommendations**: usage based recommendation model once there is a real user base · needs a decision
- **Ingredient substitution suggestions**: suggest a swap when an ingredient is 86'd (feature 26) · needs a decision · from spec 0023
- **Shared "recently made" shift log**: a server persisted, all-staff-visible build history for a bar, beyond today's per-bartender client side recently viewed list (feature 26) · needs a decision · from spec 0023
- **Automated comment photo screening**: e.g. Claude Haiku vision checks each uploaded photo and hides flagged ones until admin review (feature 34) · needs a decision · from spec 0032
- **Report a comment or photo**: a viewer facing report button feeding the admin comments page (features 31, 34) · needs a decision · from spec 0032
- **Learn route caching**: spec 0025 promised `revalidate = 60` on the Learn routes but the code has none; decide timed revalidation or dynamic render (feature 28) · needs a decision · from spec 0033
- **Learn articles as repo files**: move article source of truth to markdown files plus a sync script if editing bodies in SQL migrations proves painful (feature 28) · needs a decision · from spec 0033
- **Scale counted lines in batches**: `2 dashes` × 25 shows `50 dashes` (feature 42) · needs a decision · from spec 0035
- **Batch range measures**: batch `2-3 oz` using `amount_max_value` (feature 42) · needs a decision · from spec 0035
- **Method based dilution default**: stirred, shaken, and built drinks get different default dilution (feature 42) · needs a decision · from spec 0035
- **Import job vs admin edits**: the catalog import can overwrite admin edits to a catalog recipe; decide which wins (feature 42) · needs a decision · from spec 0035
- **Staples in AI drink ideas**: tell the drink ideas prompt that Ice and Water are always on hand (feature 44) · needs a decision · from spec 0036
- **Aliases for merged duplicates**: add a hidden duplicate's name (e.g. "Long Island Tea") as a `recipe_aliases` entry on the kept recipe for bartender search (feature 44) · needs a decision · from spec 0036
- **Store listing copy**: store title, subtitle, keywords, and description in English and Spanish (feature 45) · from spec 0037
- **Designed app icon**: a commissioned icon plus an iOS Icon Composer `.icon`, dropped in as `assets/brand/mark.svg` (feature 45) · from spec 0037
- **Fame scores for new recipes**: catalog imports and admin adds arrive with no fame score and sort last; flag them or run `tag-regions` periodically (feature 46) · needs a decision · from spec 0038
- **Search sort control**: a "Popular / A to Z" toggle if people miss alphabetical browsing (feature 46) · needs a decision · from spec 0038
- **Automated accessibility checks**: Playwright plus `@axe-core/playwright` on key pages once CI exists (features 2, 46) · needs a decision · from spec 0038
- **Mobile accessibility lint**: no jsx-a11y equivalent runs on mobile; revisit if a maintained React Native plugin fits Expo's config (feature 46) · needs a decision · from spec 0038
- **Mocktails only mode**: let under age visitors in with alcoholic recipes hidden everywhere, if the age gate's drop off proves costly (feature 45) · needs a decision · from spec 0037

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
- **Atomic build tasks live istahe spec's `## Build plan`, not here**: the scope carries only the milestone rollup.
- **Status** `planned` → `in-progress` → `done`, plus `existing` (pre-workflow) and `dropped` (de-scoped, kept for history).
- **Workflow** (header line) is the project default, what runs after `/develop`: **Beta** = `/check verify` then `/test`. A feature built on an unratified decision (an `Assumed` spec) stays flagged, but that never blocks `done`.
- **Pointer line** (`spec <n> · code in <path>`): the spec link added by `/architect`, the code path by `/develop`.
