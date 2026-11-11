# 0047. Russian locale

**Date**: 2026-11-10
**Status**: In Progress

## Summary

This spec adds Russian (code `ru`) as the app's fifth language on web, mobile, the recipe catalog, recipe notes, and drink ideas, following the French path from spec 0046. Russian is the first language in a non Latin script, so it also settles the open questions the other non Latin languages share. Recipe URLs turn Cyrillic names into Latin letters (transliteration). Web loads a heading font per locale, because the brand heading font has no Cyrillic. A test makes sure every plural form exists (Russian has four). Search needs only the built in `russian` setting. Russian stays hidden until a native speaker signs off, and the build starts once French passes its verify run.

The decision history (context, options considered, and rationale) lives in [rationale.md](rationale.md).

## Requirements

**User stories**:
- As a Russian speaking home bartender, I want to browse, search, and read recipes and the app itself in Russian, with correct word endings for counts, so it feels native.
- As a Russian user, I want "ликер" to find "ликёр", and an English name like "Margarita" to still work.
- As a Russian user sharing a recipe link, I want a readable URL, not a bare id.
- As the engineer, I want the first non Latin locale to set the pattern for slugs, fonts, and plurals, so Hindi, Japanese, Korean, Chinese, and Arabic reuse it instead of each solving it again.

