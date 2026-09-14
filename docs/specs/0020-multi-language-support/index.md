# 0020. Multi language support (internationalization)

**Date**: 2026-09-13
**Status**: In Progress

## Summary

This decision adds a second language, Spanish, alongside English, across the web app, the mobile app, and the recipe catalog itself. App text (buttons, labels, errors) is translated with standard translation libraries. Recipe names, instructions, and ingredient names are translated once using the AI service (Claude Haiku) the app already calls for other features, then cached in the database so no extra cost is paid on repeat views. A user's language is guessed from their device or browser the first time, then remembered, with a manual switch always available. If a translation is not ready yet, the English version shows instead of an error or a blank screen.

## Requirements

**User stories**:
- As a Spanish speaking home bartender, I want to browse and search recipes, manage my pantry, and read instructions in Spanish, so the app feels native to me.
- As a home bartender, I want the app to guess my language automatically the first time I open it, so I don't have to configure anything.
- As a home bartender, I want to switch languages manually if the automatic guess is wrong, and have that choice remembered.
- As a home bartender using either language, I want pantry matching to work correctly no matter which language I'm viewing ingredients in.
- As an engineer, I want new recipes to get translated automatically when the catalog is reimported, so translations never fall behind the English content.

**Acceptance criteria**:
- **AC-1**: All app chrome (navigation, buttons, labels, empty states, error messages, static pages such as Privacy) renders in the user's selected language on both web and mobile, for English and Spanish.
- **AC-2**: Recipe name, instructions, and ingredient names render in the user's selected language when a translation exists; when it does not yet exist, the English version renders instead, never a blank field or an error.
- **AC-3**: A first time visitor's language is set from their browser's Accept-Language header (web) or device locale (mobile), falling back to English when neither matches a supported language.
- **AC-4**: A user can change their language from a visible control; the choice persists across reloads and app restarts (local storage on web, device storage on mobile), and syncs to their account (`user_preferences`) when signed in, so it carries across devices.
- **AC-5**: On web, every page is reachable under a locale prefixed path (`/en/...`, `/es/...`); visiting a URL renders that URL's language regardless of any stored preference (the URL always wins); a bare path with no locale segment redirects once to the visitor's detected or stored preference.
- **AC-6**: Pantry matching (`match_recipes_to_pantry`) and pantry add/remove continue to work correctly regardless of the ingredient display language; an ingredient added while viewing Spanish and one added while viewing English resolve to the same canonical ingredient and match the same recipes.
- **AC-7**: Ingredient and recipe search (`search_recipes`, `search_ingredients`) match against the name in the caller's current language, falling back to the English name when no translation exists.
- **AC-8**: The web sitemap lists both language versions of every recipe and region page, and each page carries `hreflang` alternate links to its counterpart in the other language.
- **AC-9**: Reimporting the recipe catalog (the existing import job) translates any new or changed recipe into every supported non English language as part of the same run, without manual intervention.
- **AC-10**: The AI generated pantry drink idea feature (spec 0007) produces its generated recipe (name, ingredients, steps) written natively in the caller's language, not translated after generation.
- **AC-11**: A batch script can translate the full existing recipe catalog into Spanish on demand (for the initial backfill and for adding a future language), reusing the same translation logic the import job uses going forward.
- **AC-12**: A recipe's URL slug under any locale (e.g. `/es/recipes/margarita-de-mango-<uuid>`) is generated from that locale's resolved name (translated when available, English otherwise); the UUID stays the sole lookup key, so a locale switch or a slug that no longer matches the current name never 404s, only redirects to the canonical slug (mirroring spec 0011's existing behavior).
- **AC-13**: Ingredient and recipe display names render translated everywhere they appear, not only in search and browse: the recipe detail page's ingredient list and measures, the pantry list, the favorites list, the homepage carousels, and drink ideas' missing ingredient list all show the caller's locale, falling back to English per AC-2.
- **AC-14**: A Spanish search also matches a recipe or ingredient's English name, so a recipe with no Spanish translation yet is still findable in Spanish mode (never invisible, only untranslated).
- **AC-15**: Recipe ingredient measures (e.g. "1 1/2 oz") and glass type render in the caller's locale when a translation exists, falling back to English; a recipe's region stays a stable, untranslated filter key and URL segment (matching spec 0011's region slugs), but its display label is translated via a small fixed lookup, not AI.
- **AC-16**: At sign in, if the account already has a stored `user_preferences.locale`, it wins over whatever the guest session was using; the guest's local choice is written to the account only when the account has no locale set yet. An anonymous session upgraded to a linked account keeps its local value (same row, not a merge).
- **AC-17**: Reimporting a recipe whose English name and instructions are unchanged since its last translation does not re-translate it, bounding the ongoing AI cost of AC-9 to genuinely changed or new recipes.

## Decision

**Chosen option**: Option 1: Translate UI and recipe content, AI translated recipe data cached in Postgres.

Two supported languages at launch: English (`en`, the source language) and Spanish (`es`). Web uses `next-intl` with locale prefixed paths (`/en/...`, `/es/...`); mobile uses `i18next` and `react-i18next` with `expo-localization` for device locale detection, locale held in app state with no route change. Recipe, ingredient, and tag translations are cached in three new Postgres tables, populated once by a backfill script and kept current by the existing import job.

**Implementation skills**: `supabase-postgres-best-practices` (`supabase/agent-skills`, `.agents/skills/supabase-postgres-best-practices/`) · `nextjs-app-router-patterns` (`wshobson/agents`, `.agents/skills/nextjs-app-router-patterns/`) · `react-native-best-practices` (`callstackincubator/agent-skills`, `.agents/skills/react-native-best-practices/`)

## Correction (2026-09-13)

The original **Feature design** below described `recipes_localized`/`ingredients_localized` as resolving locale via a `set_config`/session parameter set at the start of each request, justified as "the same mechanism Postgres RLS policies already use for `auth.uid()`." That justification was wrong, and the mechanism was never actually wired up.

`auth.uid()` works with no custom code because Supabase's PostgREST layer verifies the caller's JWT on every request and populates `request.jwt.claims` (and the `auth.uid()`/`auth.role()` helper functions that read it) automatically, before any query runs. There is no equivalent automatic channel for an arbitrary session variable like `request.locale`: nothing calls `set_config('request.locale', ...)` anywhere in this repo, no `db.pre-request` hook is configured, and no client sends a header a hook could read. As shipped, `current_setting('request.locale', true)` always returned null, so both views always resolved to plain English for every caller, silently, with no error.

This was only caught because build plan step 5 (switching the four PostgREST embed reads to these views) was still unbuilt when this gap was reviewed. The fix: drop both views and replace the four affected reads (`fetchRecipeDetail`, `fetchPantryItems`, `fetchFavoriteRecipes`, `fetchRecipesByIds`) with Postgres RPC functions that take `locale` as an explicit parameter, exactly like `search_recipes` and the other four functions build plan step 4 already extended this way. `.rpc()` calls pass parameters explicitly in the request body; there is no session state to wire, and no risk of a silent fallback to English. The **Feature design** section below reflects this corrected design, not the original.

## Feature design

**Data model sketch**:

| Entity | Primary key | Fields | Foreign keys | Cardinality |
|---|---|---|---|---|
| `recipe_translations` | (`recipe_id`, `locale`), unique | `name` (text, required), `instructions` (text, required), `glass` (text, nullable), `name_search` (generated `tsvector`, per locale text search config), `source_name_hash` (text, required, hash of the English `name`+`instructions` at translation time), `created_at`, `updated_at` (timestamptz) | `recipe_id` → `recipes` (cascade) | N:1 into `recipes`, one row per supported non English locale per recipe |
| `ingredient_translations` | (`ingredient_id`, `locale`), unique | `name` (text, required), `source_name_hash` (text, required), `created_at`, `updated_at` (timestamptz) | `ingredient_id` → `ingredients` (cascade) | N:1 into `ingredients` |
| `tag_translations` | (`tag_id`, `locale`), unique | `name` (text, required), `created_at`, `updated_at` (timestamptz) | `tag_id` → `tags` (cascade) | N:1 into `tags` |
| `recipe_ingredient_translations` | (`recipe_id`, `ingredient_id`, `locale`), unique | `measure` (text, nullable, translated display measure) | (`recipe_id`, `ingredient_id`) → `recipe_ingredients` (cascade) | N:1 into `recipe_ingredients` |
| `user_preferences.locale` | (existing table, new column) | `locale` (text, nullable, `check (locale is null or locale in ('en','es'))`) | — | 1:1 with the existing preferences row |

No `locale` column is added to `recipes`, `ingredients`, `tags`, or `recipe_ingredients` themselves; English is the row's existing field, unchanged, and acts as the fallback (AC-2). `locale` is a short text code (`'en'`, `'es'`), not a foreign key to a locales table, since the supported set is fixed in application config, not user editable data. Cascading delete matches spec 0002's `recipe_ingredients`/`recipe_tags` pattern: a translation is purely derived data, safe to cascade when its parent catalog row is hard deleted (catalog rows are normally soft deleted via `deleted_at`, so this only fires if a row is ever purged outright).

`recipes.region` is explicitly out of scope for translation (AC-15): it stays the existing English filter key and URL segment (spec 0011's region slugs are unchanged), so no `region_translations` table exists. Its display label alone is translated via a small fixed lookup in `packages/shared` (a static map of the known region set, not an AI call, since regions are a small fixed vocabulary reused across many recipes rather than per recipe content).

The four read paths that embed catalog data through plain PostgREST selects rather than calling a Postgres function (`fetchRecipeDetail`, `fetchPantryItems`, `fetchFavorites`, `fetchRecipesByIds` for the homepage's recently viewed carousel) become Postgres RPC functions that take `locale` as a real parameter, the same pattern already proven for `search_recipes`, `search_ingredients`, `popular_recipes_by_region`, `recommend_recipes`, and `match_recipes_to_pantry`:

| Function | Replaces | Returns |
|---|---|---|
| `fetch_recipe_detail(p_id uuid, p_locale text)` | `fetchRecipeDetail`'s `.from("recipes").select(...)` embed | recipe row with locale resolved `name`/`instructions`/`glass`, its ingredients with locale resolved names and measures, `is_favorited` |
| `fetch_pantry_items(p_locale text)` | `fetchPantryItems`'s `.from("pantry_items").select(...)` embed | the caller's pantry rows with locale resolved ingredient `name` |
| `fetch_favorite_recipes(p_locale text, p_page_limit int, p_page_offset int)` | `fetchFavoriteRecipes`'s `.from("favorites").select(...)` embed | the caller's favorited recipes with locale resolved `name`, paginated |
| `fetch_recipes_by_ids(p_ids uuid[], p_locale text)` | `fetchRecipesByIds`'s `.from("recipes").select(...)` embed (recently viewed carousel) | recipe rows with locale resolved `name`, in the given id order |

No view resolves locale implicitly. The `## Correction` section above explains why the originally specified `recipes_localized`/`ingredients_localized` views are dropped.

**State transitions**: none; a translation row is either absent (fall back to English) or present (use it). No draft/review/published lifecycle.

**API surface**:

| Endpoint / function | Method | Key inputs | Key outputs | Auth | Key errors |
|---|---|---|---|---|---|
| `search_recipes` (existing, extended) | Postgres function | `query: text`, `locale: text` (new) | recipe rows with `name`/`instructions` resolved for `locale`, falling back to English | public read | none new |
| `search_ingredients` (existing, extended) | Postgres function | `query: text`, `locale: text` (new) | ingredient rows with `name` resolved for `locale` | public read | none new |
| `popular_recipes_by_region` / `list_popular_regions` (existing, extended) | Postgres function | `region: text`, `locale: text` (new) | recipe/region rows with translated `name` | public read | none new |
| `recommend_recipes` (existing, extended) | Postgres function | existing params, `locale: text` (new) | recipe rows with translated `name` | requires session (unchanged) | none new |
| `match_recipes_to_pantry` (existing, extended) | Postgres function | existing params, `locale: text` (new) | recipe rows and `missing_ingredients` with translated display names (matching logic itself untouched, still keyed on `ingredient_id`) | requires session (unchanged) | none new |
| `generate-drink-idea` (existing Edge Function, extended) | POST | existing body, `locale: text` (new) | generated recipe: `name`/`ingredients[].name`/`steps` written natively in `locale`, plus `ingredients[].source_name` (English) for verification | requires session (unchanged) | **changed**: pantry verification now checks `source_name` against the caller's English pantry names (unchanged set), not the localized `name`; a Spanish `locale` no longer causes a spurious verification failure |
| `fetch_recipe_detail` (new, replaces the `fetchRecipeDetail` embed) | Postgres function | `p_id: uuid`, `p_locale: text` | recipe row plus its ingredients, locale resolved `name`/`instructions`/`glass`/ingredient names/measures, `is_favorited` (favorites still scoped by `auth.uid()` inside the function) | public read (`recipes`'s existing RLS posture; favorited flag is `auth.uid()` scoped within the function body) | none new |
| `fetch_pantry_items` (new, replaces the `fetchPantryItems` embed) | Postgres function | `p_locale: text` | the caller's pantry rows, locale resolved ingredient `name` | `auth.uid()` scoped (unchanged) | none new |
| `fetch_favorite_recipes` (new, replaces the `fetchFavoriteRecipes` embed) | Postgres function | `p_locale: text`, `p_page_limit: int`, `p_page_offset: int` | the caller's favorited recipes, locale resolved `name`, ordered by favorited time, paginated | `auth.uid()` scoped (unchanged) | none new |
| `fetch_recipes_by_ids` (new, replaces the `fetchRecipesByIds` embed) | Postgres function | `p_ids: uuid[]`, `p_locale: text` | recipe rows, locale resolved `name`, in the given id order (used by the homepage's recently viewed carousel) | public read (unchanged) | none new |
| Translation backfill/import step (new) | script / import job step | `recipe_id` or full catalog, target locales | upserted `recipe_translations`/`ingredient_translations`/`tag_translations`/`recipe_ingredient_translations` rows, keyed by a `source_name_hash` comparison against the current English text | service role only (like the existing import job); bypasses `ai_generation_quota` (spec 0007) by design, since it is an operator run job, not a per user request | Claude Haiku call failure logged and retried on next run, never blocks the reimport's own catalog upsert |
| `updateLocale` (new, `packages/shared/src/preferences.ts`, mirrors `updateDisplayName`) | Shared column scoped upsert (not an RPC) | `locale: text` | updated `user_preferences.locale`; `fetchProfile`'s `Profile` type gains a `locale` field alongside `display_name`/`theme` | `auth.uid()` scoped | invalid locale code rejected client side against `SUPPORTED_LOCALES` before the call; DB `check` constraint is the backstop |

**Value sourcing**:

| Action | Value produced / displayed | Source |
|---|---|---|
| First page load, no stored preference | initial locale | Web: `Accept-Language` header, matched against `['en','es']`, else `'en'`. Mobile: `expo-localization`'s device locale, same matching |
| Locale switch | persisted locale | Guest: `localStorage` (web) / `AsyncStorage` (mobile). Signed in: `user_preferences.locale`, synced on sign in the same way spec 0018's `display_name` is |
| Any catalog read (search, detail, popular, recommendations) | recipe/ingredient/tag display name and recipe instructions | `recipe_translations`/`ingredient_translations`/`tag_translations` row for the caller's locale; `COALESCE` to the base English column when no row exists |
| Web page render | which locale segment is active | The `[locale]` URL path segment itself, always (AC-5, URL wins over stored preference) |
| Bare path with no locale segment | redirect target | The detected/stored preference above, computed once, one redirect |
| Sitemap / hreflang generation | which URLs and alternate links to emit | The fixed supported locale list (`['en','es']`) crossed with every non deleted recipe/region; for each locale the URL is built from `recipes.name` left joined to `recipe_translations` for that locale (a direct query, not `fetch_recipe_detail`, since sitemap generation reads every recipe in every locale at once rather than one recipe for one caller), not the bare English slug |
| Catalog reimport | which locales to translate a changed recipe into | The fixed supported locale list, minus `'en'` (the source) |
| Catalog reimport | whether a given recipe needs (re)translation | Comparison of a hash of the current English `name`+`instructions` against `recipe_translations.source_name_hash`; unchanged hash skips the Claude Haiku call entirely (AC-17) |
| Recipe URL slug (any locale) | the slug text itself | `fetch_recipe_detail`'s (or the sitemap query's) locale resolved `name` for that locale (translated name, or English when untranslated) run through the existing `slugify` helper from spec 0011; the trailing UUID remains the only lookup key, so `extractIdFromRecipeSlug` needs no locale awareness |
| Search in a non English locale | which rows match | `search_recipes`/`search_ingredients` OR the translated name's search index with the English name's existing index, so an untranslated recipe still surfaces (AC-14) |
| `generate-drink-idea` call | language the generated recipe is written in | The `locale` field the caller passes, sourced from the caller's current active locale (the same value driving AC-1/AC-2 elsewhere in that session) |
| `fetch_recipe_detail`/`fetch_pantry_items`/`fetch_favorite_recipes`/`fetch_recipes_by_ids` calls | which locale's translations render | The caller's current active locale, passed explicitly as `p_locale` on every call, sourced the same way `locale` already reaches `search_recipes` and the other RPCs: web's `useLocale()` (`next-intl`), mobile's `useActiveLocale()` |
| `generate-drink-idea` verification | which ingredient name is checked against the pantry | Claude's returned `source_name` (English), verified against the caller's existing English pantry ingredient names; the localized `name` field is display only and never enters verification |
| Sign in, guest had a local locale choice | which locale wins and gets stored | `user_preferences.locale` if already set (account wins); otherwise the guest's local value is written up (AC-16). An anonymous session upgraded to linked keeps its own row's value unchanged (no merge, same row) |
| Region display label (any locale) | the shown region name | A small fixed lookup keyed by the existing English `recipes.region` value, in `packages/shared`, not a translation table (AC-15); the region value used for filtering and the URL segment is untouched |

**Key invariants**:

- `ingredients.id`/`recipes.id`/`tags.id` remain the only identity used for matching, favoriting, pantry membership, and joins; `*_translations` tables and the locale aware RPC functions never change **which** rows are candidates or how they are scored (`match_recipes_to_pantry`'s join logic is keyed on `ingredient_id` throughout). They do change the **display strings** those matched rows return (recipe name, missing ingredient names), which is the correct and intended effect of AC-6/AC-13, not an exception to it.
- Every `*_translations` row is unique on its entity key plus `locale`; the translation upsert (backfill script and import job step alike) uses `ON CONFLICT (...) DO UPDATE`, so re-running a translation for the same entity and locale updates in place rather than duplicating.
- A translation is only ever produced for a locale in the fixed supported list; the supported list itself is application configuration, not stored data, so adding a third language later is a code change plus a backfill run, not a migration.
- The import job's existing transaction and advisory lock (spec 0002) are not extended to cover translation calls: translating is a slower, network dependent step and runs after the catalog transaction commits, so a translation failure or timeout never blocks or rolls back the catalog upsert itself (AC-9's "without manual intervention" means retried on the next scheduled run, not that every run must succeed).
- Locale codes are validated against the fixed supported list at every entry point (URL segment, `Accept-Language` match, `updateLocale`); an unrecognized code is treated as absent, never stored or routed to. The `user_preferences.locale` check constraint is the database level backstop for this rule.
- `generate-drink-idea`'s pantry verification always compares Claude's returned `source_name` (English) against the caller's pantry, never the localized `name`; this holds regardless of `locale`, so verification correctness does not depend on translation completeness or the target language.
- A recipe's slug is derived at read/render time (via `fetch_recipe_detail`'s locale resolved name for a single recipe, or the sitemap's direct query for all recipes), never stored per locale; changing a recipe's English name (and its downstream translation) changes the slug on the next read, exactly as spec 0011's existing slug already behaves for English.

**Security model**: `recipe_translations`, `ingredient_translations`, `tag_translations`, `recipe_ingredient_translations` follow the exact security model spec 0002 already defined for `recipes`/`ingredients`/`tags`: row level security enabled, `SELECT` open to `anon` and `authenticated`, no `INSERT`/`UPDATE`/`DELETE` policy for any client role, and those grants explicitly revoked; only the import job and backfill script, using the service role key, write to them. The new `fetch_recipe_detail`/`fetch_pantry_items`/`fetch_favorite_recipes`/`fetch_recipes_by_ids` functions are `security invoker` (run as the calling role, not the function owner), so they inherit the caller's existing RLS posture exactly as the direct table selects they replace did: `fetch_recipe_detail`/`fetch_recipes_by_ids` read public catalog data, `fetch_pantry_items`/`fetch_favorite_recipes` read `auth.uid()` scoped rows and rely on the same RLS policies on `pantry_items`/`favorites` that already scope them today, not on any authorization logic inside the function body. `user_preferences.locale` follows the existing `user_preferences` policy (spec 0008/0018): `auth.uid()` scoped read/write, no public access.

**Configuration required**:
- No new secret; the translation step reuses `ANTHROPIC_API_KEY`, already configured for spec 0007's `generate-drink-idea` function.
- A `SUPPORTED_LOCALES` constant (`['en', 'es']`) in `packages/shared`, the single source of truth both apps, the import job, and the sitemap read from, paired with a per locale text search config map (`en` → `'english'`, `es` → `'spanish'`) and the small fixed region display label lookup (AC-15).

**Critical test scenarios**:
- Happy path: a Spanish browser visits the bare domain, is redirected once to `/es`, sees translated navigation and a translated recipe detail page (name, instructions, ingredient list, measures, glass) with a Spanish keyword slug, verifies **AC-1**, **AC-2**, **AC-3**, **AC-5**, **AC-12**, **AC-15**.
- Happy path: a user adds "lime juice" to their pantry while viewing English, switches to Spanish, sees the same ingredient as "jugo de lima" in their pantry list, favorites list, and homepage, and drink ideas matching still includes the same recipes with translated missing ingredient names, verifies **AC-6**, **AC-13**.
- Happy path: a Spanish user requests an AI generated drink idea; the response is written natively in Spanish and passes pantry verification (verified via `source_name`, not the localized name), verifies **AC-10**.
- Happy path: a Spanish search for an ingredient or recipe with no Spanish translation yet still returns it, matched on the English name, verifies **AC-14**.
- Failure case: a newly imported recipe has no `recipe_translations` row yet for `'es'`; a Spanish visitor viewing it sees the English name, instructions, and slug, not a blank field or an error, verifies **AC-2**, **AC-12**.
- Failure case: the Claude Haiku translation call fails mid import run; the catalog upsert for that run still completes and commits, and the untranslated recipe is picked up on the next run, verifies **AC-9**.
- Failure case: reimporting a recipe whose English name and instructions are byte identical to the last run does not trigger a new Claude Haiku call (hash match), verifies **AC-17**.
- Auth/permission: no client role (anon or authenticated) can insert or update a `recipe_translations`/`ingredient_translations`/`tag_translations`/`recipe_ingredient_translations` row directly, verifies the extended Security model.
- Cross platform parity: switching language on web and on mobile both persist independently per platform for a guest; on sign in, a guest's local choice is written up only when the account has no stored locale, and the stored value wins otherwise, verifies **AC-4**, **AC-16**.

## Build plan

Ordered as a tracer bullet: one real end to end thread (a single Spanish string, one translated recipe, one working locale switch) before thickening to full catalog coverage and every surface, per the project's Tracer Bullet build approach.

1. [x] Add `SUPPORTED_LOCALES` and the per locale text search config map to `packages/shared`; write the migration for `recipe_translations`, `ingredient_translations`, `tag_translations`, `recipe_ingredient_translations` (RLS, grants, per locale FTS/trigram indexes, `source_name_hash` columns) and the `user_preferences.locale` column (with its check constraint); add the `recipes_localized`/`ingredients_localized` views; regenerate shared types, satisfies **AC-6**, **AC-9**, **AC-13**, **AC-14**, **AC-15**, **AC-17**.
2. [x] Wire `next-intl` into `apps/web` (`[locale]` route segment, message files, middleware for the bare path redirect using the URL wins rule) and `i18next`/`react-i18next`/`expo-localization` into `apps/mobile` (locale context, device detection, `AsyncStorage` persistence); translate a first minimal string set (nav, one page) to prove the pipe end to end, satisfies **AC-1**, **AC-3**, **AC-5**.
3. Write the one-time `translate-catalog.ts` backfill script (mirrors spec 0011's `tag-regions.ts` shape) calling Claude Haiku per recipe (name, instructions, glass, ingredient measures) and per ingredient/tag into Spanish, computing and storing `source_name_hash`, upserting the new translation tables; run it once against the live catalog, satisfies **AC-11**, **AC-15**.
4. [x] Extend `search_recipes`, `search_ingredients`, `popular_recipes_by_region`, `list_popular_regions`, `recommend_recipes`, and `match_recipes_to_pantry` with a `locale` parameter; recipe/ingredient search matches the translated name OR the English name (never English-only-invisible in a non English locale); every other function `COALESCE`s to English; regenerate types, satisfies **AC-2**, **AC-6**, **AC-7**, **AC-13**, **AC-14**. Also backfilled `popular_recipes_by_region`/`list_popular_regions` as an on-disk migration (`supabase/migrations/20260913150000_locale_aware_catalog_functions.sql`), previously applied live only with no committed source; threaded `locale` through all six `packages/shared` wrapper functions and every web/mobile call site (search, ingredient search, popular by region, recommendations, drink ideas, homepage) via `next-intl`'s `useLocale()`/`getLocale()` on web and a new `useActiveLocale()` hook (`apps/mobile/src/i18n/index.ts`) on mobile.
5. [x] Write the migration dropping `recipes_localized`/`ingredients_localized` (dead: nothing ever populated `request.locale`, so they always resolved to English) and adding `fetch_recipe_detail`, `fetch_pantry_items`, `fetch_favorite_recipes`, `fetch_recipes_by_ids` as `security invoker` Postgres functions taking `p_locale text`; regenerate shared types. Switch `fetchRecipeDetail`, `fetchPantryItems`, `fetchFavoriteRecipes`, and `fetchRecipesByIds` in `packages/shared` from `.from(table).select(...)` embeds to `.rpc(...)` calls against these functions, each taking a `locale: Locale = DEFAULT_LOCALE` parameter matching the pattern already used by `searchRecipes`/`searchIngredients`; thread `locale` through every web/mobile call site of these four functions (recipe detail page, pantry list, favorites list, the recently viewed carousel) the same way build plan step 4 already threaded it through the five RPC backed reads, satisfies **AC-2**, **AC-13**. The region display label lookup (AC-15) is deferred: neither app shows region on the recipe detail page today, and `recipes.region` has no fixed value set in the schema to build a lookup table against; tracked in Follow-up.
6. Add the translation step to the existing import job (after the catalog transaction commits, not inside its lock), comparing each recipe's `source_name_hash` before calling Claude Haiku so only new or genuinely changed recipes are (re)translated, satisfies **AC-9**, **AC-17**.
7. Complete UI string translation across both apps (all remaining chrome, static pages, error messages) and wire the locale switch control (account page/settings); add `locale` to `Profile`/`fetchProfile` and add `updateLocale` alongside `updateDisplayName` in `packages/shared/src/preferences.ts` (column scoped upsert, not an RPC); on sign in, write the guest's local value up only when `user_preferences.locale` is not already set, satisfies **AC-1**, **AC-4**, **AC-16**.
8. Change `generate-drink-idea`'s prompt template to require a `source_name` (English) alongside each ingredient's localized `name` in its response schema, and add the `locale` field to the request; switch pantry verification to check `source_name` against the caller's existing English pantry names, never the localized `name`, satisfies **AC-10**.
9. Change the recipe detail slug generation (and `apps/web/src/app/recipes/[locale]/[slug]/page.tsx`'s route) to build the slug from `fetch_recipe_detail`'s locale resolved name via the existing `slugify` helper, keeping the trailing UUID as the only lookup key; extend `apps/web/src/app/sitemap.ts` to emit both locale variants per URL (a direct query joining `recipes` to `recipe_translations` per locale for the slug) and add `hreflang` alternate metadata to recipe/region page templates, satisfies **AC-8**, **AC-12**.
10. Cross platform parity check: confirm both apps read the same `SUPPORTED_LOCALES`, the same fallback behavior, and that a signed in user's language choice converges across web and mobile per the sign in merge rule (AC-16).

## Consequences

**Positive**:
- The core product (recipe browsing, search, pantry, drink ideas) is genuinely usable end to end in Spanish, not just the surrounding chrome.
- Reuses proven infrastructure (Claude Haiku integration, quota pattern, RLS conventions, `user_preferences` sync) instead of introducing a new vendor or a parallel data access pattern.
- Adding a third language later is a config change (extend `SUPPORTED_LOCALES`) plus a backfill script run, not a new migration or a new code path.

**Negative / tradeoffs**:
- Every catalog read path (search, detail, popular, recommendations, pantry matching) gains a `locale` parameter and a fallback join or view lookup, a small but permanent complexity and query cost increase on tables that previously had none.
- Machine translated recipe instructions, measures, and glass names are not linguist reviewed; cocktail specific terminology may read awkwardly in Spanish until a review pass, if one is ever done.
- The import job's translation step adds real, ongoing AI cost and latency to reimports that touch new or genuinely changed recipes; the `source_name_hash` check bounds this to actual changes, not every run.
- `generate-drink-idea`'s response schema and prompt grow a required `source_name` field per ingredient purely for verification; this is a small but permanent addition to the contract, not something that goes away once translations mature.

**Neutral**:
- Web's `[locale]` URL segment moves every existing route (spec 0011's slugged recipe URLs, spec 0016's homepage, the account and pantry pages) under it; this is a routing change to every existing page, not additive.
- Mobile's locale lives in app state only, with no URL equivalent; there is no mobile SEO benefit to weigh, unlike web.
- The AI generated drink idea feature (spec 0007) becomes locale aware; its own spec is not renumbered, this decision only adds fields to its existing request/response shape.
- A recipe's URL slug is not stored; it is computed at read time in every locale (via `fetch_recipe_detail` or the sitemap's direct query), matching how the English slug already behaves today (spec 0011).

## Follow-up

- [ ] Consider a human review or glossary pass over the AI translated cocktail terminology (measures, garnish names) once real Spanish speaking usage surfaces specific complaints; Option 3 (professional translation) remains available as an upgrade path for the catalog for this reason.
- [ ] `docs/scope/scope.md`'s Deferred entry "Multi language / internationalization" should be promoted to a numbered, in-progress feature pointing at this spec.
- [ ] A future third language follows the same shape: extend `SUPPORTED_LOCALES`, re-run `translate-catalog.ts` for the new locale, no schema change needed.
- [ ] Idle anonymous account cleanup (spec 0017) and cron monitoring (feature 21) are unaffected by this spec; noted only to confirm no interaction was missed.
- [ ] Region display labels use a small fixed lookup rather than a translation table (AC-15); if the region set grows large or user submitted regions are ever introduced, revisit whether it still belongs as static config.
- [ ] AC-15's region label lookup is still unbuilt: query the distinct `recipes.region` values actually in the catalog, add a fixed en/es lookup in `packages/shared` for that set, add `region` to `RecipeDetail`/`fetch_recipe_detail`, and show a translated region chip on the recipe detail page on both apps (it isn't shown there today).

## Rationale

Reasoning, options considered, and forces from Context: see [rationale.md](rationale.md).
