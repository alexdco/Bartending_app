# 0048. Hindi locale

**Date**: 2026-11-11
**Status**: In Progress

## Summary

This spec adds Hindi (code `hi`) as the app's sixth language on web, mobile, the recipe catalog, recipe notes, and drink ideas, following the Russian path from spec 0047. Search needs only one database row, because Postgres ships a built in `hindi` setting. Devanagari (the Hindi script) cannot be turned into readable Latin letters by a simple table, so a Hindi recipe URL uses the English name (`/hi/recipes/margarita-<uuid>`). That means the recipe read functions start returning the English name beside the translated one, and Japanese, Korean, and Chinese can reuse this later. Web loads Noto fonts for Devanagari, the share image stays English on `/hi`, and Hindi stays hidden until a native speaker signs off.

The decision history (context, options considered, and rationale) lives in [rationale.md](rationale.md).

## Requirements

**User stories**:
- As a Hindi speaking home bartender, I want to browse, search, and read recipes and the app itself in everyday Hindi, so it feels natural rather than like a textbook.
- As a Hindi user, I want lime and lemon kept clearly apart, since नींबू alone could mean either and the drink depends on it.
- As a Hindi user, I want searching "संतरा" to find "संतरे", and an English name like "Margarita" to still work.
- As a Hindi user sharing a recipe link, I want a readable URL, not a bare id or a wall of percent codes.
- As the engineer, I want the slug fallback, script fonts, and share image rule built so Japanese, Korean, Chinese, and Arabic plug into them.