**Acceptance criteria**:
- **AC-1**: `ru` is a supported locale. Every string in the web message catalog and the mobile resource file renders in Russian under `/ru/...` on web and when `ru` is the active language on mobile, addressing the user with lowercase «вы». Strings use Russian typography: « » quotes and a spaced em dash ( — ) with a no break space (U+00A0) before it. Russian AI output (catalog text, notes, drink ideas) passes through `normalizeRussianTypography` before it is stored or returned.
- **AC-2**: Recipe name, instructions, glass, ingredient measures, ingredient and tag names, and the three recipe notes render in Russian when a `ru` translation exists. Otherwise they render in English, never another language, never blank, never an error.
- **AC-3**: A Russian `search_recipes` query matches a recipe's Russian name through the built in `russian` config, with ё and е interchangeable ("ликер" finds "ликёр" and the reverse), and still matches the English name. `search_ingredients` matches Russian ingredient names through trigram similarity, case insensitively.
- **AC-4**: Adding Russian edits no SQL function body. The only database change is the `('ru', 'russian')` row in `supported_locales`. The `pg_proc` structure query in [0045 verify.md](0045-language-agnostic-locales-portuguese/verify.md) still finds no locale code or config name in any function body.
- **AC-5**: English, Spanish, Portuguese, and French behave exactly as before. Their names, instructions, measures, notes, search results, and recipe slugs are identical before and after the Russian migration and the `slugify` change.
- **AC-6**: The locale parity test passes with `ru` in `SUPPORTED_LOCALES`, the `supported_locales` seed, and `generate-drink-idea`'s list, and with `LOCALE_TEXT_SEARCH_CONFIG.ru` equal to `"russian"`.
- **AC-7**: While `ru` is not in `LAUNCHED_LOCALES`, it follows spec 0045 AC-7 and AC-8: no Русский in the web menu or the production mobile language card, never picked by detection, absent from the sitemap and every hreflang alternate, and `/ru/...` pages render with `noindex`, a self canonical, and no alternates. Mobile dev and preview builds list Русский.
- **AC-8**: Once launched, any browser or device language whose primary subtag is `ru` (`ru-RU`, `ru-UA`, `ru-KZ`, `ru-BY`) picks `ru`. Ukrainian (`uk`), Belarusian (`be`), and Kazakh (`kk`) never pick `ru`. Hreflang, the sitemap, and `<html lang>` announce `ru`, and the switcher shows "Русский" whatever the active language.
- **AC-9**: A recipe slug built from a Cyrillic name is transliterated into Latin letters with the table under *Shared TS surface* (Маргарита becomes `margarita-<uuid>`, Белый русский becomes `belyy-russkiy-<uuid>`), never the bare `recipe-<uuid>` fallback when the name has Cyrillic letters. The Ukrainian and Belarusian letters і, ї, є, ґ, ў are mapped too, so a loanword never loses letters. Links, canonicals, and the sitemap use the transliterated slug. Region slugs stay English and are unchanged.
- **AC-10**: On web, `/ru` pages render headings in Lora and body text in Inter, both with their Cyrillic glyphs, with no Georgia fallback in headings. Pages in every other locale keep Fraunces and do not download Lora. The `/ru` Open Graph share image renders its Russian tagline in Lora SemiBold with no missing glyph boxes; every other locale's image is unchanged.
- **AC-11**: Every plural message has every plural form its locale uses for whole numbers. A unit test derives the required forms per locale from `Intl.PluralRules` (the forms reached by the counts 0 to 1000, plus `other`) and fails if a mobile `*_<form>` key family or a web ICU `plural` block in any non English locale lacks one. For `ru` that is `one`, `few`, `many`, `other`. A second unit test runs the real mobile i18next instance in Node and asserts that `ru` counts 1, 2, 5, 21 return the `_one`, `_few`, `_many`, `_one` strings. On mobile, a `ru` count of 2 also renders the `_few` string on a real device.
- **AC-12**: In `ru`, a message that inserts a name or noun (any placeholder other than a count) is phrased so the inserted value stands alone as a label (`Не хватает: {names}`), never inside a sentence that needs a case ending. A unit test lists every message in web and mobile `en.json` with a non count placeholder and fails when that list changes without a matching update to the reviewed list kept beside the test, so a new such message is caught. The native reviewer checks the list.
- **AC-13**: Unit labels show `унц.`, `мл`, `сл`, `л` in `ru`. Batch labels and the drink idea limit copy have hand written Russian values. All are approved by the native reviewer. Measures keep the dot decimal until feature 58.
- **AC-14**: `translate-catalog --locale ru` translates the catalog with the pinned terms in `LOCALE_AI_TERMS.ru` (lime «лайм», lemon «лимон», and the bar tools), and hash gating works per locale, so a second run translates nothing. After launch, the import job translates new recipes into `ru` too.
- **AC-15**: `propose-recipe-notes --locale ru` proposes Russian notes for empty `ru` fields only, into `recipe-notes-proposals.ru.json`. The native reviewer reads every note before `apply-recipe-notes --locale ru` runs, and the apply writes only `ru` rows.
- **AC-16**: The web admin recipe form shows a Russian notes section, and saving it updates only that recipe's `ru` row.
- **AC-17**: `generate-drink-idea` accepts `locale: "ru"` and writes the drink idea natively in Russian, with lowercase «вы», the pinned citrus terms, and Russian typography (its copy of `normalizeRussianTypography`). Pantry verification still checks the English `source_name` only.
- **AC-18**: `user_preferences.locale` accepts `'ru'`, syncs, and follows the sign in merge rule from spec 0020 AC-16. Before launch, a stored `ru` preference counts as absent for detection and is left in place.
- **AC-19**: Launch is one commit that adds `"ru"` to both `LAUNCHED_LOCALES` and `CATALOG_TRANSLATION_LOCALES`, made only after the catalog backfill, the notes apply, and the native review are signed off. A mobile build ships with it, and the production sitemap and hreflang show `ru`.
- **AC-20**: Feature 60 lists Russian among its store listing locales. The web launch does not wait on it.

## Decision

**Chosen option**: Option 1: The 0045 path, plus three reusable non Latin pieces.

Russian is added with the built in `russian` config and no SQL function edits, gated behind `LAUNCHED_LOCALES` until a native review signs off, and it introduces transliterated slugs, per locale web heading fonts, and a plural forms test that later non Latin locales reuse.

**Implementation skills**: `supabase-postgres-best-practices` (`supabase/agent-skills`, `.agents/skills/supabase-postgres-best-practices/`) · `nextjs-app-router-patterns` (`wshobson/agents`, `.agents/skills/nextjs-app-router-patterns/`) · `react-native-best-practices` (`callstackincubator/agent-skills`, `.agents/skills/react-native-best-practices/`) · `vitest` (`antfu/skills`, `.agents/skills/vitest/`)

## Feature design

**Data model sketch**:

