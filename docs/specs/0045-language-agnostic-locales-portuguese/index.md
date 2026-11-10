# 0045. Language agnostic locales and Brazilian Portuguese

**Date**: 2026-10-31 (notes backfill for a new locale added 2026-11-03)
**Status**: In Progress

## Summary

This spec adds Brazilian Portuguese as the app's third language. First it removes every place the code assumes the only translation is Spanish, so the language after Portuguese really is just a config change plus a translation run. The database gets one small table listing the supported languages, and every function reads from it instead of naming `'es'` directly. Portuguese stays hidden from the language switcher, browser detection, and search engines until the catalog is translated and a native speaker has reviewed the UI text. The build starts after feature 41 (Finish Spanish UI translation) lands, so every UI string is already in the message files.

Recipe notes for a new language come from a separate `--locale` pass. It translates the reviewed English notes into that one language, fills only the empty fields, and writes its own review file. English and the other languages are never in that file, so they can't be overwritten.

## Requirements

**User stories**:
- As a Brazilian home bartender, I want to browse, search, and read recipes and the app itself in Portuguese, so the app feels native to me.
- As a Portuguese user, I want untranslated content to show in English rather than Spanish or a blank, so I always get the most accurate text available.
- As an admin, I want to fix a recipe's notes in any language from the web admin, so a bad translation doesn't need a script run.
- As the engineer, I want to test Portuguese on web and mobile before users can find it, and turn it on with one config change once it's ready.
- As the engineer, I want the next language after Portuguese to need no SQL function edits, only a row insert, TS config, message files, and a backfill run.

**Acceptance criteria**:
- **AC-1**: `pt` (written as Brazilian Portuguese) is a supported locale. Every string in the web message catalog and the mobile resource file renders in Portuguese under `/pt/...` on web and when `pt` is the active language on mobile.
- **AC-2**: Recipe name, instructions, glass, ingredient measures, ingredient and tag names, and the three recipe notes (style sentence, bartender tip, presentation tip) render in Portuguese when a `pt` translation exists. Otherwise they render in English, never Spanish, never blank, never an error.
- **AC-3**: A Portuguese search (`search_recipes`, `search_ingredients`) matches the Portuguese translated name using the `portuguese` text search config, or the English name. A recipe with no Portuguese translation is still findable.
- **AC-4**: The database's only list of supported locales is the `supported_locales` table. No live locale aware function, constraint, or column names a specific non English locale code or its text search config directly. (The English base columns on `recipes`/`ingredients`/`tags` keep their `'english'` config.)
- **AC-5**: Spanish behaves exactly as before the change. Spanish names, instructions, measures, notes, and search results are identical before and after the migrations. **One deliberate exception**: `recommend_recipes` results change in every locale, because its two live versions are merged and the ratings signal now applies (see *Functions rewritten*).
- **AC-6**: A test fails if `SUPPORTED_LOCALES` in `packages/shared` differs from the codes in the `supported_locales` seed (parsed from the migration files, no database needed), or if the locale codes in `generate-drink-idea` differ from `SUPPORTED_LOCALES`.
- **AC-7**: A locale that is supported but not in `LAUNCHED_LOCALES` does not appear in the web language menu or the production mobile language card. Browser or device detection never picks it, and it is left out of the sitemap, every hreflang alternate (page metadata and next-intl's `Link` headers), and `og:locale` alternates. Its `/pt/...` pages still render, with a `noindex` robots meta, a self canonical, and no alternates. robots.txt keeps its private path Disallow rules for every supported locale and never disallows a whole locale, since crawlers must reach the `noindex`. A stored preference (cookie, AsyncStorage, or `user_preferences.locale`) for an unlaunched locale counts as absent for detection and the bare path redirect, but is not deleted.
- **AC-8**: Mobile dev and preview builds list every supported locale in the language card, launched or not. Production builds list launched locales only.
- **AC-9**: The import job's translation step translates into every locale in `CATALOG_TRANSLATION_LOCALES` (Portuguese joins that list at launch, so imports don't translate it before then). `translate-catalog --locale <code>` translates one supported non English locale (rejecting `en` or an unsupported code), with Portuguese prompted as Brazilian Portuguese. Hash gating (spec 0020 AC-17) works per locale: an unchanged English recipe that already has a `pt` row is not translated again.
- **AC-10**: The default `propose-recipe-notes` run (no `--locale`) writes English notes plus one notes block per locale in `CATALOG_TRANSLATION_LOCALES`, keyed by locale code, to `recipe-notes-proposals.json`. `apply-recipe-notes` (no `--locale`) writes each locale's block into that locale's `recipe_translations` row and reports, per locale, any recipe it skipped because that row doesn't exist.
- **AC-11**: The web admin recipe form shows a notes section for every supported non English locale. Saving one updates only that locale's `recipe_translations` row. Changing an English note still clears that field in every locale (spec 0043 AC-10, unchanged). Saving notes for a locale whose translation row doesn't exist yet shows an explicit error, not a silent no op.
- **AC-12**: `generate-drink-idea` accepts `locale: "pt"` and writes the drink idea natively in Brazilian Portuguese. Pantry verification still checks the English `source_name` only.
- **AC-13**: Unit labels (`UNIT_LABELS`), batch unit labels (`BATCH_UNIT_LABELS`), and the drink idea limit copy have hand written Portuguese values, not machine translated ones.
- **AC-14**: Once `pt` is launched, its pages announce `pt-BR` in hreflang alternates, the sitemap, and the `<html lang>` attribute. URLs keep the `/pt/` segment.
- **AC-15**: `user_preferences.locale` accepts `'pt'`. A signed in user's Portuguese choice syncs and follows the sign in merge rule from spec 0020 AC-16.
- **AC-16**: The web language menu and the mobile language card build their options from `LAUNCHED_LOCALES` (or `SUPPORTED_LOCALES` in mobile dev builds), not hardcoded arrays. Each language shows its native name (English, Español, Português) whatever the active language.
- **AC-17**: `propose-recipe-notes --locale <code>` accepts any supported non English locale, launched or not, and rejects `en` or an unsupported code. It proposes only that locale's notes, written from the recipe's current English notes, into `recipe-notes-proposals.<code>.json`. It picks recipes that are not deleted, have all three English notes, and have a `<code>` translation row, and for each it proposes only the fields that are empty (null, or blank after trimming) on that row; a recipe with no empty field is left out. With `--all` it proposes all three fields for every such recipe and warns that applying rewrites reviewed text in that locale only. `--limit <n>` caps the run at the first `n` picked recipes. It never needs or touches the default file, and it lists every recipe it left out for a missing row (fix: `translate-catalog --locale <code>`) or missing English notes (fix: the default run). With zero proposals it writes no file. If any batch is dropped after its retries, it lists those recipes and exits nonzero; the recovery is to apply, then run again, which picks only the fields still empty.
- **AC-18**: `apply-recipe-notes --locale <code>` validates the whole `<code>` file locally before the RPC (which checks again), then writes only the fields present in it into that locale's `recipe_translations` rows, overwriting what is there. It never changes `recipes` or any other locale's row. A field whose English text changed since propose (including cleared to null) is not written and is reported as stale; the recipe's other fields still write. A recipe whose row has since disappeared is reported as missing, and a recipe deleted or unknown since propose is reported as gone; neither blocks the rest. A malformed row rejects the whole file with no writes.