**Acceptance criteria**:
- **AC-1**: `hi` is a supported locale. Every string in the web message catalog and the mobile resource file renders in Hindi under `/hi/...` on web and when `hi` is the active language on mobile. Strings use everyday Hindi in Devanagari, address the user as आप, keep bar tools as Devanagari loanwords (शेकर, जिगर), use Western digits (0 to 9), and end sentences with the danda (।). Hindi AI output (catalog text, notes, drink ideas) passes through `normalizeHindiTypography` before it is stored or returned.
- **AC-2**: Recipe name, instructions, glass, ingredient measures, ingredient and tag names, and the three recipe notes render in Hindi when a `hi` translation exists. Otherwise they render in English, never another language, never blank, never an error.
- **AC-3**: A Hindi `search_recipes` query matches a recipe's Hindi name through the built in `hindi` config, including inflected forms ("संतरा" finds "संतरे"), and still matches the English name. `search_ingredients` matches Hindi ingredient names through trigram similarity. Spelling variants (ी versus ि, ज़ versus ज, nasal marks) are not required to match; they belong to feature 77.
- **AC-4**: Adding Hindi puts no locale code or config name into any SQL function body. The only Hindi database change is the `('hi', 'hindi')` row in `supported_locales`. The `pg_proc` structure query in [0045 verify.md](../0045-language-agnostic-locales-portuguese/verify.md) still finds no locale code or config name in any function body.
- **AC-5**: English, Spanish, Portuguese, French, and Russian behave exactly as before. Their names, instructions, measures, notes, search results, and recipe slugs are identical before and after the Hindi migration, the `base_name` migration, and the slug change. The only difference in read function output is the added `base_name` column.
- **AC-6**: The locale parity test passes with `hi` in `SUPPORTED_LOCALES`, the `supported_locales` seed, and `generate-drink-idea`'s list, and with `LOCALE_TEXT_SEARCH_CONFIG.hi` equal to `"hindi"`.
- **AC-7**: While `hi` is not in `LAUNCHED_LOCALES`, it follows spec 0045 AC-7 and AC-8: no हिन्दी in the web menu or the production mobile language card, never picked by detection, absent from the sitemap and every hreflang alternate, and `/hi/...` pages render with `noindex`, a self canonical, and no alternates. Mobile dev and preview builds list हिन्दी.
- **AC-8**: Once launched, any browser or device language whose primary subtag is `hi` (`hi`, `hi-IN`) picks `hi`. `en-IN` stays English, and Marathi (`mr`) and Nepali (`ne`), which also use Devanagari, never pick `hi`. Hreflang, the sitemap, and `<html lang>` announce `hi`, and the switcher shows "हिन्दी" whatever the active language.
- **AC-9**: The eight recipe read functions in the API table also return `base_name` (the English `recipes.name`). `buildRecipeSlugPath(id, name, baseName)` builds the slug from `name` unless `name` contains a letter whose script is not Latin, Cyrillic, Common, or Inherited, in which case it uses `baseName`. A `/hi` recipe whose Hindi name is मार्गरीटा links to `/hi/recipes/margarita-<uuid>`, and its canonical and sitemap entry use the same slug, so a click never takes a redirect. Slugs for Latin and Cyrillic names are byte identical to today's.
- **AC-10**: On web, `/hi` pages render body text with Inter for Latin characters and Noto Sans Devanagari for Devanagari, and headings in Noto Serif Devanagari, with no system font fallback for Devanagari glyphs. Pages in every other locale do not download either Noto font; there, the switcher's "हिन्दी" option carries `lang="hi"` and renders in the system Devanagari font. On `/hi`, every text style (nav, buttons, labels, and footer included) uses the taller `--leading-*` values from `:root:lang(hi)`, so vowel signs above and below letters never touch or clip. On `/hi`, headings, including the brand wordmark, use Noto Serif Devanagari instead of Fraunces, the same trade Russian made with Lora.
- **AC-11**: The plural forms test from spec 0047 passes with `hi` (required forms `one` and `other`, where 0 and 1 are both `one`). The i18next Node test returns the `_one` string for `hi` counts 0 and 1, and the `_other` string for 2 and 5.
- **AC-12**: In `hi`, every message on the reviewed non count placeholder list from spec 0047 AC-12 is phrased so the inserted name stands alone as a label (`कमी है: {names}`), never inside a sentence that would need the inserted noun in its oblique form or a gender matched postposition. The native reviewer checks the Hindi list.
- **AC-13**: Unit labels show `औंस`, `मिली`, `सेली`, `ली` in `hi` (no dots). Batch labels and the drink idea limit copy have hand written Hindi values. All are approved by the native reviewer. Measures keep the dot decimal, which is also Hindi's own decimal mark.
- **AC-14**: `translate-catalog --locale hi` translates the catalog with the pinned terms in `LOCALE_AI_TERMS.hi` (lime «हरा नींबू», lemon «पीला नींबू», and the bar tools; the loanwords लाइम and लेमन are not used), and hash gating works per locale, so a second run translates nothing. No `hi` row contains नींबू unless it directly follows a form of हरा or पीला (हरा, हरे, हरी, पीला, पीले, पीली), checked with the regex `(?<!(हरा|हरे|हरी|पीला|पीले|पीली) )नींबू` over NFC text. After launch, the import job translates new recipes into `hi` too.
- **AC-15**: `propose-recipe-notes --locale hi` proposes Hindi notes for empty `hi` fields only, into `recipe-notes-proposals.hi.json`. The native reviewer reads every note before `apply-recipe-notes --locale hi` runs, and the apply writes only `hi` rows.
- **AC-16**: The web admin recipe form shows a Hindi notes section, and saving it updates only that recipe's `hi` row.
- **AC-17**: `generate-drink-idea` accepts `locale: "hi"` and writes the drink idea natively in everyday Hindi, with आप, the pinned citrus terms, and the danda (its copy of `normalizeHindiTypography`). Pantry verification still checks the English `source_name` only.
- **AC-18**: `user_preferences.locale` accepts `'hi'`, syncs, and follows the sign in merge rule from spec 0020 AC-16. Before launch, a stored `hi` preference counts as absent for detection and is left in place.
- **AC-19**: The `/hi` Open Graph share image is the English share image (English tagline, Fraunces), and its alt text and image metadata use the English tagline. Every other locale's image is unchanged.
- **AC-20**: On a real iOS device and a real Android device with the app set to `hi`, Devanagari renders with joined consonants and vowel signs intact, no line of text is clipped at the top or bottom on the recipe screen, the pantry, and the account screen, and a rating count of 1 shows the `_one` string while 2 shows the `_other` string.
- **AC-23**: All Hindi text written by AI or pinned in `LOCALE_AI_TERMS.hi` and the edge function instruction is stored in Unicode NFC (one standard byte form), so a nukta letter like ज़ is always stored the same way.
- **AC-21**: Launch is one commit that adds `"hi"` to both `LAUNCHED_LOCALES` and `CATALOG_TRANSLATION_LOCALES`, made only after the catalog backfill, the notes apply, and the native review are signed off. It does not wait for features 69 (French) or 70 (Russian) to pass `/check verify`. A mobile build ships with it, and the production sitemap and hreflang show `hi`.
- **AC-22**: Feature 60 lists Hindi among its store listing locales. The web launch does not wait on it.

## Decision

**Chosen option**: Option 1: The Russian path, with an English name slug source and Devanagari fonts.

Hindi is added with the built in `hindi` config and no locale specific SQL, gated behind `LAUNCHED_LOCALES`. One locale agnostic migration adds `base_name` to the recipe read functions so slugs for scripts with no transliteration table fall back to the English name. Web loads Noto Sans Devanagari and Noto Serif Devanagari only on `/hi`, the share image stays English for `hi`, and a `normalizeHindiTypography` pass sets the danda and quotes.