| Entity | Primary key | Fields | Foreign keys | Cardinality |
|---|---|---|---|---|
| `supported_locales` (new row) | `code` | `('ru', 'russian')` | none | one row |
| `recipe_translations`, `ingredient_translations`, `tag_translations`, `recipe_ingredient_translations` (new rows only) | unchanged | `locale = 'ru'` rows from the backfills; `name_search` set by the existing trigger with `russian` | `locale` → `supported_locales(code)`, unchanged | N:1, unchanged |
| `user_preferences.locale` | unchanged | now accepts `'ru'` through the existing foreign key | unchanged | unchanged |

No table, column, extension, or config changes.

**API surface**:

| Endpoint / function | Method | Key inputs | Key outputs | Auth | Key errors |
|---|---|---|---|---|---|
| Read and search functions from spec 0045 (unchanged) | Postgres functions | `locale`/`p_locale` now accepts `'ru'` | unchanged shape | unchanged | none new |
| `generate-drink-idea` (changed) | POST | `locale` accepts `"ru"` | unchanged | unchanged | unchanged |
| `translate-catalog --locale ru` (no code change beyond the typography branch) | CLI | `ru` | upserts `ru` translation rows | service role | unchanged |
| `propose-recipe-notes` / `apply-recipe-notes --locale ru` (typography branch only) | CLI | `ru` | `recipe-notes-proposals.ru.json`; apply report | service role | unchanged |
| Admin recipe form notes (no code change) | web | Russian section from `NON_DEFAULT_LOCALES` | `admin_set_recipe_translation_notes` with `p_locale = 'ru'` | admin | unchanged |
| `slugify(input, fallback)` (changed) | TS, pure | any string | Latin slug; Cyrillic transliterated first | n/a | none |

**Shared TS surface (`packages/shared/src/`)**:
- `locale.ts`: `SUPPORTED_LOCALES = ["en", "es", "pt", "fr", "ru"]`; `LOCALE_TEXT_SEARCH_CONFIG.ru = "russian"`; `LOCALE_HREFLANG.ru = "ru"`; `LOCALE_AI_LANGUAGE.ru = "Russian"`; `LOCALE_NATIVE_NAME.ru = "Русский"`. `LAUNCHED_LOCALES` and `CATALOG_TRANSLATION_LOCALES` unchanged until launch.
- `LOCALE_AI_TERMS.ru`, drafted then approved by the native reviewer before the backfill: address the reader with lowercase «вы»; lime «лайм», lemon «лимон», kept distinct; shaker «шейкер», jigger «джиггер», muddler «мадлер», strainer «стрейнер», bar spoon «барная ложка», simple syrup «сахарный сироп», bitters «биттер»; write ё where standard; « » quotes and a spaced em dash.
- `seo.ts`: `SLUG_TRANSLITERATION: Readonly<Record<string, string>>` with the 33 lowercase Russian letters (а a, б b, в v, г g, д d, е e, ё e, ж zh, з z, и i, й y, к k, л l, м m, н n, о o, п p, р r, с s, т t, у u, ф f, х kh, ц ts, ч ch, ш sh, щ shch, ъ "", ы y, ь "", э e, ю yu, я ya) plus і i, ї yi, є ye, ґ g, ў u. `slugify` first replaces each character in U+0400 to U+04FF with the table value of its lowercase form (a Cyrillic letter missing from the table is dropped), then runs the existing `NFKD` pipeline unchanged. Characters outside that block are never touched before the existing pipeline.
- `russianTypography.ts`: `normalizeRussianTypography(text: string): string`, as in Rationale.
- `units.ts`: `oz: "унц."`, `ml: "мл"`, `cl: "сл"`, `l: "л"` for `ru`. `batch.ts`, `drinkIdeaLimitMessage.ts`: hand written `ru` entries.

**Web surface**: `layout.tsx` adds `Lora` from `next/font/google` and the `DISPLAY_FONT_BY_LOCALE` map, plus `cyrillic` on Inter. Fraunces' `@font-face` rule still ships in the CSS on `/ru`, but is never downloaded there. `globals.css` gains `:lang(ru) main p, :lang(ru) main li { hyphens: auto; }`. `opengraph-image.tsx` picks its `.ttf` through `DISPLAY_FONT_BY_LOCALE`, with `Lora-SemiBold.ttf` bundled beside the Fraunces file. `messages/ru.json` matches `en.json`'s key paths. The age gate's `AGE_GATE_EXEMPT_PATTERN` is built from the locale list, so only its comment changes.