## Decision

**Chosen option**: Option 1: a `supported_locales` table as the database's list of languages, with every locale aware function going through two helpers, then Brazilian Portuguese added on top and gated behind a `LAUNCHED_LOCALES` list.

One small table holds each locale's code and text search config. The four translation tables and `user_preferences.locale` point to it with foreign keys. `recipe_translations.name_search` is filled by a trigger that reads the config from that table. A `LAUNCHED_LOCALES` subset in `packages/shared` decides what users can discover. Learn articles and quizzes stay English only, as they are today for Spanish.

**Implementation skills**: `supabase-postgres-best-practices` (`supabase/agent-skills`, `.agents/skills/supabase-postgres-best-practices/`) · `nextjs-app-router-patterns` (`wshobson/agents`, `.agents/skills/nextjs-app-router-patterns/`) · `react-native-best-practices` (`callstackincubator/agent-skills`, `.agents/skills/react-native-best-practices/`) · `vitest` (`antfu/skills`, `.agents/skills/vitest/`)

## Feature design

**Data model sketch**:

| Entity | Primary key | Fields | Foreign keys | Cardinality |
|---|---|---|---|---|
| `supported_locales` (new) | `code` text | `text_search_config` regconfig, required | none | seeded `('en','english')`, `('es','spanish')`, `('pt','portuguese')` |
| `recipe_translations` (changed) | (`recipe_id`, `locale`), unchanged | `name_search` changes from a column generated as `to_tsvector('spanish', name)` to a plain `tsvector` set by trigger `recipe_translations_set_name_search` (BEFORE INSERT OR UPDATE OF `name`, `locale`) using the row's `supported_locales.text_search_config`. Other columns unchanged | `locale` → `supported_locales(code)`; `check (locale <> 'en')` replaces `check (locale in ('es'))` | N:1 into `recipes` and `supported_locales` |
| `ingredient_translations`, `tag_translations`, `recipe_ingredient_translations` (changed) | unchanged | unchanged | `locale` → `supported_locales(code)`; `check (locale <> 'en')` replaces `check (locale in ('es'))` | N:1 into `supported_locales` |
| `user_preferences.locale` (changed) | unchanged | nullable, unchanged | `locale` → `supported_locales(code)` replaces `check (locale is null or locale in ('en','es'))` | N:1, nullable |

Foreign keys use the default `ON DELETE NO ACTION`, so a locale with translations can't be deleted by accident.

- **Removing the old checks.** The five old checks were declared inline, so Postgres named them automatically. Read the real names from `pg_constraint` on the live database before writing migration A (likely `<table>_locale_check`) and drop each one by its exact name.
- **The search index.** The GIN index (a search index) `recipe_translations_name_search_idx` is dropped along with the generated column. Migration A recreates it.
- **The trigger function.** It is `security invoker` with `set search_path = ''`. It raises an error if the locale has no config, rather than storing a null tsvector.
- **Changing a config later.** If a locale's `text_search_config` changes, run `update recipe_translations set name = name where locale = <code>` to recompute `name_search`.
- **Other indexes.** The trigram indexes are not language specific, so they need no change.

