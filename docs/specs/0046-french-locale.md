# 0046. French locale

**Date**: 2026-11-09
**Status**: Proposed

## Summary

This spec adds French (written as in France, code `fr`) as the app's fourth language on web, mobile, the recipe catalog, recipe notes, and drink ideas. It follows the path spec 0045 built for Portuguese: one `supported_locales` row, entries in `locale.ts`, message files, a catalog and notes backfill, a native review, then launch through `LAUNCHED_LOCALES`. The one new piece is accent insensitive recipe search for French, so "creme" finds "crème". It comes from a French text search config that strips accents, which needs no SQL function edits. French stays hidden until a native French speaker has reviewed the UI strings, labels, and every recipe note, and the build starts once Portuguese (feature 54) passes its verify run.

## Context

Spec 0045 made the locale system language agnostic. Every database function reads its language list and text search config (the rules Postgres uses to split and stem words for search) from `supported_locales`. The TS side reads `SUPPORTED_LOCALES` and a handful of `Record<Locale, …>` maps in `packages/shared/src/locale.ts`, and a parity test keeps the two lists in sync, plus the copy inside `generate-drink-idea`. Its stated promise is that the next language needs a row insert, TS config, message files, and backfill runs, with no SQL function edits. French is the first language to test that promise.

French differs from Spanish and Portuguese in four ways that matter here. First, it leans heavily on accents (crème, café, pêche, blanc d'œuf), and people often type without them on a phone. Today's search is accent sensitive in every language: the full text tier matches the stemmed words exactly, and the trigram tier (fuzzy matching on three letter chunks) only partly forgives a missing accent. Second, French typography puts a narrow no break space before `;`, `!`, `?` and a no break space before `:`, and uses « » quotes. Text without them reads as a careless translation. Third, French bar vocabulary has one dangerous ambiguity: "citron" alone usually means lemon, and lime is "citron vert", so a loose translation can swap the two in a recipe. Fourth, French uses a decimal comma, but measures format with a dot in every locale today (feature 58 is undecided).

The work runs on the same constraints as Portuguese. Migrations are applied by you in the Supabase SQL editor. Translation runs use Haiku through `ANTHROPIC_API_KEY`. The catalog is about 430 recipes, 295 ingredients, and 62 tags. Learn articles and quizzes stay English only in every locale until feature 64. Feature 54 still owes its verify and test runs, and any bug in the shared locale path found there would otherwise be copied into French.

The workspace spans `supabase/`, `packages/shared`, `packages/import-job`, `supabase/functions/generate-drink-idea`, `apps/web`, and `apps/mobile`. It is a repo wide change, but each app's part is small.

## Requirements

**User stories**:
- As a French speaking home bartender, I want to browse, search, and read recipes and the app itself in French, so it feels native to me.
- As a French user typing on a phone, I want "creme de cassis" to find what is written "crème de cassis", so missing accents never hide a recipe.
- As a French user, I want untranslated content to show in English rather than another language or a blank.
- As the engineer, I want to test French on web and mobile before users can find it, and launch it with one config commit once the native review signs off.

**Acceptance criteria**:
- **AC-1**: `fr` is a supported locale, written as French from France. Every string in the web message catalog and the mobile resource file renders in French under `/fr/...` on web and when `fr` is the active language on mobile. Strings use French typography: a narrow no break space (U+202F) before `;`, `!`, `?`, a no break space (U+00A0) before `:`, and « » quotes with U+202F inside them. French AI output (catalog text, notes, drink ideas) passes through `normalizeFrenchTypography` before it is stored or returned, so it follows the same rules whatever the model typed.
- **AC-2**: Recipe name, instructions, glass, ingredient measures, ingredient and tag names, and the three recipe notes render in French when a `fr` translation exists. Otherwise they render in English, never Spanish or Portuguese, never blank, never an error.
- **AC-3**: A French `search_recipes` query matches a recipe's French translated name whatever the accents on either side ("creme" matches "crème", "crème" matches "creme"), through the `public.french_unaccent` text search config, and still matches the English name. A recipe with no French translation is still findable. Accent insensitivity covers the French translated name only: the English base name keeps its `english` config and the trigram tier stays accent sensitive, so an untranslated recipe with an accented English name is matched as it is today. `search_ingredients` matches French ingredient names through trigram similarity, accent sensitive as it is for every language today.
- **AC-4**: Adding French edits no SQL function body. The only database changes are the `unaccent` extension in the `extensions` schema, the `public.french_unaccent` config, and the `('fr', 'public.french_unaccent')` row in `supported_locales`. The `pg_proc` structure query in [docs/specs/0045-language-agnostic-locales-portuguese/verify.md](0045-language-agnostic-locales-portuguese/verify.md) still finds no locale code or config name in any function body.
- **AC-5**: English, Spanish, and Portuguese behave exactly as before. Their names, instructions, measures, notes, and search results are identical before and after the French migration.
- **AC-6**: The locale parity test passes with `fr` in `SUPPORTED_LOCALES`, in the `supported_locales` seed, in `generate-drink-idea`'s list, and with `LOCALE_TEXT_SEARCH_CONFIG.fr` equal to `"public.french_unaccent"`, the exact string in the seed.
- **AC-7**: While `fr` is not in `LAUNCHED_LOCALES`, it follows spec 0045 AC-7 and AC-8 exactly: no French in the web menu or the production mobile language card, never picked by browser or device detection, absent from the sitemap and every hreflang alternate, and `/fr/...` pages render with `noindex`, a self canonical, and no alternates. Mobile dev and preview builds list Français.
- **AC-8**: Once launched, any browser or device language whose primary subtag is `fr` (`fr-FR`, `fr-CA`, `fr-BE`, `fr-CH`) picks `fr`. Hreflang alternates, the sitemap, and `<html lang>` announce `fr`. The switcher shows "Français" whatever the active language.
- **AC-9**: `translate-catalog --locale fr` translates the catalog into French as written in France, with the pinned terms in `LOCALE_AI_TERMS.fr` (lime "citron vert", lemon "citron jaune", and the bar tool names), and hash gating works per locale, so a second run translates only what is missing. After launch, the import job translates new recipes into `fr` too.
- **AC-10**: `propose-recipe-notes --locale fr` proposes French notes translated from the reviewed English notes, for empty `fr` fields only, into `recipe-notes-proposals.fr.json` (spec 0045 AC-17). The native reviewer reads every note in that file before `apply-recipe-notes --locale fr` runs, and the apply writes only `fr` rows, leaving English, Spanish, and Portuguese untouched (spec 0045 AC-18).
- **AC-11**: The web admin recipe form shows a French notes section. Saving it updates only that recipe's `fr` translation row, and a recipe with no `fr` row shows the explicit error from spec 0045 AC-11.
- **AC-12**: `generate-drink-idea` accepts `locale: "fr"` and writes the drink idea natively in French, with the pinned citrus terms and French typography (the response text passes through the edge function's copy of `normalizeFrenchTypography`). Pantry verification still checks the English `source_name` only.
- **AC-13**: Unit labels (`UNIT_LABELS`), batch unit labels (`BATCH_UNIT_LABELS`), and the drink idea limit copy have hand written French values, approved by the native reviewer. Unit labels stay `oz`, `ml`, `cl`, `l`, as in `es` and `pt`. Measures and batch amounts keep the dot decimal separator until feature 58; values already formatted through `Intl` (such as the limit message's time) follow French formatting as they do today for every locale.
- **AC-14**: `user_preferences.locale` accepts `'fr'`, and a signed in user's French choice syncs and follows the sign in merge rule from spec 0020 AC-16. Before launch, a stored `fr` preference counts as absent for detection and is left in place.
- **AC-15**: Launch is one commit that adds `"fr"` to both `LAUNCHED_LOCALES` and `CATALOG_TRANSLATION_LOCALES`, made only after the catalog backfill, the notes apply, and the native review are signed off. A mobile build ships with it, and the production sitemap and hreflang show `fr`.
- **AC-16**: Feature 60 (store listing copy) lists French among its locales, so the first French store release ships French title, subtitle, keywords, and description. The web launch does not wait on it.

## Options considered

### Option 1: Follow the 0045 path, with a French unaccent text search config

French gets its row in `supported_locales`, but its config is a new `public.french_unaccent`: a copy of Postgres's built in `french` config with the `unaccent` dictionary (a filter that turns "crème" into "creme") placed before the French stemmer. The `name_search` trigger and every search function already read the config from the table, so both the stored index and the query are unaccented with no function edits.

**Pros**:
- Fixes the most common French search miss (missing accents) for recipe names.
- Keeps 0045's promise: no SQL function body changes, and Spanish and Portuguese are untouched.
- One extension that ships with Postgres and is already available on the project.

**Cons**:
- Ingredient search stays accent sensitive, since it uses trigram matching, not the config.
- A config that differs from the other locales, which someone debugging search has to know about.
- Dropping the `unaccent` extension later would break the French config.

### Option 2: Follow the 0045 path exactly, with plain `french`

French is configured like Spanish and Portuguese, with the built in `french` config.

**Pros**:
- Zero new database pieces beyond the row. The purest test of the 0045 promise.
- Every locale behaves the same way.

**Cons**:
- "creme de cassis" only matches "crème de cassis" through the trigram tier, which ranks it lower and can miss short words ("peche" against "pêche" sits right at the similarity threshold).
- French typing without accents is common enough on phones that search would feel broken to French users.

### Option 3: Accent insensitive search for every locale first, then French

Wrap names and queries in `unaccent()` in every search function (full text and trigram tiers) for all languages, then add French on top.

**Pros**:
- Better search everywhere, including ingredient search and Spanish ("limon" for "limón").
- One rule for every locale.

**Cons**:
- Edits every search function and changes English, Spanish, and Portuguese results, which breaks this feature's AC-5 and needs its own before and after snapshot.
- Trigram indexes would need rebuilding on unaccented expressions to stay fast.
- Turns a config feature into a search redesign, and delays French behind it.

## Decision

**Chosen option**: Option 1: Follow the 0045 path, with a French unaccent text search config.

French is added as a supported locale with the `public.french_unaccent` config, gated behind `LAUNCHED_LOCALES` until a native review signs off, with no SQL function edits.

**Implementation skills**: `supabase-postgres-best-practices` (`supabase/agent-skills`, `.agents/skills/supabase-postgres-best-practices/`) · `nextjs-app-router-patterns` (`wshobson/agents`, `.agents/skills/nextjs-app-router-patterns/`) · `react-native-best-practices` (`callstackincubator/agent-skills`, `.agents/skills/react-native-best-practices/`) · `vitest` (`antfu/skills`, `.agents/skills/vitest/`)

## Rationale

The deciding force is that French users type without accents, and spec 0045 already routes every search through a per locale config read from a table. That makes the config the one place where accent handling can be added for French alone, with no function edits and no change to the other three languages. Option 2 would ship a search that misses the most common French query shape. Option 3 is the better long term answer for every language, but it is a search redesign with its own regression risk, and folding it in would hold French hostage to it. The ingredient search gap is real but smaller (trigram still catches most multi word names), so it becomes a follow up for every language at once rather than a French only branch in a function body, which is exactly what 0045 removed.

Everything else follows Portuguese because that path has been built and is about to be verified. Waiting for feature 54's verify means any shared path bug is fixed once. Plain `fr` in hreflang (not `fr-FR`) serves every French speaking region until a regional locale exists, the same way `es` serves all of Latin America. Launching with dot decimals matches Spanish and Portuguese today, and feature 58 fixes all three together.

Calls made while writing (you may override any):
- **Config name `public.french_unaccent`, schema qualified everywhere** (the migration, the seed, `LOCALE_TEXT_SEARCH_CONFIG`), so the parity test compares one exact string and functions with `search_path = ''` resolve it. Runner up: create it in `extensions`, which mixes project objects into the extension schema.
- **Unaccent on `word`, `hword`, and `hword_part` only.** `asciiword` tokens have no accents, so they keep the plain French stemmer. Runner up: map every token type, which changes nothing but adds noise.
- **`LOCALE_AI_LANGUAGE.fr` is "French as written in France"**, and `generate-drink-idea`'s `LOCALE_NAMES.fr` uses the same words. Runner up: plain "French", which lets the model drift to Quebec wording.
- **Typography rules live in `LOCALE_AI_TERMS.fr`**, appended to the catalog translation and notes prompts. The edge function can't import `packages/shared` (Deno), so it carries its own French instruction sentence, written out under *Shared TS surface* and duplicated by hand. The parity test checks codes only, so that text can drift; a comment beside it points to `LOCALE_AI_TERMS.fr`. Runner up: a separate typography map, which needs every prompt edited.
- **Typography is enforced in code, not only asked for.** Haiku often types plain spaces, so a pure, idempotent `normalizeFrenchTypography(text)` in `packages/shared` runs on French AI output before it is saved: catalog translation rows before upsert, notes before the review file is written (so the reviewer sees the final text), and drink idea text in the edge function's small copy. Runner up: prompt only, which leaves AC-1 untestable for AI text.
- **Unit labels unchanged** (`oz`, `ml`, `cl`, `l`) and `partsAmount` keeps `pt`, matching `es` and `pt`. The reviewer may change either. Runner up: "onces" for oz, which is rare in French bars.
- **Web plurals use ICU `one {…} other {…}` only.** ICU falls back to `other` for `many`.
- **No `_many` plural keys in the mobile `fr.json`.** French uses the `many` plural form only for exact millions (1 000 000), which no count in the app reaches. `_one` (which covers 0 and 1 in French, so "0 note" is correct) and `_other` are enough. Runner up: copy every `_other` key to `_many` for safety.
- **No new number formatting.** Measures keep the dot until feature 58, which this spec does not block on.

## Feature design

**Data model sketch**:

| Entity | Primary key | Fields | Foreign keys | Cardinality |
|---|---|---|---|---|
| `unaccent` extension (new, in `extensions`) | n/a | provides the `extensions.unaccent` dictionary | none | one per database |
| `public.french_unaccent` text search config (new) | n/a | `copy = pg_catalog.french`, then `alter mapping for hword, hword_part, word, hword_numpart, numword with extensions.unaccent, pg_catalog.french_stem` (`unaccent` is a filtering dictionary, so it passes the unaccented token on to the stemmer; "crème" and "creme" both stem to "crem", "œuf" and "oeuf" converge). Created before the `supported_locales` insert in the same file, or the regconfig cast fails | depends on `extensions.unaccent` | one |
| `supported_locales` (new row) | `code` | `('fr', 'public.french_unaccent')` | none | one row |
| `recipe_translations`, `ingredient_translations`, `tag_translations`, `recipe_ingredient_translations` (new rows only) | unchanged | `locale = 'fr'` rows from the backfills; `recipe_translations.name_search` set by the existing trigger with the French config | `locale` → `supported_locales(code)`, unchanged | N:1, unchanged |
| `user_preferences.locale` | unchanged | now accepts `'fr'` through the existing foreign key | unchanged | unchanged |

No table or column changes. All new pieces are additive.

**API surface**:

| Endpoint / function | Method | Key inputs | Key outputs | Auth | Key errors |
|---|---|---|---|---|---|
| The read and search functions from spec 0045 (unchanged) | Postgres functions | `locale`/`p_locale` now accepts `'fr'` | unchanged shape; French rows through `resolve_locale`, French config through `locale_search_config` | unchanged | none new |
| `generate-drink-idea` (changed) | POST | `locale` accepts `"fr"` | unchanged | unchanged | unchanged |
| `translate-catalog --locale fr` (no code change) | CLI | `fr` | upserts `fr` translation rows | service role | unchanged |
| `propose-recipe-notes --locale fr` / `apply-recipe-notes --locale fr` (no code change) | CLI | `fr` | `recipe-notes-proposals.fr.json`; apply report | service role | unchanged |
| Admin recipe form notes (no code change) | web | French section from `NON_DEFAULT_LOCALES` | `admin_set_recipe_translation_notes` with `p_locale = 'fr'` | admin | unchanged |

**Shared TS surface (`packages/shared/src/locale.ts`)**:
- `SUPPORTED_LOCALES = ["en", "es", "pt", "fr"]`. `LAUNCHED_LOCALES` and `CATALOG_TRANSLATION_LOCALES` unchanged until launch.
- `LOCALE_TEXT_SEARCH_CONFIG.fr = "public.french_unaccent"`.
- `LOCALE_HREFLANG.fr = "fr"`.
- `LOCALE_AI_LANGUAGE.fr = "French as written in France"`.
- `LOCALE_NATIVE_NAME.fr = "Français"`.
- `LOCALE_AI_TERMS.fr`, drafted, then approved in the native review: lime is "citron vert" and lemon is "citron jaune", never "citron" alone for lime, and the two kept distinct; shaker "shaker", jigger "doseur", muddler "pilon", strainer "passoire", bar spoon "cuillère à mélange"; French typography (U+202F before `;` `!` `?`, U+00A0 before `:`, « » with U+202F inside). The native reviewer approves this before the catalog backfill runs (build step 2).
- `normalizeFrenchTypography(text: string): string` (new, pure, in `packages/shared/src/frenchTypography.ts`): replaces a plain space, or no space, before `;` `!` `?` with U+202F; replaces a plain space before `:` with U+00A0, but only when the colon follows a letter or space and is followed by a space or the end (so `14:30` and URLs are untouched); turns `"…"` pairs into « … » with U+202F inside; leaves text already correct unchanged (idempotent). Applied only when the locale is `fr`.

**Edge function French instruction** (in `generate-drink-idea/index.ts`, beside `LOCALE_NAMES`, with a comment pointing to `LOCALE_AI_TERMS.fr`): `LOCALE_NAMES.fr = "French as written in France"`, and the language instruction for `fr` appends: `Lime is "citron vert" and lemon is "citron jaune"; never write "citron" alone for lime. Use French typography: a narrow no break space before ; ! ? and a no break space before :, and « » quotes.` The returned text then passes through a local copy of `normalizeFrenchTypography`. The `const SUPPORTED_LOCALES = [...]` line keeps its one line format, since the parity test parses it.

**Value sourcing**:

| Action | Value produced / displayed | Source |
|---|---|---|
| Any catalog read with `locale = 'fr'` | which translation row joins | `resolve_locale('fr')` → `'fr'` from `supported_locales`; no row → English base columns (AC-2) |
| French recipe search | config for the query and the translated index | `locale_search_config('fr')` → `supported_locales.text_search_config` = `public.french_unaccent` (AC-3) |
| Insert or update of a `fr` `recipe_translations` row | `name_search` | the existing trigger: `to_tsvector('public.french_unaccent', name)` (AC-3) |
| French ingredient search | match | trigram similarity on `ingredient_translations.name`, unchanged (AC-3) |
| Browser or device detection after launch | locale | `parseAcceptLanguage` / the mobile device `languageCode`, primary subtag `fr`, within `LAUNCHED_LOCALES` (AC-8) |
| Hreflang, sitemap, `<html lang>` | code | `LOCALE_HREFLANG.fr` = `"fr"` (AC-8) |
| Language option label | name | `LOCALE_NATIVE_NAME.fr` = `"Français"` (AC-8) |
| Catalog translation and notes prompts | language and pinned terms | `LOCALE_AI_LANGUAGE.fr`, `LOCALE_AI_TERMS.fr` (AC-9, AC-10) |
| Drink idea in French | prompt language and terms | the edge function's local `LOCALE_NAMES.fr` plus the French instruction sentence above (AC-12) |
| French AI output (catalog, notes, drink idea) | final punctuation | `normalizeFrenchTypography` in shared, or its copy in the edge function (AC-1, AC-12) |
| Catalog translation | whether to translate a recipe again for `fr` | `source_name_hash` on the `fr` row versus the current English hash; confirm in step 2 that the hash is stored per translation row, so per locale (AC-9) |
| French UI strings | message text | `apps/web/messages/fr.json`, `apps/mobile/src/i18n/locales/fr.json`, AI drafted from the `en.json` files, then native reviewed (AC-1) |
| Unit, batch, limit copy | French words | `fr` entries in `units.ts`, `batch.ts`, `drinkIdeaLimitMessage.ts`, hand written, then native reviewed (AC-13) |
| Measures and amounts | decimal separator | unchanged dot formatting, until feature 58 (AC-13) |
| Mobile language list in dev or preview | which locales | `SUPPORTED_LOCALES` when `showAllLocales`, unchanged (AC-7) |
| Launch | discovery and import translation | `"fr"` in `LAUNCHED_LOCALES` and `CATALOG_TRANSLATION_LOCALES`, one commit (AC-15) |

**Key invariants**:
- All 0045 invariants hold. In particular, `supported_locales` is the only list in SQL, `SUPPORTED_LOCALES` the only list in TS, and fallback goes straight to English.
- No SQL function body names `fr`, `french`, or `french_unaccent`. The config lives only in the `supported_locales` row.
- `LOCALE_TEXT_SEARCH_CONFIG.fr` and the seeded config are the same exact string, `public.french_unaccent`.
- `fr` joins `LAUNCHED_LOCALES` and `CATALOG_TRANSLATION_LOCALES` in the same commit, and only after review sign off.
- The `unaccent` extension is never dropped while a config depends on it. A database restore must create the extension before the config. If a Postgres upgrade changes the unaccent rules, recompute with `update public.recipe_translations set name = name where locale = 'fr'`.
- The edge function's French instruction duplicates `LOCALE_AI_TERMS.fr` by hand; a change to one changes the other in the same commit.
- `normalizeFrenchTypography` is idempotent: running it twice gives the same text.

**Security model**: no change. `supported_locales` keeps its read only posture for `anon` and `authenticated`, and only a migration adds the row. A text search config needs no grants. The `unaccent` extension goes in `extensions`, not `public`, matching the project's other extensions (Supabase's security advisor flags extensions in `public`). No new PII and no compliance scope.

**Configuration required**: none new. `LAUNCHED_LOCALES` is code config, and the translation runs reuse `ANTHROPIC_API_KEY`.

**Critical test scenarios**:
- Happy path: after the backfill, `/fr/recipes/<slug>` shows a French name, instructions, measures, notes, and ingredient names, with French chrome and French typography, verifies **AC-1**, **AC-2**.
- Typography (unit, pure): `normalizeFrenchTypography` fixes `Santé !`, `Note: ...`, and `"shaker"` into the French forms, leaves `14:30` and a URL alone, and returns already correct text unchanged, verifies **AC-1**, **AC-12**.
- Accents (manual SQL in the migration's check block): `to_tsvector('public.french_unaccent', 'Crème de cassis') @@ websearch_to_tsquery('public.french_unaccent', 'creme')` is true, and the same with the accents swapped, verifies **AC-3**.
- Accents (live): a French search for a translated recipe name typed without its accents finds it, and the English name of an untranslated recipe still finds it, verifies **AC-3**.
- Regression (manual SQL): snapshot `search_recipes` and `fetch_recipe_detail` for a fixed set of recipes in `es` and `pt` before and after the migration, and they are identical. Run the 0045 `pg_proc` structure query after, verifies **AC-4**, **AC-5**.
- Drift: the parity test fails if any one of the four lists lacks `fr`, or if `LOCALE_TEXT_SEARCH_CONFIG.fr` differs from the seed, verifies **AC-6**.
- Gating: before launch, a browser sending `Accept-Language: fr-FR` lands on `/en`, the menu has no Français, the sitemap and alternates have no `fr`, and `/fr/` renders `noindex` with a self canonical. A signed in user with `user_preferences.locale = 'fr'` lands on `/en`, and the stored value is untouched, verifies **AC-7**, **AC-14**.
- Detection: after launch, `Accept-Language: fr-CA` and a `fr-BE` device both pick `fr`, and the page's `<html lang>` is `fr`, verifies **AC-8**.
- Lime and lemon: in the backfilled catalog, every recipe whose English ingredients include lime shows "citron vert", and none shows plain "citron" for lime, verifies **AC-9**.
- Notes isolation: after `apply-recipe-notes --locale fr`, the English, `es`, and `pt` notes snapshot is unchanged (the 0045 `verify.md` isolation check, run for `fr`), verifies **AC-10**.
- Admin: saving French notes for a recipe updates only its `fr` row, verifies **AC-11**.
- Drink idea: a `fr` request returns French text with French punctuation and passes pantry verification, verifies **AC-12**.
- Layout: French strings run about 20% longer than English. The age gate, nav, recipe page, batch calculator, and account screen show no clipped or overflowing text at 360 px width on web and on a phone, verifies **AC-1**.

## Build plan

Tracer Bullet: one thin, unlaunched French thread through the database, shared code, the edge function, web, and mobile first, then the content and review thicken it. **Start after feature 54 passes `/check verify`.**

1. **Thread.** First you confirm the prerequisite: `select * from pg_available_extensions where name = 'unaccent'` returns a row (it did on 2026-11-09: version 1.1, not yet installed). Migration `<timestamp>_french_locale.sql`, in this order: `create extension if not exists unaccent with schema extensions`, the `public.french_unaccent` config, then `insert into public.supported_locales (code, text_search_config) values ('fr', 'public.french_unaccent');`. Add a commented check block with the accents query, kept free of `insert into public.supported_locales` and `('x', 'y')` tuples so the parity test's regex doesn't misread it. Write the rollback at `supabase/rollbacks/<timestamp>_french_locale_down.sql` (see Migration plan), never in `migrations/`. You run the `es`/`pt` snapshot, apply the migration in the SQL editor, and run the snapshot and the 0045 structure query again. Add `fr` and its map entries to `locale.ts`, and fill every `Record<Locale, …>` the compiler flags (`units.ts`, `batch.ts`, `drinkIdeaLimitMessage.ts` with hand written French). Add `normalizeFrenchTypography` with its unit test. Fix the tests that assume `fr` is unsupported or that list only three locales: `locale.test.ts` (lines 118, 151, 169 switch their unsupported example to `"de"`), `ageGate.test.ts` (the hardcoded `en|es|pt` regex gains `fr`), and `adminRecipes.test.ts` (expects `{ es, pt, fr }`). Add `fr` to `generate-drink-idea`'s `SUPPORTED_LOCALES` and `LOCALE_NAMES`, with the French instruction sentence and the local typography copy, and you deploy it. Create web and mobile `fr.json` as copies of `en.json` with the nav translated. On mobile, add `import fr from "./locales/fr.json"` and `fr: { translation: fr }` to `resources` in `apps/mobile/src/i18n/index.ts`, and confirm no `CFBundleLocalizations` or Android locale config exists in the app config that would also need `fr`. Add an `fr` case to `route-metadata.test.ts`. Wire `normalizeFrenchTypography` into `catalogTranslation.ts` (before upsert, `fr` only). Run `translate-catalog --locale fr --limit 1`. Done when `/fr/recipes/<that recipe>` shows French, a search without its accents finds it, and `/es/` and `/pt/` are unchanged. Satisfies **AC-3**, **AC-4**, **AC-5**, **AC-6**, **AC-7**, **AC-12**, **AC-14**.
2. Terms review, then catalog backfill: the native reviewer approves `LOCALE_AI_TERMS.fr` and the edge function's matching sentence first, so the backfill never needs a hash clearing fix like `20261031160000_pt_citrus_terms.sql`. Confirm `source_name_hash` is stored per translation row. Then you run `translate-catalog --locale fr` for the whole catalog (about 430 recipes, 295 ingredients, 62 tags), run it a second time to confirm it translates nothing, and spot check the lime and lemon terms. Satisfies **AC-2**, **AC-9**.
3. Notes proposal: wire `normalizeFrenchTypography` into the `--locale` notes run (before the file is written), then you run `propose-recipe-notes --locale fr` for the catalog, and confirm the admin form shows the French section on one recipe. Satisfies **AC-10**, **AC-11**.
4. UI strings: AI drafts the full web and mobile `fr.json` from the current `en.json` files, in France French with French typography, ICU `one`/`other` plurals on web and `_one`/`_other` keys on mobile. Add a unit test that web `fr.json` has exactly the same key paths as `en.json` (the web message types come from `en.json`). Satisfies **AC-1**.
5. Native review: a French speaker reviews the UI strings (privacy page and age gate first), the unit, batch, and limit copy, a sample of drink ideas, and every note in `recipe-notes-proposals.fr.json`. You apply the fixes, run the layout check at 360 px, then run `apply-recipe-notes --locale fr`. Satisfies **AC-1**, **AC-10**, **AC-12**, **AC-13**.
6. Launch: once steps 2 to 5 are signed off, add `"fr"` to `LAUNCHED_LOCALES` and `CATALOG_TRANSLATION_LOCALES` in one commit. In the same commit, add an `fr` block to the `notesByLocale` fixture in `recipeNoteProposals.test.ts` (it is keyed by `CATALOG_TRANSLATION_LOCALES`, so typecheck fails without it). Regenerate any pending default `recipe-notes-proposals.json` (its shape gains an `fr` block), ship a mobile build, and confirm the sitemap, hreflang, and detection in production. Satisfies **AC-8**, **AC-15**.
7. Store listings: feature 60's row lists French with the other locales, so the first French store release carries French listing copy. Satisfies **AC-16**.

## Migration plan

**Strategy**: feature flagged (`LAUNCHED_LOCALES`), one additive migration.
**Phases**:
1. The French migration (step 1): extension, config, and row in one transaction. It touches no existing row, so it takes no meaningful lock.
2. The backfills (steps 2 and 3) only insert `fr` rows.
**Rollback**: French is invisible until step 6, so a bad step is fixed forward. For a full revert, the down SQL at `supabase/rollbacks/<timestamp>_french_locale_down.sql` (never in `migrations/`, where the CLI would run it), in order: deletes the `fr` rows from `recipe_ingredient_translations`, `recipe_translations`, `ingredient_translations`, and `tag_translations`, sets `user_preferences.locale` to null where it is `'fr'`, deletes the `fr` row from `supported_locales`, drops `public.french_unaccent` (before the extension it depends on), and drops the `unaccent` extension if nothing else uses it. Then revert the TS commit.
**Risks**: a mistake in the config's mapping would make French search miss, but it cannot affect other locales, since their configs are untouched. The fix is to correct the config and recompute with `update public.recipe_translations set name = name where locale = 'fr'`. Run the snapshot before and after, as for 0045.

## Consequences

**Positive**:
- French users find recipes whether or not they type accents.
- It proves the 0045 promise: a fourth language with no SQL function edits.
- A per locale accent strategy now exists as a pattern for later languages, as a config choice rather than code.

**Negative / tradeoffs**:
- Ingredient search (pantry, shopping list) stays accent sensitive for French, so "peche" may rank "pêche" low or miss it.
- French search behaves differently from Spanish and Portuguese, which stay accent sensitive. Someone debugging search has to know that the config differs.
- Four languages means about 2× the translation cost of English plus Spanish for the catalog, the notes, and every new UI string, and every future feature owes a French string.
- Measures show "1.5 cl" with a dot, which reads as foreign to French users until feature 58.
- French recipe text (names, instructions) is machine translated and not reviewed, as for Portuguese. Only UI strings, labels, and notes are reviewed.
- Learn and quizzes stay English under `/fr/`, so those pages mix languages.
- Reviewing every note is the slowest part of the launch, and launch waits on it.

**Neutral**:
- The default notes run's file gains an `fr` block at launch, so a pending default file must be regenerated then.
- `generate-drink-idea` keeps its duplicated locale list, guarded by the parity test.

## Follow-up

- [ ] Find a native French reviewer before build step 5. Launch waits on that review.
- [x] Update feature 60 in `docs/scope/scope.md` so its copy covers English, Spanish, Brazilian Portuguese, and French.
- [x] Enroll a scope feature: accent insensitive ingredient search (and recipe search for the other locales), likely `unaccent` on both sides of the trigram tier, with its own before and after snapshot (feature 77).
- [x] Canadian French (`fr-CA`), if ever needed, would be a separate locale with its own fallback rules, like European Portuguese (feature 76). On the Deferred list.
- [x] Feature 58 (number formatting) now covers French as well, which uses a decimal comma and a space as the thousands separator.