**Mobile surface**: `apps/mobile/src/i18n/index.ts` adds `import ru from "./locales/ru.json"` and `ru: { translation: ru }` to `resources`. i18next ^26 uses `_one`/`_few`/`_many`/`_other` suffixes by default, so no `compatibilityJSON` change. `app.json` has no native locale list to update. Mobile text gets no hyphenation; long words rely on the 360 px layout check.

**Checked, no change needed**: the `localeCompare` calls in `adminRecipes.ts`, `ingredientAllergenProposals.ts`, `quizGeneration.ts` and the quick build `toUpperCase` calls handle Cyrillic. `catalogNames.ts` title casing runs on English import data only, never on `ru` text. Admin comment links built from English names reach `/ru` pages through one canonical redirect, which is fine.

**Edge function** (`generate-drink-idea/index.ts`): `ru` in `SUPPORTED_LOCALES` (one line format kept for the parity test) and `LOCALE_NAMES.ru = "Russian"`, with an instruction that appends: `Address the reader with lowercase «вы». Lime is «лайм» and lemon is «лимон». Use « » quotes and a spaced em dash.` The text passes through a local copy of `normalizeRussianTypography`. A comment points to `LOCALE_AI_TERMS.ru`.

**Value sourcing**:

| Action | Value produced / displayed | Source |
|---|---|---|
| Catalog read with `locale = 'ru'` | which translation row joins | `resolve_locale('ru')` from `supported_locales`; no row → English base columns (AC-2) |
| Russian recipe search | config for query and index | `locale_search_config('ru')` → `russian` (AC-3) |
| Insert or update of a `ru` `recipe_translations` row | `name_search` | existing trigger: `to_tsvector('russian', name)` (AC-3) |
| Russian ingredient search | match | trigram similarity on `ingredient_translations.name`, unchanged (AC-3) |
| Recipe URL, canonical, sitemap entry | slug | `buildRecipeSlugPath(id, name)` → `slugify` with `SLUG_TRANSLITERATION`; `name` is the page locale's recipe name, as today (AC-9) |
| `/ru` heading font | font family | `DISPLAY_FONT_BY_LOCALE.ru` = `"lora"` → Lora's `--font-display-loaded` (AC-10) |
| Required plural forms per locale | form list | `Intl.PluralRules(locale).select` over 0 to 1000, plus `other` (AC-11) |
| Mobile plural string at runtime | form chosen | i18next through Hermes `Intl.PluralRules`, checked on a device in step 1 (AC-11) |
| Messages with name placeholders | list to rephrase | every `en.json` message with a non count placeholder, listed in step 4 (AC-12) |
| Detection after launch | locale | `parseAcceptLanguage` / device `languageCode`, primary subtag `ru`, within `LAUNCHED_LOCALES` (AC-8) |
| Hreflang, sitemap, `<html lang>` | code | `LOCALE_HREFLANG.ru` = `"ru"` (AC-8) |
| Language option label | name | `LOCALE_NATIVE_NAME.ru` = `"Русский"` (AC-8) |
| Catalog and notes prompts | language, terms, tone | `LOCALE_AI_LANGUAGE.ru`, `LOCALE_AI_TERMS.ru` (AC-14, AC-15) |
| Drink idea in Russian | language, terms, tone | edge function `LOCALE_NAMES.ru` plus its instruction (AC-17) |
| Russian AI output | final punctuation | `normalizeRussianTypography`, or its edge function copy (AC-1, AC-17) |
| Retranslation decision | whether to translate again | `source_name_hash` on the `ru` row (per locale, confirmed for French) (AC-14) |
| UI strings | text | `apps/web/messages/ru.json`, `apps/mobile/src/i18n/locales/ru.json`, AI drafted, then native reviewed (AC-1) |
| Unit, batch, limit copy | Russian words | `ru` entries in `units.ts`, `batch.ts`, `drinkIdeaLimitMessage.ts` (AC-13) |
| Measures | decimal separator | unchanged dot, until feature 58 (AC-13) |
| Launch | discovery and import translation | `"ru"` in `LAUNCHED_LOCALES` and `CATALOG_TRANSLATION_LOCALES`, one commit (AC-19) |