**Helpers (new SQL functions)**:
- `public.resolve_locale(p_locale text) returns text`: returns `p_locale` when it is a row in `supported_locales` other than `'en'`, else `null` (meaning "use the English base row"). `stable`, `security invoker`, `set search_path = ''`. It replaces every `case when ... in ('es') then ... else null end`.
- `public.locale_search_config(p_locale text) returns regconfig`: the `text_search_config` for `resolve_locale(p_locale)`, else `'english'`. Search functions use it in place of the literal `'spanish'`.

**Functions rewritten through the helpers** (latest definition of each, body otherwise unchanged): `fetch_recipe_detail`, `fetch_recipes_by_ids`, `fetch_pantry_items`, `fetch_favorite_recipes`, `fetch_shopping_list_items`, `search_recipes`, `search_ingredients`, `match_recipes_to_pantry`, `popular_recipes_by_region`, `recommend_recipes`, `classic_recipes`, and `apply_recipe_notes` (redesigned, below).

- Each function computes the locale and the search config **once**, in its existing `resolved_locale` CTE (the query's setup block) or a plpgsql variable: `select public.resolve_locale(p) as locale, public.locale_search_config(p) as cfg`, then uses `(select cfg from resolved_locale)`. Never call a helper inline per row.
- **`recommend_recipes` has two live versions today**: the 5 argument one with `locale` (20260913150000, which the apps call) lacks the ratings signal, and the 4 argument one (20260917120200) has the ratings signal but no locale. Merge them into one 5 argument function with the ratings body plus locale, then drop the 4 argument signature. This is the AC-5 exception.

**API surface**:

| Endpoint / function | Method | Key inputs | Key outputs | Auth | Key errors |
|---|---|---|---|---|---|
| The 11 read functions above (changed) | Postgres functions | unchanged; `locale`/`p_locale` now accepts any `supported_locales` code | unchanged shape, resolved through `resolve_locale` | unchanged | none new; an unknown code still falls back to English |
| `apply_recipe_notes(p_proposals jsonb)` (changed, dropped and recreated) | Postgres function | an array of `{ id, drink_style, drink_style_note, bartender_tip, presentation_tip, translations: { <locale>: { drink_style_note, bartender_tip, presentation_tip } } }` replacing the `es_*` fields | `jsonb` object `{ <locale>: uuid[] }`: per locale, the recipe ids skipped for having no translation row (replaces the `uuid[]` return) | service role only, unchanged | `22023` when any id is unknown or deleted, a family is bad, a text is blank or over 240 chars, or a `translations` key is `'en'` or not in `supported_locales` (all or nothing, unchanged) |
| `admin_set_recipe_translation_notes` (new) | Postgres function, `security definer`, `search_path = ''` | `p_recipe_id uuid`, `p_locale text`, `p_drink_style_note text`, `p_bartender_tip text`, `p_presentation_tip text` | void; updates that one `recipe_translations` row, blank stored as null | same admin check as `admin_set_recipe_notes` | `42501` not admin; `22023` locale is `'en'` or unsupported, or text over 240 chars; `P0002` no translation row for that recipe and locale |
| `admin_set_recipe_notes` (unchanged) | Postgres function | unchanged | unchanged: an English change clears that field on every `recipe_translations` row, so it already covers `pt` | unchanged | unchanged |
| Admin recipe read in `packages/shared/src/adminRecipes.ts` (changed) | Supabase select | recipe id | adds `translationNotes`: per supported non English locale, `{ drink_style_note, bartender_tip, presentation_tip }` or `null` when no row exists | admin (existing page gate) | existing |
| `setRecipeTranslationNotes` (new, `adminRecipes.ts`) | shared wrapper over the new RPC | recipe id, locale, three notes | explicit result union, `{ reason: "no_translation_row" }` for `P0002` | admin | per the project's explicit error return pattern |
| `generate-drink-idea` (changed) | POST | `locale` now accepts `"pt"` | unchanged | unchanged | unchanged |
| `translate-catalog` script (changed) | CLI | new `--locale <code>` (default: every supported non English locale) | upserts translation rows per locale | service role | unchanged |
| `propose-recipe-notes` / `apply-recipe-notes` scripts, default run (changed) | CLI | review file blocks keyed by each `CATALOG_TRANSLATION_LOCALES` code | as `apply_recipe_notes` | service role | unchanged |
| `propose-recipe-notes --locale <code> [--all] [--limit <n>] [--force]` (new mode) | CLI | locale code; `--all` proposes every field; `--limit` caps picked recipes; `--force` replaces that locale's file | `recipe-notes-proposals.<code>.json`: an array of `{ id, name, source: { <field>: <English text> }, notes: { <field>: <text> } }`, `source` and `notes` holding the same one to three field keys, `source` copied verbatim from `recipes`; prints left out and dropped recipes by reason | service role | exits nonzero for `en` or an unsupported code, when the file exists without `--force`, or when any batch was dropped |
| `apply-recipe-notes --locale <code>` (new mode) | CLI | reads `recipe-notes-proposals.<code>.json` | calls `apply_recipe_translation_notes`, parses its result with a zod schema (no cast); prints stale fields, missing rows, and gone recipes | service role | validation errors list every bad row (`<id> (<name>): …`, duplicates as `appears more than once`), no writes |
| `apply_recipe_translation_notes(p_locale text, p_proposals jsonb)` (new) | Postgres function, `security definer`, `search_path = ''` | locale; array of `{ id, source, notes }` (the file rows minus `name`, `notes` trimmed, `source` untouched) | `jsonb` always holding all three keys as arrays, empty when none: `{ "missing_row": uuid[], "stale": [{ "id": uuid, "field": text }], "gone": uuid[] }`. A recipe lands in at most one of `gone` or `missing_row`; `stale` is per field and only for recipes in neither | service role only (execute revoked from `public`, `anon`, `authenticated`) | `22023` when the locale is `'en'` or unsupported, an id is repeated or not a uuid, `notes` is empty, a key is not one of the three note fields, `source` and `notes` keys differ, a `source` text is blank, or a `notes` text is blank or over 240 chars (all or nothing). An unknown or deleted id is reported under `gone`, not raised |

**Shared TS surface (`packages/shared/src/locale.ts`)**:
- `SUPPORTED_LOCALES = ["en", "es", "pt"]`; `LAUNCHED_LOCALES: readonly Locale[] = ["en", "es"]` until launch; `isLaunchedLocale()`.
- `CATALOG_TRANSLATION_LOCALES: readonly NonDefaultLocale[] = ["es"]` until launch: the locales the import job translates (`catalogTranslation.ts`'s `TARGET_LOCALES` reads this instead of `SUPPORTED_LOCALES`).
- `resolveStoredLocale(value, { allowUnlaunched = false })`: the one filter for any stored preference (web `NEXT_LOCALE` cookie, mobile AsyncStorage, `user_preferences.locale`, the sign in merge in `auth.ts`). It returns the locale only when it is supported, and also launched unless `allowUnlaunched` is set.
- `LOCALE_TEXT_SEARCH_CONFIG` gains `pt: "portuguese"` (kept for TS readers, checked against the table by the parity test).
- `LOCALE_HREFLANG: Record<Locale, string> = { en: "en", es: "es", pt: "pt-BR" }`, used for hreflang, the sitemap, and `<html lang>`.
- `LOCALE_AI_LANGUAGE: Record<Locale, string> = { en: "English", es: "Latin American Spanish", pt: "Brazilian Portuguese" }` for the catalog translation and recipe notes prompts. It replaces `LOCALE_DISPLAY_NAME` in `catalogTranslation.ts`. The drink idea edge function keeps its own `LOCALE_NAMES` with `es: "Spanish"` unchanged (AC-5) and adds `pt: "Brazilian Portuguese"`.
- `LOCALE_NATIVE_NAME: Record<Locale, string> = { en: "English", es: "Español", pt: "Português" }` for the switcher.
- `parseAcceptLanguage(header, allowed = LAUNCHED_LOCALES)`: matches only within `allowed`.
- `NonDefaultLocale = Exclude<Locale, "en">` for the per locale admin and notes types.

**Value sourcing**:

| Action | Value produced / displayed | Source |
|---|---|---|
| Any catalog read with `locale = 'pt'` | which translation row joins | `resolve_locale('pt')` → `'pt'` from `supported_locales`; no row → English base columns via `COALESCE` (AC-2) |
| Portuguese search | text search config for the query and translated index | `locale_search_config('pt')` → `supported_locales.text_search_config` = `'portuguese'` (AC-3) |
| Insert or update of a `recipe_translations` row | `name_search` | trigger: `to_tsvector(<row locale's text_search_config>, name)` |
| Any path without a locale prefix on web (not only `/`) | redirect locale | `resolveStoredLocale(NEXT_LOCALE cookie)`, else `parseAcceptLanguage(header, LAUNCHED_LOCALES)`, else `'en'`. Handled in `proxy.ts` before next-intl, which runs with `localeDetection: false` and `alternateLinks: false` (AC-7) |
| First launch on mobile | initial locale | `resolveStoredLocale(AsyncStorage value, { allowUnlaunched: showAllLocales })`, else the device `languageCode` if launched (so `pt-PT` and `pt-BR` both map to `pt`), else `'en'` |
| Mobile dev or preview build | `showAllLocales` | `__DEV__` or `process.env.EXPO_PUBLIC_SHOW_ALL_LOCALES === "true"`, set in the EAS `preview` profile's `env` (AC-8) |
| Language menu / card options | which locales are listed | `LAUNCHED_LOCALES` on web and production mobile; `SUPPORTED_LOCALES` when `showAllLocales` (AC-8, AC-16) |
| Language option label | displayed name | `LOCALE_NATIVE_NAME` (AC-16) |
| Sitemap and hreflang alternates | which locales are emitted and their codes | `LAUNCHED_LOCALES` crossed with pages, codes from `LOCALE_HREFLANG`. Covers `sitemap.ts` and the `alternates.languages` in `[locale]/page.tsx`, `popular/[region]/page.tsx`, `learn/[category]/[slug]/page.tsx`, and `recipes/[slug]/page.tsx` (its `otherLocales`) (AC-7, AC-14) |
| robots.txt private path rules | which locale prefixes get Disallow | `SUPPORTED_LOCALES`, the unchanged loop in `robots.ts` (AC-7) |
| `/pt/...` page while unlaunched | robots meta, canonical, alternates | `noindex`, a self canonical, and no alternates when `!isLaunchedLocale(locale)`, set in the `[locale]` layout's metadata (AC-7) |
| Catalog translation | target locales and prompt language | import job: `CATALOG_TRANSLATION_LOCALES`. Script: `--locale` (checked with `isSupportedLocale` and not `'en'`), else `CATALOG_TRANSLATION_LOCALES`. Prompt name from `LOCALE_AI_LANGUAGE` (AC-9) |
| Catalog translation | whether to translate a recipe again for a locale | `source_name_hash` on that locale's row versus the current English hash (AC-9) |
| Default notes run | locales to propose | `CATALOG_TRANSLATION_LOCALES` (so the rows exist); prompt name from `LOCALE_AI_LANGUAGE` (AC-10) |
| `--locale` notes run | target locale and prompt language | the `--locale` flag (checked with `isSupportedLocale` and not `'en'`); `LOCALE_AI_LANGUAGE[code]` and `LOCALE_AI_TERMS[code]` (AC-17) |
| `--locale` notes run | which recipes and which fields | `recipes` (`deleted_at` null, three English notes non blank) joined to that locale's `recipe_translations` row; fields are the row's notes that are null or blank after trimming, or all three with `--all`; then the first `--limit` recipes. Computed by a pure `planLocaleNoteBackfill` in `recipeNoteProposals.ts` (AC-17) |
| `--locale` notes run | text the model translates from, and `source` in the file | the recipe's current English `drink_style_note`, `bartender_tip`, `presentation_tip` from `recipes`, copied verbatim (AC-17) |
| `--locale` notes run | model output per recipe | structured output `{ recipes: [{ id, drink_style_note, bartender_tip, presentation_tip }] }`, each field a required string or null; after parsing, requested fields must be valid texts and unrequested ones null, and ids must match (`assertSameIds`), or the batch retries (AC-17) |
| `--locale` notes run | review file path | `reviewFilePath(\`recipe-notes-proposals.${code}.json\`)` (AC-17, AC-18) |
| `--locale` apply | whether a field is stale | `btrim(recipes.<field>, E' \t\r\n')` is distinct from `btrim(source.<field>, E' \t\r\n')`; a null English field is distinct, so stale (AC-18) |
| `--locale` apply | gone vs missing | gone: no `recipes` row with that id and `deleted_at` null. Missing: the recipe is live but has no `p_locale` translation row (AC-18) |
| Admin notes form | locale sections and their current values | `SUPPORTED_LOCALES` minus `'en'`; values from `translationNotes` (AC-11) |
| Drink idea in Portuguese | prompt language | the edge function's local `LOCALE_NAMES`, `pt: "Brazilian Portuguese"`, kept in sync by the parity test (AC-6, AC-12) |
| Portuguese UI strings | message text | `apps/web/messages/pt.json` and `apps/mobile/src/i18n/locales/pt.json`, drafted by AI and then reviewed by a native speaker (AC-1) |
| Unit and batch labels, limit copy | Portuguese words | `pt` entries in `units.ts`, `batch.ts`, `drinkIdeaLimitMessage.ts`, drafted by Claude in step 1 and approved by the native reviewer in step 8 (AC-13) |

**Key invariants**:
- `supported_locales` is the only list in SQL; `SUPPORTED_LOCALES` is the only list in TS. The parity test parses the seed `insert` from `supabase/migrations` and the `SUPPORTED_LOCALES` line in `supabase/functions/generate-drink-idea/index.ts` (Deno can't import `packages/shared`), comparing codes only.
- `CATALOG_TRANSLATION_LOCALES` holds only launched locales outside a backfill. At launch, `pt` is added to it and to `LAUNCHED_LOCALES` in the same commit.
- English is never a translation row (`check (locale <> 'en')`); it lives on the base rows.
- Fallback is always straight to English. No function chains through another translation.
- `LAUNCHED_LOCALES` is a subset of `SUPPORTED_LOCALES` (a type and a unit test both enforce it). Routing accepts every supported locale; only discovery is gated.
- Each translation row's `name_search` always uses its own locale's config. The trigger fires on `name` or `locale` changes, so it can't go stale.
- `apply_recipe_notes` stays all or nothing across every locale in a run.
- A `--locale` file holds one locale's notes only, and `apply_recipe_translation_notes` writes only to `recipe_translations`, and only rows of `p_locale` (it reads `recipes` for the stale and gone checks). That's the whole guarantee that reviewed English and other locales are never touched by a backfill.
- A null translated note means "needs translating": it is empty because it was never filled, or because an English edit cleared it (spec 0043 AC-10). The `--locale` pass keys off that alone, so it also refills stale fields in any locale, Spanish included.
- Both apply functions take the same advisory lock (`hashtext('apply_recipe_notes')`), so a default apply and a locale apply never interleave.

**Security model**: `supported_locales` gets row level security with a `SELECT` policy for `anon` and `authenticated` (the `security invoker` read functions and the helpers read it as the caller). There are no write policies, and `INSERT`/`UPDATE`/`DELETE`/`TRUNCATE` are explicitly revoked from `anon` and `authenticated` (Supabase's default privileges grant them on new public tables), so only migrations and the service role change it. `admin_set_recipe_translation_notes` copies `admin_set_recipe_notes`'s admin check and `security definer` posture, with execute revoked from `public`/`anon` and granted to `authenticated` (the function enforces admin). The translation tables' existing posture (public read, service role writes) is unchanged. No new PII and no compliance scope.

**Configuration required**: none new. `LAUNCHED_LOCALES` is code config. The translation steps reuse `ANTHROPIC_API_KEY`.

**Critical test scenarios**:
- Happy path: after the backfill, `/pt/recipes/<slug>` shows a Portuguese name, instructions, measures, notes, and ingredient names, with Portuguese chrome, verifies **AC-1**, **AC-2**.
- Happy path: a Portuguese search for a translated recipe name matches with Portuguese stemming, and a search for an untranslated recipe's English name still finds it, verifies **AC-3**.
- Regression (manual SQL in `verify.md`, run in the dashboard before migration A and after migration B): snapshot `fetch_recipe_detail`, `search_recipes`, and `match_recipes_to_pantry` output for a fixed set of recipes in `es`. They are identical (`recommend_recipes` is the documented exception), verifies **AC-5**.
- Structure (manual SQL in `verify.md`): a query over `pg_proc` finds no locale aware function body containing `'es'` or `'spanish'`, exactly one `recommend_recipes` exists, and no check constraint on a locale column names a code, verifies **AC-4**.
- Drift: add a fake code to `SUPPORTED_LOCALES` in a test fixture, and the parity test fails, verifies **AC-6**.
- Gating: with `pt` not launched, a browser sending `Accept-Language: pt-BR` on `/` and on `/pantry` is redirected to the `/en` path. The menu has no Português. The sitemap, page alternates, and response `Link` headers have no `pt`. `/pt/` renders with `noindex` and a self canonical. After a visit to `/pt/`, a bare path visit still lands on `/en` (the `NEXT_LOCALE` cookie it set is ignored), verifies **AC-7**.
- Gating: a signed in user with `user_preferences.locale = 'pt'` before launch lands on `/en` from the bare path, and the stored value is untouched, verifies **AC-7**, **AC-15**.
- Failure: `translate-catalog --locale pt` fails partway. Translated recipes show Portuguese, the rest show English, and a second run translates only the rest, verifies **AC-2**, **AC-9**.
- Failure: an admin saves Portuguese notes for a recipe with no `pt` row and sees the explicit error, verifies **AC-11**.
- Auth: a non admin calling `admin_set_recipe_translation_notes` gets `42501`, and no client role can insert into `supported_locales`, verifies **AC-11** and the Security model.
- Notes: a review file with `es` and `pt` blocks applies both, skips a recipe missing its `pt` row, and reports it under `pt`. A file in the old `es` shape is rejected with a clear error, verifies **AC-10**.
- Backfill plan (unit, pure): `planLocaleNoteBackfill` given recipes with full, partly empty, and filled `pt` rows, one with no row, and one with no English notes returns only the empty fields, leaves out the filled recipe, and lists the two gaps by reason; with `all` it returns all three fields for every eligible recipe, verifies **AC-17**.
- Backfill file (unit): the translation file validator rejects an empty `notes`, mismatched `source`/`notes` keys, an unknown field, a blank or over 240 text, and a duplicate id, verifies **AC-18**.
- Backfill isolation (manual SQL in `verify.md`): snapshot `recipes` notes and every `es` note, run `apply_recipe_translation_notes('pt', …)`, and both are unchanged while only the listed `pt` fields changed, verifies **AC-17**, **AC-18**.
- Backfill stale, missing, and gone (manual SQL in `verify.md`): change one recipe's English tip after propose, and apply reports it under `stale`, leaves its `pt` tip alone, and still writes its other fields; a proposal for a recipe whose `pt` row was deleted lands under `missing_row`; a proposal for a soft deleted recipe lands under `gone`; the rest of the file applies, verifies **AC-18**.
- Backfill run edges (unit, pure): with zero picked recipes no file is written; with a dropped batch the run lists it and exits nonzero; a model reply that fills an unrequested field or omits a requested one fails the batch, verifies **AC-17**.
- Backfill rejects: `--locale en` and `--locale xx` exit nonzero before any Haiku call, verifies **AC-17**.
- Drink idea: a `pt` request returns Portuguese text and passes verification, verifies **AC-12**.

## Build plan

Tracer Bullet: one thin, unlaunched Portuguese thread through the database, shared code, and web first, then each surface thickened. **Build after feature 41 is done**, so step 8 is one complete translation.

1. [x] **Thread.** Add `pt` and the new maps to `locale.ts` (`LAUNCHED_LOCALES = ["en","es"]`), filling every `Record<Locale, …>` the compiler flags (`pt` unit, batch, and limit copy drafted by Claude, reviewed in step 8). Migration A: `supported_locales` (seeded, RLS, grants), foreign keys replacing the five check constraints, the `name_search` column swap plus trigger plus index, the two helpers, and `fetch_recipe_detail` rewritten through them. Regenerate types. Add the parity test (a pure unit test that parses the migration and edge function files). Add `CATALOG_TRANSLATION_LOCALES = ["es"]` and point `TARGET_LOCALES` at it, so imports don't start translating `pt`. Create `pt.json` for web and mobile as copies of `en.json` with the nav translated, and register `pt` in mobile `initI18n`. Add `--locale` and `--limit` to `translate-catalog` and translate one recipe. Done when `/pt/recipes/<that recipe>` shows Portuguese and `/es/` is unchanged. Satisfies **AC-2**, **AC-4** (partly), **AC-5**, **AC-6**, **AC-13**, **AC-15**.
2. [x] Migration B: rewrite the other ten read functions through `resolve_locale`/`locale_search_config`, computed once in each `resolved_locale` CTE. Merge the two `recommend_recipes` versions and drop the 4 argument one. Regenerate types. Write `verify.md` with the `pg_proc` structure query and the Spanish snapshot queries. You run the snapshot before migration A and again after B. Satisfies **AC-3**, **AC-4**, **AC-5**.
3. [x] Launch gating and discovery: add `resolveStoredLocale` and use it for the cookie, AsyncStorage, and the sign in merge. `LAUNCHED_LOCALES` drives the `site-nav.tsx` and mobile `account.tsx` language options, replacing the hardcoded `["en","es"]` arrays (`showAllLocales` comes from `EXPO_PUBLIC_SHOW_ALL_LOCALES` in the EAS preview profile). Add native name labels. Restrict detection on mobile and in `apps/web/src/proxy.ts`: every unprefixed path is handled before next-intl, and routing gets `localeDetection: false` and `alternateLinks: false`. Filter the sitemap and the four pages' `alternates.languages` to launched locales with `LOCALE_HREFLANG` codes, and set `<html lang>`. Unlaunched locale pages get `noindex`, a self canonical, and no alternates. `robots.ts` stays on `SUPPORTED_LOCALES`. `ageGate.ts` picks up `pt` automatically (confirm with its test). Satisfies **AC-7**, **AC-8**, **AC-14**, **AC-16**.
4. [x] Catalog translation per locale: `catalogTranslation.ts` uses `LOCALE_AI_LANGUAGE` and per locale hash gating, and `--locale` is validated. You run the full `translate-catalog --locale pt` backfill (427 recipes, 295 ingredients, 62 tags). Satisfies **AC-2**, **AC-9**.
5. [x] Recipe notes per locale, in two parts.
    - **5a (built, one change left).** Migration C recreates `apply_recipe_notes` with the `translations` shape and the per locale skipped report. `recipeNoteProposals.ts`, `propose-recipe-notes`, and `apply-recipe-notes` use locale keyed blocks. Left to do: the default run uses `CATALOG_TRANSLATION_LOCALES` in place of `NON_DEFAULT_LOCALES` in its response schema, `TRANSLATION_LANGUAGES`, `TRANSLATION_TERMS`, validator, payload type, and mapper. Declare it `["es"] as const satisfies readonly NonDefaultLocale[]` and derive a `CatalogTranslationLocale` type from it, so the validator is a strict object of exactly those blocks (no more, no fewer) and the payload is `Record<CatalogTranslationLocale, …>`. The SQL function stays permissive (any supported key). The old `es` shape is rejected, so regenerate any pending `recipe-notes-proposals.json`. Satisfies **AC-10**.
    - **5b (locale backfill).** Migration D adds `apply_recipe_translation_notes` (a new function, so it applies cleanly whether or not migration C is already live). In `recipeNoteProposals.ts` add `planLocaleNoteBackfill` (pure), `RecipeTranslationNoteProposalSchema`, `validateRecipeTranslationNoteProposals`, and the payload mapper (strip `name`, trim). Add `--locale` (with `--all` and `--limit`) to `propose-recipe-notes`: a translation prompt that gets the recipe name, ingredients, and the English notes for the fields asked, and asks for a faithful translation of those notes (deliberately unlike the default prompt's "written naturally", so the reviewer can check against `source`). The output contract and checks are in Value sourcing; batches of 20. Write the file only once a batch succeeds. Add `--locale` to `apply-recipe-notes`, with a zod parse of the RPC result. Apply migration D in the dashboard, then regenerate types. Done when `--locale pt` on one recipe with an empty `pt` tip writes only that tip and the isolation check in `verify.md` passes. Then you run `propose-recipe-notes --locale pt` for the catalog, the step 8 reviewer works through `recipe-notes-proposals.pt.json`, and you run `apply-recipe-notes --locale pt` after that review. Satisfies **AC-2**, **AC-17**, **AC-18**.
6. [x] Admin per locale notes: migration C also adds `admin_set_recipe_translation_notes`. Add `translationNotes` to the admin read and `setRecipeTranslationNotes`. The admin recipe form renders one notes section per non English locale, and the English only hint in `messages` is updated. Satisfies **AC-11**.
7. [x] `generate-drink-idea`: add `pt` to its local list and `LOCALE_NAMES` (`es` stays `"Spanish"`), and deploy. The parity test from step 1 already covers its codes. Satisfies **AC-6**, **AC-12**.
8. [ ] UI strings: AI drafts the full `apps/web/messages/pt.json` and `apps/mobile/src/i18n/locales/pt.json` from the finished `en.json` files, then a Brazilian Portuguese speaker reviews them (privacy page and age gate first), along with the step 1 unit, batch, and limit copy, and the step 5b notes file. Satisfies **AC-1**.
9. [ ] Launch: after step 4's backfill, step 5b's notes apply, and step 8's review are signed off, add `"pt"` to `LAUNCHED_LOCALES` and `CATALOG_TRANSLATION_LOCALES` in one commit, ship a mobile build, and confirm the sitemap and hreflang in production. Satisfies **AC-7**, **AC-14**.

## Migration plan

**Strategy**: feature flagged (`LAUNCHED_LOCALES`), three additive migrations.
**Phases**:
1. Migration A (step 1): new table, constraint swaps, and the `name_search` swap in one transaction (drop the generated column, add a plain column, add the trigger, backfill with `update recipe_translations set name = name`, recreate the index). The table is about 430 rows, so the lock is brief.
2. Migration B (step 2): `create or replace` of ten functions, plus the `recommend_recipes` merge and the drop of its 4 argument version. The signatures the apps call are unchanged, so no client changes are needed.
3. Migration C (steps 5 and 6): drop and recreate `apply_recipe_notes` (its return type changes), and add the new admin function. Ship the script changes in the same commit.
4. Migration D (step 5b): `create function apply_recipe_translation_notes` with its grants. Purely additive; it changes no existing function or data until you run an apply. Run it in the dashboard before the first `apply-recipe-notes --locale`, since the script calls the function by name.
**Rollback**: Portuguese is invisible until step 9, so a bad phase is fixed forward. For a full revert of A, write a down SQL file beside the migration that runs these steps in order:
    1. Delete the `pt` translation rows.
    2. Drop the trigger and the trigger function.
    3. Drop the plain `name_search` column, which also drops its index.
    4. Add the column back as `generated always as (to_tsvector('spanish', name)) stored` and recreate `recipe_translations_name_search_idx`.
    5. Drop the five foreign keys and restore the original checks under their original names.
    6. Restore `fetch_recipe_detail` from 20261029120000.
    7. Drop the helpers, then drop `supported_locales`.
**Risks**: the `name_search` swap is the only live data transform, and the `recommend_recipes` merge is the only intended behavior change. Run the AC-5 snapshot before and after on a Supabase branch first. As your memory notes, you apply migrations in the SQL editor yourself.

## Consequences

**Positive**:
- The language after Portuguese is a row insert, TS config entries, message files, and a backfill run, with no SQL function edits.
- One fallback rule (straight to English) and one place per layer that lists languages.
- Admins can fix Spanish notes from the UI for the first time, since the per locale editor covers `es` too.
- Adding notes for the next language is one `--locale` run, one review, and one apply, with no risk to English or any other language's reviewed text. The same run refills fields that an English edit cleared, in any language.
- Portuguese can be tested in production on web and in dev builds on mobile before anyone can find it.

**Negative / tradeoffs**:
- Every read function gains a helper call and a read of a tiny table. That's negligible, but there's one more indirection when debugging.
- `name_search` is no longer a generated column, so its correctness now depends on a trigger.
- Three languages means about 1.5× the translation cost for the catalog, notes, and every new UI string. Every future feature now owes a Portuguese string.
- Portuguese recipe text is machine translated and not reviewed (only UI strings and notes get review), so cocktail terms may read oddly.
- Learn and quizzes stay English under `/pt/`, so those pages mix languages.
- `generate-drink-idea` keeps a duplicated locale list, guarded only by a test.
- Recommendations change for everyone once the ratings signal reaches the version the apps call. That's a fix, but users will notice it.
- Two launch lists (`LAUNCHED_LOCALES`, `CATALOG_TRANSLATION_LOCALES`) must change together at launch.
- Two apply functions and two review file shapes for notes. The default run's file changes shape when `pt` joins `CATALOG_TRANSLATION_LOCALES`, so a default file pending at launch must be regenerated.
- Translated notes follow the English wording rather than being written fresh in each language, so they read a little less native. The reviewer can rework any of them.
- A locale apply overwrites a hand edit made to a field after propose. Before launch nobody edits Portuguese, so the risk is small.

**Neutral**:
- Spec 0020's statement that a third language needs no migration was wrong. This spec corrects it, and 0020 gets a pointer.
- Changing the Spanish catalog prompt to "Latin American Spanish" only affects future translations. The hash gate does not translate existing rows again.

## Follow-up

- [x] Enroll a scope feature for this spec in `docs/scope/scope.md`, after feature 41 (feature 54).
- [ ] Portuguese App Store and Play Store listings (title, subtitle, description, keywords), for launch week.
- [ ] Learn articles and quizzes translation for every non English locale (they're English only in Spanish too). Needs its own spec.
- [ ] Number formatting: `pt` and `es` both use a decimal comma (`1,5`), but formatting today is locale blind. Decide whether measures should follow locale.
- [ ] Find a Brazilian Portuguese reviewer before step 8. Launch (step 9) waits on that review.
- [ ] If European Portuguese is ever needed, it would be a separate `pt-PT` locale. That needs region aware matching in `parseAcceptLanguage`.

## Rationale

Reasoning and options: see [rationale.md](rationale.md).