**Implementation skills**: `supabase-postgres-best-practices` (`supabase/agent-skills`, `.agents/skills/supabase-postgres-best-practices/`) · `nextjs-app-router-patterns` (`wshobson/agents`, `.agents/skills/nextjs-app-router-patterns/`) · `react-native-best-practices` (`callstackincubator/agent-skills`, `.agents/skills/react-native-best-practices/`) · `vitest` (`antfu/skills`, `.agents/skills/vitest/`)

## Rationale

Reasoning and options: see [rationale.md](rationale.md).

## Feature design

**Data model sketch**:

| Entity | Primary key | Fields | Foreign keys | Cardinality |
|---|---|---|---|---|
| `supported_locales` (new row) | `code` | `('hi', 'hindi')` | none | one row |
| `recipe_translations`, `ingredient_translations`, `tag_translations`, `recipe_ingredient_translations` (new rows only) | unchanged | `locale = 'hi'` rows from the backfills; `name_search` set by the existing trigger with `hindi` | `locale` → `supported_locales(code)`, unchanged | N:1, unchanged |
| `user_preferences.locale` | unchanged | now accepts `'hi'` through the existing foreign key | unchanged | unchanged |

No table, column, extension, or config changes. The `base_name` change touches function outputs only (below).

**API surface**:

| Endpoint / function | Method | Key inputs | Key outputs | Auth | Key errors |
|---|---|---|---|---|---|
| Recipe read functions (changed, locale agnostic), exactly these eight: `search_recipes`, `classic_recipes`, `recommend_recipes`, `match_recipes_to_pantry`, `popular_recipes_by_region`, `fetch_favorite_recipes`, `fetch_recipes_by_ids`, `fetch_recipe_detail`. Bar and service functions (`fetch_bar_recipe_detail`, `search_bartender`, `search_recipes_by_ingredients`, `fetch_bar_service_data`) are not changed, since no slug is built from them | Postgres functions | unchanged; `locale`/`p_locale` now accepts `'hi'` | existing columns unchanged, plus `base_name text not null` (= `r.name`) as the last output column | unchanged (grants restored after the drop and create) | none new |
| `generate-drink-idea` (changed) | POST | `locale` accepts `"hi"` | unchanged | unchanged | unchanged |
| `translate-catalog --locale hi` (typography branch only) | CLI | `hi` | upserts `hi` translation rows | service role | unchanged |
| `propose-recipe-notes` / `apply-recipe-notes --locale hi` (typography branch only) | CLI | `hi` | `recipe-notes-proposals.hi.json`; apply report | service role | unchanged |
| Admin recipe form notes (no code change) | web | Hindi section from `NON_DEFAULT_LOCALES` | `admin_set_recipe_translation_notes` with `p_locale = 'hi'` | admin | unchanged |
| `buildRecipeSlugPath(id, name, baseName)` (changed signature) | TS, pure | id, localized name, English name | `<slug>-<id>` | n/a | none |

**Shared TS surface (`packages/shared/src/`)**:
- `locale.ts`: `SUPPORTED_LOCALES = ["en", "es", "pt", "fr", "ru", "hi"]`; `LOCALE_TEXT_SEARCH_CONFIG.hi = "hindi"`; `LOCALE_HREFLANG.hi = "hi"`; `LOCALE_AI_LANGUAGE.hi = "Hindi"`; `LOCALE_NATIVE_NAME.hi = "हिन्दी"`. `LAUNCHED_LOCALES` and `CATALOG_TRANSLATION_LOCALES` unchanged until launch.
- `LOCALE_AI_TERMS.hi`, drafted then approved by the native reviewer before the backfill: write everyday Hindi in Devanagari, not formal Sanskrit based Hindi and not Hinglish; address the reader as आप; lime «हरा नींबू», lemon «पीला नींबू», kept distinct and never plain «नींबू»; shaker «शेकर», jigger «जिगर», muddler «मडलर», strainer «स्ट्रेनर», bar spoon «बार स्पून», simple syrup «शुगर सिरप», bitters «बिटर्स», ice «बर्फ़»; glass names as Devanagari loanwords; Western digits; units without dots (मिली, सेली, ली, औंस); end sentences with ।; double quotes “ ”.
- `seo.ts`: `buildRecipeSlugPath(id: string, name: string, baseName: string): string`. It slugifies `name` unless `name` matches `/(?![\p{Script=Latin}\p{Script=Cyrillic}\p{Script=Common}\p{Script=Inherited}])\p{L}/u` (a letter from any other script), in which case it slugifies `baseName`. `slugify` itself is unchanged, and `SLUG_TRANSLITERATION` gains no Devanagari. The third parameter is required, so the compiler flags every call site.
- Recipe row types and mappers (`recipes.ts` and the other files mapping the functions above): add `baseName: string`, mapped from `base_name`. Test fixtures that build recipe rows gain `baseName`, and generated Supabase types are regenerated if the repo keeps them.
- `hindiTypography.ts`: `normalizeHindiTypography(text: string): string`, pure and idempotent, as in rationale.md.
- `units.ts`: `oz: "औंस"`, `ml: "मिली"`, `cl: "सेली"`, `l: "ली"` for `hi`. `batch.ts`, `drinkIdeaLimitMessage.ts`: hand written `hi` entries (parts label «भाग»).