**Key invariants**:
- All 0045 and 0046 invariants hold. No SQL function body names `ru` or `russian`.
- `slugify` returns the same output as before for any input with no Cyrillic letter.
- `SLUG_TRANSLITERATION` maps characters, not locales. Changing an entry changes live URLs. Old slugs still resolve, because the page reads only the trailing uuid and redirects to the canonical slug.
- Every non English locale file carries every required plural form for its locale, enforced by test.
- `DISPLAY_FONT_BY_LOCALE` has an entry for every locale (enforced by its `Record` type).
- `ru` joins `LAUNCHED_LOCALES` and `CATALOG_TRANSLATION_LOCALES` in one commit, only after review sign off.
- The edge function's Russian instruction duplicates `LOCALE_AI_TERMS.ru` by hand. A change to one changes the other in the same commit.
- `normalizeRussianTypography` is idempotent.

**Security model**: no change. `supported_locales` stays read only for `anon` and `authenticated`, and only a migration adds the row. No new PII. Compliance: Russian is a language, not a market. This spec does not target the Russia storefront, run Russia specific marketing, or store data in Russia, so 38-FZ and 152-FZ are out of scope. Targeting Russia later needs its own legal review first.

**Configuration required**: none new.

**Critical test scenarios**:
- Happy path: after the backfill, `/ru/recipes/<transliterated slug>` shows a Russian name, instructions, measures with `мл`, notes, and ingredient names, with Russian chrome, Lora headings, and Russian typography, verifies **AC-1**, **AC-2**, **AC-10**, **AC-13**.
- Slugs (unit, pure): `slugify("Маргарита")` is `margarita`, `slugify("Белый русский")` is `belyy-russkiy`, `slugify("Щука ёж")` is `shchuka-ezh`, `slugify("Їжак")` is `yizhak`, verifies **AC-9**.
- Slugs (regression): a script exports every current recipe name in `en`, `es`, `pt`, `fr` from the database, and the old and new `slugify` produce byte identical output for all of them, verifies **AC-5**.
- Plurals (unit): the forms test passes for every locale, fails if a `ru` `_few` key is deleted, and fails if a `ru` ICU block (including the nested one in `missingIngredients`) drops `many`; the i18next Node test returns the right `ru` form for 1, 2, 5, 21; on a device, a recipe with 2 ratings shows «2 оценки», 5 shows «5 оценок», 21 shows «21 оценка», verifies **AC-11**.
- Share image: `/ru/opengraph-image` shows the Russian tagline with no missing glyph boxes, and `/en/opengraph-image` is unchanged, verifies **AC-10**.
- Placeholders (unit): adding a new `en.json` message with a `{name}` placeholder fails the placeholder list test until the list is updated, verifies **AC-12**.
- Typography (unit, pure): `normalizeRussianTypography` turns `"Мохито"` into «Мохито» and `лёд - обязательно` into `лёд` + U+00A0 + `— обязательно`, leaves `2-3` and a URL alone, and is idempotent, verifies **AC-1**, **AC-17**.
- Search (manual SQL): `to_tsvector('russian', 'Ликёр') @@ websearch_to_tsquery('russian', 'ликер')` is true; live, a Russian search for a translated name typed with е for ё finds it, and "Margarita" still finds the recipe, verifies **AC-3**.
- Regression (manual SQL): snapshot `search_recipes` and `fetch_recipe_detail` in `es`, `pt`, `fr` before and after the migration, identical; run the 0045 structure query, verifies **AC-4**, **AC-5**.
- Fonts: on `/ru`, the network panel shows Lora and Inter's Cyrillic file and headings render in Lora; on `/en` and `/fr`, no Lora request, verifies **AC-10**.
- Drift: the parity test fails if any list lacks `ru` or the config string differs, verifies **AC-6**.
- Gating: before launch, `Accept-Language: ru-RU` lands on `/en`, the menu has no Русский, the sitemap and alternates have no `ru`, `/ru/` is `noindex` with a self canonical; a stored `ru` preference is ignored and left in place, verifies **AC-7**, **AC-18**.
- Detection: after launch, `ru-KZ` picks `ru`; `uk-UA`, `be-BY`, `kk-KZ` pick English, verifies **AC-8**.
- Grammar: every message on the step 4 list reads as label plus value in `ru.json`, signed off by the reviewer, verifies **AC-12**.
- Lime and lemon: every recipe whose English ingredients include lime shows «лайм», verifies **AC-14**.
- Notes isolation: after `apply-recipe-notes --locale ru`, the `en`, `es`, `pt`, `fr` notes snapshot is unchanged, verifies **AC-15**.
- Admin: saving Russian notes updates only the `ru` row, verifies **AC-16**.
- Drink idea: a `ru` request returns Russian text with «вы», « » quotes, and passes pantry verification, verifies **AC-17**.
- Layout: Russian runs about 15 to 30% longer than English with long words; the age gate, nav, recipe page, batch calculator, and account screen show no clipped text at 360 px on web and a phone, verifies **AC-1**.

