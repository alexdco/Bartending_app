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
- [ ] Build it: `/develop multi language support`
  - [x] Data model: `recipe_translations`/`ingredient_translations`/`tag_translations`/`recipe_ingredient_translations`, `recipes_localized`/`ingredients_localized` views, `user_preferences.locale`, per locale search indexes, satisfies AC-6, AC-9, AC-13, AC-14, AC-15, AC-17
  - [x] UI i18n wiring: `next-intl` on web (`[locale]` routing) and `i18next`/`react-i18next`/`expo-localization` on mobile, satisfies AC-1, AC-3, AC-5
  - [x] Catalog translation pipeline: one-time backfill script plus the import job's ongoing translation step (hash gated), satisfies AC-9, AC-11, AC-17. Backfill script and import job wiring are done and typecheck/lint/build clean; the actual one-time run against the live catalog (427 recipes) is still pending, tracked in spec 0020 build plan step 3.
  - [x] Locale aware reads: search/browse/recommend/pantry-match functions, plus `fetch_recipe_detail`/`fetch_pantry_items`/`fetch_favorite_recipes`/`fetch_recipes_by_ids` RPC functions replacing the detail/pantry/favorites/homepage PostgREST embeds (the originally planned `recipes_localized`/`ingredients_localized` views were dropped, see spec 0020's Correction), satisfies AC-2, AC-6, AC-7, AC-13, AC-14
  - [x] Locale switch control, sign in merge behavior, and `generate-drink-idea`'s locale aware generation with corrected pantry verification, satisfies AC-4, AC-10, AC-16
  - [ ] Locale aware recipe slugs, sitemap, and hreflang alternates, satisfies AC-8, AC-12
- [ ] Verify it: `/check verify multi language support`
- [ ] Test it: `/test multi language support`
Spec [0020](../specs/0020-multi-language-support/index.md) · code in `packages/shared`, `apps/web`, `apps/mobile`, `supabase/migrations`, `supabase/functions`

## Deferred
Out of scope for the current build pass, kept so the plan stays honest.
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
- **Atomic build tasks live istahe spec's `## Build plan`, not here**: the scope carries only the milestone rollup.
- **Status** `planned` → `in-progress` → `done`, plus `existing` (pre-workflow) and `dropped` (de-scoped, kept for history).
- **Workflow** (header line) is the project default, what runs after `/develop`: **Beta** = `/check verify` then `/test`. A feature built on an unratified decision (an `Assumed` spec) stays flagged, but that never blocks `done`.
- **Pointer line** (`spec <n> · code in <path>`): the spec link added by `/architect`, the code path by `/develop`.