**Web surface**:
- `layout.tsx`: adds `Noto_Sans_Devanagari` (`variable: "--font-body-script"`, `subsets: ["devanagari"]`, `weight: ["400", "500", "600"]`, `preload: false`, `display: "swap"`) and `Noto_Serif_Devanagari` (`variable: "--font-display-loaded"`, `subsets: ["devanagari", "latin"]`, `weight: ["600"]`, `preload: false`, `display: "swap"`). `DisplayFont` gains `"notoSerifDevanagari"`, and `DISPLAY_FONT_BY_LOCALE.hi = "notoSerifDevanagari"`.
- `display-font.ts`: a new `BODY_SCRIPT_FONT_BY_LOCALE: Record<Locale, "none" | "notoSansDevanagari">` with `hi` set to `"notoSansDevanagari"`. The layout applies the Noto Sans Devanagari `.variable` class to `<html>` only when the entry is not `"none"`.
- `globals.css` (never `theme.generated.css`, which is generated): one `:root:lang(hi)` block that sets `--font-body: var(--font-body-loaded), var(--font-body-script), var(--font-body-fallback);` (Latin characters keep Inter, Devanagari characters fall through to Noto) and overrides the six line height tokens: `--leading-display: 1.35; --leading-heading: 1.4; --leading-subheading: 1.45; --leading-body: 1.75; --leading-body-small: 1.7; --leading-label: 1.6;`. Because every `leading-*` utility reads these tokens, nav, buttons, labels, and footer text are covered too; the build confirms that in the compiled CSS. A 700 weight on `/hi` is synthesized from 600, which is accepted. No `hyphens` rule (browsers don't hyphenate Hindi).
- Language switcher: the "हिन्दी" option (and every native name option) carries `lang` set to its own locale code, so on non Hindi pages the browser picks a proper system Devanagari font.
- Share image: `apps/web/src/lib/open-graph.ts` gains `SHARE_IMAGE_LOCALE: Record<Locale, Locale>`, mapping each locale to itself except `hi → "en"`. `opengraph-image.tsx` resolves `SHARE_IMAGE_LOCALE[ogLocale(locale)]` once and uses it for the tagline, the font, the alt text, and `generateImageMetadata`, so every `ogTagline` call sees the mapped locale. `DISPLAY_FONT_FILES` is keyed by a new `ShareImageFont = "fraunces" | "lora"` type rather than every `DisplayFont`, and a unit test asserts that every `DISPLAY_FONT_BY_LOCALE[SHARE_IMAGE_LOCALE[l]]` is a `ShareImageFont`.
- `messages/hi.json` matches `en.json`'s key paths.
- Every web `buildRecipeSlugPath` call passes a `baseName`: recipe cards, the recipe page (canonical, redirect target, alternates), the hero, recommendations, and the sitemap (`namesByLocale.en`). For the admin comment list (`comment.recipeName`) and the quiz player (`source.name`), build step 2 traces each name to its RPC first: if it is the English `recipes.name`, the call passes it twice; if it is localized, that RPC's row gains `base_name` the same way and the call passes it.

**Mobile surface**: no slug or link change (mobile routes by `recipe/[id]` and builds no web URLs). `apps/mobile/src/i18n/index.ts` adds `import hi from "./locales/hi.json"` and `hi: { translation: hi }` to `resources`. i18next uses `_one`/`_other` for `hi`. Mobile names "Fraunces" and "Inter" but never loads them, so Devanagari already renders in the system font (Kohinoor Devanagari on iOS, Noto Sans Devanagari on Android). If the device check in build step 1 shows clipped lines, `apps/mobile/src/components/text.tsx` applies a `hi` line height multiplier (1.75 body, 1.35 display) from a `LINE_HEIGHT_SCALE_BY_LOCALE: Record<Locale, number>` map, 1 for every other locale.

**Edge function** (`generate-drink-idea/index.ts`): `hi` in `SUPPORTED_LOCALES` (one line format kept for the parity test) and `LOCALE_NAMES.hi = "Hindi"`, with an instruction that appends: `Write everyday Hindi in Devanagari and address the reader as आप. Lime is हरा नींबू and lemon is पीला नींबू. Keep bar tool names as Devanagari loanwords. Write units without dots and end sentences with ।.` The text passes through a local copy of `normalizeHindiTypography`. A comment points to `LOCALE_AI_TERMS.hi`.

**Checked, no change needed**: the Postgres 17.6 database with `en_US.UTF-8` collation ships `hindi`, stems inflections, and `pg_trgm` keeps a Devanagari word whole (probe in rationale.md). The plural forms test and the placeholder list test from spec 0047 cover `hi` with no code change. Detection's primary subtag rule already keeps `en-IN`, `mr`, and `ne` away from `hi`.

**Value sourcing**:

| Action | Value produced / displayed | Source |
|---|---|---|
| Catalog read with `locale = 'hi'` | which translation row joins | `resolve_locale('hi')` from `supported_locales`; no row → English base columns (AC-2) |
| Hindi recipe search | config for query and index | `locale_search_config('hi')` → `hindi` (AC-3) |
| Insert or update of a `hi` `recipe_translations` row | `name_search` | existing trigger: `to_tsvector('hindi', name)` (AC-3) |
| Hindi ingredient search | match | trigram similarity on `ingredient_translations.name`, unchanged (AC-3) |
| Recipe URL, canonical, sitemap entry | slug | `buildRecipeSlugPath(id, name, baseName)`; `name` is the page locale's name as today, `baseName` is `base_name` = `recipes.name` from the read function, or `namesByLocale.en` in the sitemap (AC-9) |
| `/hi` body font | font stack | `BODY_SCRIPT_FONT_BY_LOCALE.hi` → Noto Sans Devanagari's `--font-body-script`, after Inter in the `:lang(hi)` `--font-body` (AC-10) |
| `/hi` heading font | font family | `DISPLAY_FONT_BY_LOCALE.hi` = `"notoSerifDevanagari"` → its `--font-display-loaded` (AC-10) |
| `/hi` line heights | line height | the six `--leading-*` overrides in the `:root:lang(hi)` block of `globals.css` (AC-10); mobile `LINE_HEIGHT_SCALE_BY_LOCALE.hi` only if the device check needs it (AC-20) |
| `/hi` share image | tagline, alt, font | `SHARE_IMAGE_LOCALE.hi` = `"en"` → English messages and Fraunces (AC-19) |
| Required plural forms for `hi` | form list | `Intl.PluralRules("hi")` over 0 to 1000, plus `other` → `one`, `other` (AC-11) |
| Messages with name placeholders | list to phrase as labels | the reviewed list beside the spec 0047 placeholder test (AC-12) |
| Detection after launch | locale | `parseAcceptLanguage` / device `languageCode`, primary subtag `hi`, within `LAUNCHED_LOCALES` (AC-8) |
| Hreflang, sitemap, `<html lang>` | code | `LOCALE_HREFLANG.hi` = `"hi"` (AC-8) |
| Language option label | name | `LOCALE_NATIVE_NAME.hi` = `"हिन्दी"` (AC-8) |
| Catalog and notes prompts | language, terms, register | `LOCALE_AI_LANGUAGE.hi`, `LOCALE_AI_TERMS.hi` (AC-14, AC-15) |
| Drink idea in Hindi | language, terms, register | edge function `LOCALE_NAMES.hi` plus its instruction (AC-17) |
| Hindi AI output | NFC form, final punctuation, unit spelling | `normalizeHindiTypography`, or its edge function copy (AC-1, AC-17, AC-23) |
| Retranslation decision | whether to translate again | `source_name_hash` on the `hi` row, per locale (AC-14) |
| UI strings | text | `apps/web/messages/hi.json`, `apps/mobile/src/i18n/locales/hi.json`, AI drafted, then native reviewed (AC-1) |
| Unit, batch, limit copy | Hindi words | `hi` entries in `units.ts`, `batch.ts`, `drinkIdeaLimitMessage.ts` (AC-13) |
| Measures | decimal mark | unchanged dot, which Hindi also uses; lakh grouping waits for feature 58 (AC-13) |
| Launch | discovery and import translation | `"hi"` in `LAUNCHED_LOCALES` and `CATALOG_TRANSLATION_LOCALES`, one commit, after the review sign offs (AC-21) |

**Key invariants**:
- All 0045, 0046, and 0047 invariants hold. No SQL function body names `hi` or `hindi`.
- `base_name` always equals `recipes.name` and is never null. It is never shown to users, only used for slugs.
- `buildRecipeSlugPath` returns the same output as today whenever `name` has no letter outside Latin and Cyrillic.
- A slug's source depends on the characters in the name, not the page locale, so the same Hindi name gives the same slug on any page.
- `BODY_SCRIPT_FONT_BY_LOCALE`, `DISPLAY_FONT_BY_LOCALE`, and `SHARE_IMAGE_LOCALE` have an entry for every locale (their `Record` types enforce it), and every share image locale resolves to a font with a bundled file (enforced by test).
- `hi` joins `LAUNCHED_LOCALES` and `CATALOG_TRANSLATION_LOCALES` in one commit, only after review sign off. It no longer waits for 69 and 70 to verify, so Hindi may go live while French or Russian still owe `/check verify`.
- The edge function's Hindi instruction duplicates `LOCALE_AI_TERMS.hi` by hand. A change to one changes the other in the same commit.
- `normalizeHindiTypography` is idempotent, and its edge function copy matches it. Its output is always NFC.

**Security model**: no change. `supported_locales` stays read only for `anon` and `authenticated`, and only a migration adds the row. The recreated read functions keep their existing `security` setting, `search_path`, and grants exactly; the migration restates `revoke ... from public` and each grant after the create, using each function's exact argument signature. `base_name` exposes only the public English recipe name, which these functions already return when no translation exists. No new PII. Compliance: Hindi is a language, not a market. This spec does not target India, run India specific marketing, or change the age gate, so India's state drinking ages (18 to 25, with prohibition in some states) and the DPDP Act 2023 are out of scope. Targeting India later needs its own legal review first.

**Configuration required**: none new.

**Critical test scenarios**:
- Happy path: after the backfill, `/hi/recipes/margarita-<uuid>` shows a Hindi name, instructions, measures with `मिली`, notes, and ingredient names, with Hindi chrome, Noto headings and body, and danda punctuation, verifies **AC-1**, **AC-2**, **AC-9**, **AC-10**, **AC-13**.
- Slugs (unit, pure): `buildRecipeSlugPath(id, "मार्गरीटा", "Margarita")` is `margarita-<id>`; `("B-52 शॉट", "B-52 Shot")` is `b-52-shot-<id>`; `("Белый русский", "White Russian")` is `belyy-russkiy-<id>`; `("Piña Colada", "Pina Colada")` is `pina-colada-<id>`; a Latin name with `µ` or `ʼ` keeps its own slug, verifies **AC-9**.
- Slugs (regression): a script exports every current recipe name in `en`, `es`, `pt`, `fr`, `ru` with its English name, and the old `buildRecipeSlugPath(id, name)` and the new one produce byte identical output for all of them, verifies **AC-5**, **AC-9**.
- No redirect: on `/hi`, clicking a recipe card returns 200 at the card's URL with no 308 in the network panel, verifies **AC-9**.
- Base name (manual SQL): every changed function returns `base_name = recipes.name` for a translated and an untranslated recipe; the `es`, `pt`, `fr`, `ru` snapshot of all other columns is identical before and after, verifies **AC-5**, **AC-9**.
- Typography (unit, pure): `normalizeHindiTypography` turns `बर्फ़ डालें. फिर हिलाएँ.` into `बर्फ़ डालें। फिर हिलाएँ।`, turns `30 मि.ली. रम` into `30 मिली रम`, turns `"मोहितो"` into `“मोहितो”`, removes the space in `डालें ।`, leaves `डॉ. शर्मा`, `रुकिए...`, `क | ख`, `1.5`, a URL, and English sentences alone, turns a decomposed `ज़` (U+091C U+093C) into precomposed NFC, and is idempotent, verifies **AC-1**, **AC-17**, **AC-23**.
- Plurals (unit): the forms test passes with `hi`, and fails if a `hi` `_other` key is deleted; the i18next Node test returns `_one` for 0 and 1 and `_other` for 2 and 5, verifies **AC-11**.
- Search (manual SQL): `to_tsvector('hindi', 'संतरे') @@ websearch_to_tsquery('hindi', 'संतरा')` is true; live, a Hindi search for a translated name finds it, and "Margarita" still finds the recipe, verifies **AC-3**.
- Regression (manual SQL): snapshot `search_recipes` and `fetch_recipe_detail` in `es`, `pt`, `fr`, `ru` before and after the Hindi row migration, identical; run the 0045 structure query, verifies **AC-4**, **AC-5**.
- Fonts: on `/hi`, the network panel shows both Noto files and headings render in Noto Serif Devanagari; on `/en`, `/fr`, `/ru`, no Noto request, verifies **AC-10**.
- Share image: `/hi/opengraph-image` is byte identical to `/en/opengraph-image`, and `/ru/opengraph-image` is unchanged; the font test fails if `SHARE_IMAGE_LOCALE.hi` is set to `"hi"` with no bundled file, verifies **AC-19**.
- Drift: the parity test fails if any list lacks `hi` or the config string differs, verifies **AC-6**.
- Gating: before launch, `Accept-Language: hi-IN` lands on `/en`, the menu has no हिन्दी, the sitemap and alternates have no `hi`, `/hi/` is `noindex` with a self canonical; a stored `hi` preference is ignored and left in place, verifies **AC-7**, **AC-18**.
- Detection: after launch, `hi-IN` picks `hi`; `en-IN`, `mr-IN`, `ne-NP` pick English, verifies **AC-8**.
- Grammar: every message on the placeholder list reads as label plus value in `hi.json`, signed off by the reviewer, verifies **AC-12**.
- Lime and lemon: every recipe whose English ingredients include lime shows a form of «हरा नींबू», every lemon recipe a form of «पीला नींबू», and the AC-14 regex finds no `hi` row with an unqualified नींबू, verifies **AC-14**.
- Notes isolation: after `apply-recipe-notes --locale hi`, the `en`, `es`, `pt`, `fr`, `ru` notes snapshot is unchanged, verifies **AC-15**.
- Admin: saving Hindi notes updates only the `hi` row, verifies **AC-16**.
- Drink idea: a `hi` request returns Hindi text with आप and ।, and passes pantry verification, verifies **AC-17**.
- Devices: on an iPhone and an Android phone set to `hi`, the recipe screen, pantry, and account screen show intact conjuncts (क्ष, त्र, र्ग), no clipped vowel signs, and the right rating string for counts 1 and 2; web shows the same at 360 px, including the nav, buttons, and footer, verifies **AC-10**, **AC-11**, **AC-20**.
- Switcher: on `/en`, the "हिन्दी" option has `lang="hi"` and renders without missing glyph boxes, verifies **AC-10**.

## Build plan

Tracer Bullet: one thin, unlaunched Hindi thread through every layer, then the slug source, then content and review thicken it. **Build now, unlaunched. Launch waits only for Hindi's own sign offs (step 6), not for features 69 and 70.**

1. **Thread.** Migration `<timestamp>_hindi_locale.sql`: `insert into public.supported_locales (code, text_search_config) values ('hi', 'hindi');` plus a commented check block with the inflection query (free of `insert into public.supported_locales` and `('x', 'y')` tuples, so the parity test regex doesn't misread it). Rollback at `supabase/rollbacks/<timestamp>_hindi_locale_down.sql`. You run the `es`/`pt`/`fr`/`ru` snapshot, apply in the SQL editor, then run the snapshot and the 0045 structure query again. Add `hi` and its map entries to `locale.ts` and fill every `Record<Locale, …>` the compiler flags (`units.ts` with the dotless labels, `batch.ts`, `drinkIdeaLimitMessage.ts`). Add `normalizeHindiTypography` with its test and wire it beside the Russian call in `catalogTranslation.ts`. Fix tests that list five locales. Add `hi` to `generate-drink-idea` with its instruction and typography copy, and you deploy it. Web: both Noto fonts, `BODY_SCRIPT_FONT_BY_LOCALE`, the `DISPLAY_FONT_BY_LOCALE` entry, the `:lang(hi)` font and line height rules, `SHARE_IMAGE_LOCALE` with the `ShareImageFont` type and its test; confirm in the network panel that `/en` never requests Noto. Create web and mobile `hi.json` as copies of `en.json` with the nav and the two mobile rating plurals translated; register `hi` in `apps/mobile/src/i18n/index.ts` and extend the i18next Node plural test. Run `translate-catalog --locale hi --limit 1`. Check Devanagari on an iPhone and an Android phone, and add `LINE_HEIGHT_SCALE_BY_LOCALE` only if a line clips. Done when `/hi/recipes/recipe-<uuid>` (the bare slug until step 2) shows Hindi in Noto, a Hindi search with an inflected form finds it, both phones render it cleanly, and `/es`, `/pt`, `/fr`, `/ru` are unchanged. Satisfies **AC-3**, **AC-4**, **AC-6**, **AC-7**, **AC-10**, **AC-11**, **AC-17**, **AC-18**, **AC-19**, **AC-20**, **AC-23**.
2. **Slug source.** First confirm `search_bartender` (and anything else calling `search_recipes`) names its columns rather than relying on the full column set, and trace the admin comment and quiz player names to their RPCs. Migration `<timestamp>_recipe_read_base_name.sql`, in one transaction: for each of the eight functions, `drop function` with its exact argument signature and `create function` with `base_name` as the last output column, keeping the body otherwise identical, then restate `revoke ... from public`, its grants, and its `security`/`search_path` settings; end with `notify pgrst, 'reload schema';`. The rollback restores the previous definitions the same way and also ends with the notify. You run the `es`/`pt`/`fr`/`ru` snapshot of every changed function before and after, as both `anon` and `authenticated`, and the 0045 structure query. Add `baseName` to the shared row types and mappers, change `buildRecipeSlugPath` to take `baseName`, and fix every call site the compiler flags (the sitemap uses `namesByLocale.en`). Add the slug unit tests and run the byte identical check over the database export of every current name. Done when a `/hi` card links straight to `margarita-<uuid>` with no redirect. Satisfies **AC-5**, **AC-9**.
3. **Terms review, then catalog backfill.** The native reviewer approves `LOCALE_AI_TERMS.hi` and the edge function sentence first. Then you run `translate-catalog --locale hi` for the whole catalog, run it again to confirm it translates nothing, and query for any `hi` row containing a bare «नींबू». Satisfies **AC-2**, **AC-14**.
4. **Notes proposal and UI strings.** Wire the Hindi typography branch into the notes run, then run `propose-recipe-notes --locale hi` and confirm the admin form's Hindi section on one recipe. AI drafts the full web and mobile `hi.json` in everyday Hindi with आप, ICU `one`/`other` plurals, and `_one`/`_other` keys. Phrase every message on the placeholder list as label plus value. Satisfies **AC-1**, **AC-12**, **AC-15**, **AC-16**.
5. **Native review.** A Hindi speaker reviews the UI strings (age gate and privacy first), the placeholder message list, unit, batch, and limit copy, a sample of drink ideas, and every note in `recipe-notes-proposals.hi.json`. You apply fixes, run the 360 px layout check on web and both phones, then run `apply-recipe-notes --locale hi`. Satisfies **AC-1**, **AC-12**, **AC-13**, **AC-15**, **AC-17**, **AC-20**.
6. **Launch.** Once steps 3 to 5 are signed off, add `"hi"` to `LAUNCHED_LOCALES` and `CATALOG_TRANSLATION_LOCALES` in one commit, adding a `hi` block to the `notesByLocale` fixture in `recipeNoteProposals.test.ts` in the same commit. Regenerate any pending default notes file, ship a mobile build, and confirm the sitemap, hreflang, and detection (including `en-IN` and `mr` falling to English) in production. Satisfies **AC-8**, **AC-21**.
7. **Store listings.** Feature 60's row lists Hindi. Satisfies **AC-22**.

## Migration plan

**Strategy**: feature flagged (`LAUNCHED_LOCALES`), two additive migrations.
**Phases**: the `hi` row insert (step 1); the `base_name` function change (step 2), which is live for every locale as soon as it is applied; then backfills that only insert `hi` rows (steps 3 and 4).
**Rollback**: Hindi is invisible until step 6, so fix forward. For a full revert, the Hindi down SQL deletes the `hi` rows from the four translation tables, sets `user_preferences.locale` to null where it is `'hi'`, and deletes the `hi` row from `supported_locales`. The `base_name` down SQL restores the previous function definitions; it must ship with a TS revert in the same deploy, since the mappers expect the column.
**Risks**: the `base_name` migration drops and recreates live functions. Between the drop and the create inside one transaction nothing breaks, but a missed grant would make a read fail for `anon` users on every locale, which the snapshot run as `anon` catches. Deploying the TS change before the migration would leave `baseName` undefined, so apply the migration first.

## Consequences

**Positive**:
- Hindi users get native search with inflections, readable URLs, properly shaped Devanagari, and clear lime and lemon wording.
- Japanese, Korean, Chinese, and Arabic inherit the English name slug fallback with no further SQL change, plus the `BODY_SCRIPT_FONT_BY_LOCALE` and `SHARE_IMAGE_LOCALE` patterns.
- Recipe links never redirect on `/hi`, because every link and the canonical share one slug source.

**Negative / tradeoffs**:
- The `base_name` migration breaks the "adding a locale edits no function" pattern once, on purpose, and touches about eight live read functions used by every locale.
- `/hi` URLs carry English words, so they don't help Hindi language search ranking from the URL alone (titles and content still do).
- Hindi spelling variants miss in search until feature 77.
- Two more web fonts to keep in step with the brand, and Noto Serif Devanagari is a different typeface from Fraunces.
- The `/hi` share image is in English, which looks less native when shared in Hindi.
- Recipe text is machine translated and not reviewed. Learn and quizzes stay English under `/hi/`.
- Six languages means more translation cost and one more string owed for every future feature.
- Offering Hindi will draw users in India. The app does not target them, but if that changes, a legal review comes first.

**Neutral**:
- The default notes run's file gains a `hi` block at launch.
- Every read function now returns one extra short text column.

## Follow-up

- [ ] Find a native Hindi reviewer before build step 5. Launch waits on that review.
- [ ] Update feature 60 in `docs/scope/scope.md` to add Hindi to the store listing locales.
- [ ] Update feature 58 (number formatting) to cover Hindi: dot decimal and Indian lakh grouping (1,00,000).
- [ ] Update feature 77 (accent insensitive search) to cover Hindi spelling variants: ी/ि, ू/ु, nukta, and ँ/ं, plus a trigram tier on translated recipe names.
- [ ] Update the Slice 39 header and features 72 to 75: slugs for scripts with no transliteration table use `base_name` (spec 0048); body script fonts go in `BODY_SCRIPT_FONT_BY_LOCALE`; scripts that need complex shaping (Arabic) map to English in `SHARE_IMAGE_LOCALE` unless a visual check shows `next/og` renders them correctly.
- [ ] If the brand designer wants a closer match to Fraunces for Devanagari headings, revisit Noto Serif Devanagari before launch.