## Build plan

Tracer Bullet: one thin, unlaunched Russian thread through every layer, carrying the three new non Latin pieces, then content and review thicken it. **Start after feature 69 (French) passes `/check verify`.**

1. **Thread.** Migration `<timestamp>_russian_locale.sql`: `insert into public.supported_locales (code, text_search_config) values ('ru', 'russian');` plus a commented check block with the ё query (free of `insert into public.supported_locales` and `('x', 'y')` tuples, so the parity test regex doesn't misread it). Rollback at `supabase/rollbacks/<timestamp>_russian_locale_down.sql`. You run the `es`/`pt`/`fr` snapshot, apply in the SQL editor, then run the snapshot and the 0045 structure query again. Add `ru` and its map entries to `locale.ts` and fill every `Record<Locale, …>` the compiler flags (`units.ts` with the Cyrillic labels, `batch.ts`, `drinkIdeaLimitMessage.ts`). Add `SLUG_TRANSLITERATION` and the `slugify` change with its tests, and run the byte identical check over the database export of every current name. Add `normalizeRussianTypography` with its test and wire it beside the French call in `catalogTranslation.ts`. Fix tests that list four locales (`ageGate.test.ts` regex, `adminRecipes.test.ts`, `route-metadata.test.ts`, any `"ru"` used as an unsupported example in `locale.test.ts` moves to `"de"`). Add `ru` to `generate-drink-idea` with its instruction and typography copy, and you deploy it. Web: Lora, `DISPLAY_FONT_BY_LOCALE`, Inter's `cyrillic` subset, the `:lang(ru)` hyphenation rule, the bundled `Lora-SemiBold.ttf` in the share image; confirm in the network panel that `/en` never requests Lora. Create web and mobile `ru.json` as copies of `en.json` with the nav, the share image tagline, and the two mobile rating plurals translated with all four forms; register `ru` in `apps/mobile/src/i18n/index.ts` as under *Mobile surface*, and add the i18next Node plural test. Run `translate-catalog --locale ru --limit 1`. Done when `/ru/recipes/<transliterated slug>` shows Russian in Lora, a search with е for ё finds it, a mobile device shows the `_few` rating string for a count of 2, and `/es`, `/pt`, `/fr` are unchanged. Satisfies **AC-3**, **AC-4**, **AC-5**, **AC-6**, **AC-7**, **AC-9**, **AC-10**, **AC-11**, **AC-17**, **AC-18**.
2. **Plural and placeholder tests.** Add `@formatjs/icu-messageformat-parser` as a web dev dependency and the forms test over web and mobile locale files. Add the `one` branch to `missingIngredients` in `es`, `pt`, `fr` (copying `other`). Add the placeholder list test with its reviewed list. Satisfies **AC-11**, **AC-12**.
3. **Terms review, then catalog backfill.** The native reviewer approves `LOCALE_AI_TERMS.ru` and the edge function sentence first. Then you run `translate-catalog --locale ru` for the whole catalog, run it again to confirm it translates nothing, and spot check lime and lemon. Satisfies **AC-2**, **AC-14**.
4. **Notes proposal and UI strings.** Wire the Russian typography branch into the notes run, then run `propose-recipe-notes --locale ru` and confirm the admin form's Russian section on one recipe. AI drafts the full web and mobile `ru.json` with lowercase «вы», ICU `one`/`few`/`many`/`other` plurals, and `_one`/`_few`/`_many`/`_other` keys. List every `en.json` message with a non count placeholder and phrase each as label plus value in Russian. Satisfies **AC-1**, **AC-12**, **AC-15**, **AC-16**.
5. **Native review.** A Russian speaker reviews the UI strings (age gate and privacy first), the placeholder message list, unit, batch, and limit copy, a sample of drink ideas, and every note in `recipe-notes-proposals.ru.json`. You apply fixes, run the 360 px layout check on web and a phone, then run `apply-recipe-notes --locale ru`. Satisfies **AC-1**, **AC-12**, **AC-13**, **AC-15**, **AC-17**.
6. **Launch.** Once steps 3 to 5 are signed off, add `"ru"` to `LAUNCHED_LOCALES` and `CATALOG_TRANSLATION_LOCALES` in one commit, adding a `ru` block to the `notesByLocale` fixture in `recipeNoteProposals.test.ts` in the same commit. Regenerate any pending default notes file, ship a mobile build, and confirm the sitemap, hreflang, and detection (including `uk` falling to English) in production. Satisfies **AC-8**, **AC-19**.
7. **Store listings.** Feature 60's row lists Russian. Satisfies **AC-20**.

## Migration plan

**Strategy**: feature flagged (`LAUNCHED_LOCALES`), one additive migration.
**Phases**: the row insert (step 1), then backfills that only insert `ru` rows (steps 3 and 4).
**Rollback**: Russian is invisible until step 6, so fix forward. For a full revert, the down SQL deletes the `ru` rows from the four translation tables, sets `user_preferences.locale` to null where it is `'ru'`, and deletes the `ru` row from `supported_locales`. Then revert the TS commit. The `slugify` change can stay, since it only affects Cyrillic input.
**Risks**: a wrong `SLUG_TRANSLITERATION` entry changes Russian URLs after launch. Old URLs keep working through the uuid, so the cost is a redirect, not a 404.

## Consequences

**Positive**:
- Russian users get native search, readable URLs, correct word endings, and matching headings.
- Hindi, Japanese, Korean, Chinese, and Arabic inherit three ready patterns: extend `SLUG_TRANSLITERATION` (or choose a fallback), add a `DISPLAY_FONT_BY_LOCALE` entry, and pass the plural forms test (Arabic's six forms included).
- It confirms that the database handles a non Latin script with only a row, given `en_US.UTF-8` and a built in config.

**Negative / tradeoffs**:
- Inter's Cyrillic subset is preloaded on every page in every locale (a small extra download), since next/font preloads all listed subsets.
- `/ru` headings use a different typeface from the brand's Fraunces, which a designer may want to tune.
- Russian ingredient search is trigram only, so a mistyped ending ranks lower, as in every language today.
- The plural test adds a small chore for every new plural string in every locale.
- Measures show "1.5 мл" with a dot until feature 58, where Russian expects "1,5 мл".
- Recipe text is machine translated and not reviewed. Learn and quizzes stay English under `/ru/`.
- Five languages means more translation cost and one more string owed for every future feature.
- Offering Russian at all will draw users in Russia. The app does not target them, but if that changes, a legal review comes first.

**Neutral**:
- The default notes run's file gains a `ru` block at launch.
- `slugify` now holds a script table that later languages extend.

## Follow-up

- [ ] Find a native Russian reviewer before build step 5. Launch waits on that review.
- [ ] Update feature 60 in `docs/scope/scope.md` to add Russian to the store listing locales.
- [ ] Update feature 58 (number formatting) to cover Russian: decimal comma and a narrow no break space as the thousands separator.
- [ ] Update the Slice 39 header: the non Latin questions are settled here (built in config or trigram for search, `DISPLAY_FONT_BY_LOCALE` for fonts, `SLUG_TRANSLITERATION` for slugs, the plural forms test). Hindi (71) should check for a built in `hindi` config and add Devanagari to the slug table; CJK (72) still owes its own search decision, since trigram on text without spaces needs testing.
- [ ] If the brand designer wants a closer match to Fraunces for Cyrillic, revisit the Lora choice before launch.
