# 0051. Korean locale

**Date**: 2026-11-12
**Status**: In Progress

## Summary

This spec adds Korean (code `ko`) as the app's eighth language on web, mobile, the recipe catalog, recipe notes, and drink ideas, following the Japanese path from spec 0050 almost step for step. Search needs no SQL change: the CJK "contains" step from spec 0050 already covers Hangul (the Korean alphabet), and a small Korean typography pass makes sure drink names never carry a middle dot that search cannot see past. Web loads Noto Sans KR and Noto Serif KR on `/ko` only and keeps Korean words whole when lines wrap; recipe URLs use the English name and the share image stays English. There is no human review: a second AI pass on a stronger model, plus the automated checks, gates the launch.

The decision history (context, options considered, and rationale) lives in [rationale.md](rationale.md).

## Requirements

**User stories**:
- As a Korean speaking home bartender, I want to browse, search, and read recipes and the app itself in natural, friendly Korean (해요체).
- As a Korean user, I want typing 진토닉, 진 토닉, or just 토닉 to find the gin and tonic, and drink names spelled the way Korean bars write them.
- As a Korean user, I want lines to break between words, never in the middle of one.
- As the engineer, I want Korean to launch without a native reviewer, with an AI second pass and checks I can trust instead.

**Acceptance criteria**:
- **AC-1**: `ko` is a supported locale. Every string in the web message catalog and the mobile resource file renders in Korean under `/ko/...` on web and when `ko` is the active language on mobile. Strings use 해요체 (the friendly polite form, 저장했어요, 검색해 보세요), keep buttons and labels as short nouns (저장, 검색), use half width digits and Western punctuation, and contain no Hanja (Chinese characters). Korean AI output (catalog text, notes, drink ideas) passes through `normalizeKoreanTypography` before it is stored or returned.
- **AC-2**: Recipe name, instructions, glass, ingredient measures, ingredient and tag names, and the three recipe notes render in Korean when a `ko` translation exists. Otherwise they render in English, never another language, never blank, never an error.
- **AC-3**: Korean search works through the existing tiers with no SQL change. On `/ko`, a whole word query matches through the `simple` config (bucket 0), and any query holding a Hangul syllable also runs the spec 0050 CJK contains step, so 진토닉, 진 토닉, and 토닉 each find a recipe whose `ko` name is 진토닉 (or whichever real catalog name holds those syllables), and `search_ingredients` finds an ingredient whose `ko` name contains the query, prefix matches first, with the staples filter applied. A query made only of loose consonants or vowels (ㅈ, ㅁㄱㄹㅌ), or ending in one (진ㅌ), gets no new CJK matches; that is accepted (initial consonant search is a follow up). A Latin query on `/ko` (Margarita) still finds the recipe through the English name. Example names in tests come from the real `ko` catalog after the backfill.
- **AC-4**: Adding Korean puts no locale code or config name into any SQL function body, and changes no SQL function. The only Korean database change is the `('ko', 'simple')` row in `supported_locales`. The `pg_proc` structure query from [0045 verify.md](../0045-language-agnostic-locales-portuguese/verify.md), with its pattern widened to `'(es|pt|fr|ru|hi|ja|ko|spanish|portuguese|french_unaccent|russian|hindi|simple)'` (quoted literals only), finds no match in any function body.
- **AC-5**: English, Spanish, Portuguese, French, Russian, Hindi, and Japanese behave exactly as before: their search results, names, instructions, measures, notes, slugs, fonts, and CSS are unchanged.
- **AC-6**: The locale parity test passes with `ko` in `SUPPORTED_LOCALES`, the `supported_locales` seed, and `generate-drink-idea`'s list, and with `LOCALE_TEXT_SEARCH_CONFIG.ko` equal to `"simple"`.
- **AC-7**: While `ko` is not in `LAUNCHED_LOCALES`, it follows spec 0045 AC-7 and AC-8: no 한국어 in the web menu or the production mobile language card, never picked by detection, absent from the sitemap and every hreflang alternate, and `/ko/...` pages render with `noindex`, a self canonical, and no alternates. Mobile dev and preview builds list 한국어.
- **AC-8**: Once launched, any browser or device language whose primary subtag is `ko` (`ko`, `ko-KR`) picks `ko`. Hreflang, the sitemap, and `<html lang>` announce `ko`, and the switcher shows "한국어" whatever the active language.
- **AC-9**: A `/ko` recipe link uses the English name slug through the existing `base_name` fallback (spec 0048 AC-9): a recipe named 마가리타 links to `/ko/recipes/margarita-<uuid>`, its canonical and sitemap entry use the same slug, and a card click never takes a redirect. No change to `buildRecipeSlugPath` (its non Latin test in `packages/shared/src/seo.ts` already treats Hangul as non Latin).
- **AC-10**: On web, `/ko` pages render body text with Inter for Latin characters and Noto Sans KR for Hangul, and headings (the brand wordmark and Latin letters in headings included) in Noto Serif KR 600. Every character in the shipped `ko` UI strings and catalog renders in a Noto KR face, not a system fallback, checked by a render check on `/ko`. The Noto KR `@font-face` rules reach `/ko` only, through `/fonts/ko/fonts.css`, which the layout links only when the locale is `ko`; every other locale downloads neither that stylesheet nor any Noto KR file, and its production CSS contains no Noto KR `@font-face` rule (enforced by the widened postbuild check). Nothing is requested from Google's servers at runtime. In every other locale, the switcher's "한국어" option carries `lang="ko"` and renders in the system Korean font.
- **AC-11**: On `/ko`, body text and headings use `word-break: keep-all` (lines break only at the spaces between Korean words), with `overflow-wrap: anywhere` so an unspaced run longer than the line (a URL, a long name) still wraps, and no recipe card, chip, button, or pantry row overflows its container or the page at 360 px. Every text style uses the `--leading-*` values from `:root:lang(ko)`. On iOS, the shared mobile `Text` component sets `lineBreakStrategyIOS="hangul-word"`, so Korean wraps between words there too.
- **AC-12**: The plural forms test from spec 0047 passes with `ko`, and `packages/shared/src/pluralForms.test.ts` gains a `["ko", ["other"]]` row. The i18next Node test returns the `_other` string for `ko` counts 0, 1, 2, and 5.
- **AC-13**: Unit labels show `ml`, `cl`, `L`, `온스` in `ko`. Batch labels and the drink idea limit copy have hand written Korean values. Measures keep the dot decimal.
- **AC-14**: `translate-catalog --locale ko` translates the catalog with the pinned terms in `LOCALE_AI_TERMS.ko` (lime 라임, lemon 레몬, the bar tools, and cocktail names in Hangul as Korean bars write them), and hash gating works per locale, so a second run translates nothing. Every recipe whose English ingredients include lime shows 라임 and every lemon recipe shows 레몬. No `ko` catalog row contains a Han character (Hanja), and no `ko` name field (recipe, ingredient, tag, glass) has a middle dot (`·` U+00B7, `・` U+30FB, `･` U+FF65, `•` U+2022, `‧` U+2027, `∙` U+2219) next to a Hangul syllable. A row that fails either check is fixed by rerunning `translate-catalog --locale ko` on those ids (with `--force` for the ids if hash gating would skip them), never by hand editing. After launch, the import job translates new recipes into `ko` too.
- **AC-15**: `propose-recipe-notes --locale ko` proposes Korean notes for empty `ko` fields only, into `recipe-notes-proposals.ko.json`. The AI second pass (AC-20) reads every note before `apply-recipe-notes --locale ko` runs, and the apply writes only `ko` rows.
- **AC-16**: The web admin recipe form shows a Korean notes section, and saving it updates only that recipe's `ko` row.
- **AC-17**: `generate-drink-idea` accepts `locale: "ko"` and writes the drink idea natively in 해요체 with the pinned terms (its copy of `normalizeKoreanTypography`). Pantry verification still checks the English `source_name` only.
- **AC-18**: `user_preferences.locale` accepts `'ko'`, syncs, and follows the sign in merge rule from spec 0020 AC-16. Before launch, a stored `ko` preference counts as absent for detection and is left in place.
- **AC-19**: The `/ko` Open Graph share image is the English share image (English tagline, Fraunces), with English alt text and metadata. Every other locale's image is unchanged.
- **AC-20**: Before launch, an AI second pass runs in a Claude Code session on a stronger model than the one that drafted the text (Opus, not Haiku), against the written checklist in this spec's `verify.md`. It reads `LOCALE_AI_TERMS.ko` and the edge function sentence before the backfill, then the full web and mobile `ko.json`, the placeholder message list from spec 0047 AC-12, the unit, batch, and limit copy, a 30 recipe sample of the catalog backfill, 10 live drink ideas, and every note in `recipe-notes-proposals.ko.json`. Each finding is fixed or recorded as accepted, and `verify.md` records the model, the date, and the outcome. No human review is required.
- **AC-21**: On a real iOS device and a real Android device, both with English as the system language, with the app set to `ko`, Korean renders with no clipped lines on the recipe screen, the pantry, and the account screen, and a rating count of 1 and of 2 both show the `_other` string. On iOS, recipe instructions wrap between words.
- **AC-22**: All Korean text written by AI or pinned in `LOCALE_AI_TERMS.ko` and the edge function instruction is stored in Unicode NFC (conjoining jamo composed into syllables), with no full width ASCII (U+FF01 to U+FF5E), no ideographic space, and no Japanese punctuation (`。` `、` `「」` `『』`). Compatibility jamo typed on purpose (`ㅋㅋ`) and half width Hangul are left as they are. A vitest scan over both `ko.json` files enforces the same rules plus no Han character, so the UI strings are checked automatically, not only by the AI pass.
- **AC-23**: Launch is one commit that adds `"ko"` to both `LAUNCHED_LOCALES` and `CATALOG_TRANSLATION_LOCALES`, made only after the catalog backfill, the notes apply, and the AI second pass are recorded in `verify.md`. A mobile build ships with it, and the production sitemap and hreflang show `ko`.
- **AC-24**: Feature 60 lists Korean among its store listing locales. The web launch does not wait on it.

## Decision

**Chosen option**: Option 1: The Japanese path, with a small Korean typography pass and an AI second pass in place of a human review.

Korean is added with the `simple` config and no SQL function change, gated behind `LAUNCHED_LOCALES`. Search reuses the spec 0050 CJK contains step as it is. Web loads Noto Sans KR and Noto Serif KR 600 from a second entry in `fetch-script-fonts.mjs`, linked only on `/ko`, and `:root:lang(ko)` keeps Korean words whole when wrapping. `normalizeKoreanTypography` sets NFC, half width characters, Western punctuation spacing, curly quotes, and turns any middle dot between Hangul into a space so search folds it. An Opus pass against a written checklist stands in for the native review.

**Implementation skills**: `supabase-postgres-best-practices` (`supabase/agent-skills`, `.agents/skills/supabase-postgres-best-practices/`) · `nextjs-app-router-patterns` (`wshobson/agents`, `.agents/skills/nextjs-app-router-patterns/`) · `react-native-best-practices` (`callstackincubator/agent-skills`, `.agents/skills/react-native-best-practices/`) · `vitest` (`antfu/skills`, `.agents/skills/vitest/`)

## Rationale

Reasoning and options: see [rationale.md](rationale.md).

## Feature design

**Data model sketch**:

| Entity | Primary key | Fields | Foreign keys | Cardinality |
|---|---|---|---|---|
| `supported_locales` (new row) | `code` | `('ko', 'simple')` | none | one row |
| `recipe_translations`, `ingredient_translations`, `tag_translations`, `recipe_ingredient_translations` (new rows only) | unchanged | `locale = 'ko'` rows from the backfills; `name_search` set by the existing trigger with `simple` | `locale` → `supported_locales(code)`, unchanged | N:1, unchanged |
| `user_preferences.locale` | unchanged | now accepts `'ko'` through the existing foreign key | unchanged | unchanged |

No table, column, extension, index, or function changes. `has_cjk` already includes Hangul Jamo, Compatibility Jamo, and Syllables (spec 0050), so the CJK contains step runs for any Korean query.

**API surface**:

| Endpoint / function | Method | Key inputs | Key outputs | Auth | Key errors |
|---|---|---|---|---|---|
| `search_recipes`, `search_ingredients` (no change) | Postgres function | `locale` now accepts `'ko'` | unchanged | unchanged | none new |
| `generate-drink-idea` (changed) | POST | `locale` accepts `"ko"` | unchanged | unchanged | unchanged |
| `translate-catalog --locale ko` (typography branch only) | CLI | `ko` | upserts `ko` translation rows | service role | unchanged |
| `propose-recipe-notes` / `apply-recipe-notes --locale ko` (typography branch only) | CLI | `ko` | `recipe-notes-proposals.ko.json`; apply report | service role | unchanged |
| Admin recipe form notes (no code change) | web | Korean section from `NON_DEFAULT_LOCALES` | `admin_set_recipe_translation_notes` with `p_locale = 'ko'` | admin | unchanged |

**Shared TS surface (`packages/shared/src/`)**:
- `locale.ts`: `SUPPORTED_LOCALES` gains `"ko"`; `LOCALE_TEXT_SEARCH_CONFIG.ko = "simple"`; `LOCALE_HREFLANG.ko = "ko"`; `LOCALE_AI_LANGUAGE.ko = "Korean"`; `LOCALE_NATIVE_NAME.ko = "한국어"`. `LAUNCHED_LOCALES` and `CATALOG_TRANSLATION_LOCALES` unchanged until launch.
- `LOCALE_AI_TERMS.ko`, drafted, then checked by the AI second pass before the backfill: write natural Korean in 해요체 (friendly polite; short nouns for labels); never use Hanja; lime «라임», lemon «레몬»; cocktail names in Hangul as Korean bars and menus write them (마가리타, 모히토, 진토닉, 올드 패션드), the established name first, else the standard loanword spelling; never a middle dot between words (use a space or nothing); shaker «셰이커», jigger «지거», muddler «머들러», strainer «스트레이너», bar spoon «바 스푼», simple syrup «심플 시럽», bitters «비터스», ice «얼음»; glasses 록 글라스, 칵테일 글라스, 콜린스 글라스, 하이볼 글라스; half width digits; units `ml`, `cl`, `L`, `온스`; Western punctuation (. , ? !) with no space before it; “ ” for quotes.
- `koreanTypography.ts` (new, with `koreanTypography.test.ts` beside it, a header comment like `japaneseTypography.ts`). Hangul syllables are U+AC00 to U+D7A3. Two pure, idempotent exports, and this is the one rule list (the edge function copies match it exactly):
  - `normalizeKoreanTypography(text: string): string`, for every Korean AI text field, applying in order: (1) `normalize("NFC")`; (2) full width ASCII (U+FF01 to U+FF5E) to half width (`１５` → `15`, `ＧＩＮ` → `GIN`) and the ideographic space U+3000 to a normal space; (3) `。` to `.` and `、` to `,`; (4) `「` and `『` to `“`, `」` and `』` to `”`; (5) spaces or tabs between a Hangul syllable and a following `.` `,` `?` `!` are removed (`넣어요 .` → `넣어요.`); (6) a straight `"…"` pair (no newline inside) whose inner text holds Hangul becomes `“…”` with the inner text trimmed. Decimals, `30ml`, URLs, `B-52`, parentheses, colons, any middle dot, compatibility jamo (`ㅋㅋ`), and Latin only text are left alone. Middle dots stay because Korean prose uses `·` to separate list items (`얼음·라임`).
  - `normalizeKoreanName(text: string): string`, for name fields only: `normalizeKoreanTypography`, then any run of optional spaces, one dot from the set `·` U+00B7, `・` U+30FB, `･` U+FF65, `•` U+2022, `‧` U+2027, `∙` U+2219, and optional spaces becomes one space when a Hangul syllable is on either side (`진·토닉` → `진 토닉`, `진·Tonic` → `진 Tonic`, `B·52` unchanged), then leading and trailing spaces are trimmed.
- `catalogTranslation.ts`: `localeTypography` gains `if (locale === "ko") return normalizeKoreanTypography;` and its doc comment names Korean (spec 0051 AC-1). New exported `localeNameTypography(locale: Locale): (text: string) => string` returns `normalizeKoreanName` for `ko` and `localeTypography(locale)` for every other locale (so no other locale changes). The name call sites use it instead: recipe `name` and `glass` (line 333 and 335 today), ingredient `name` (line 442), and tag `name` (line 518). Instructions, measures, and notes keep `localeTypography`.
- **Hanja or dot remedy**: the normalizers do not remove Hanja. A catalog row that fails the AC-14 SQL checks is fixed by rerunning `translate-catalog --locale ko` on those ids; a note with Hanja is fixed in the proposals file by the AI pass before the apply; a drink idea with Hanja is a finding the AI pass records and fixes in the edge function instruction.
- `units.ts` and `batch.ts`: `oz: "온스"`, `ml: "ml"`, `cl: "cl"`, and the litre label `"L"` for `ko`, wherever each label map lives (capital `L`, as for Japanese). `batch.ts`, `drinkIdeaLimitMessage.ts`: hand written `ko` entries (parts label «파트»).

**Web surface**:
- `apps/web/scripts/script-fonts.config.mjs`: `SCRIPT_FONT_STYLESHEETS` gains `{ dir: "ko", families: ["Noto+Sans+KR:wght@100..900", "Noto+Serif+KR:wght@600"] }`. `fetch-script-fonts.mjs` already loops every entry, and the postbuild check already requires each entry's `fonts.css` and files. Two small script changes: the call at line 87 passes `entry.minFacesPerFamily ?? MIN_FACES_PER_FAMILY` (so an entry may set its own bound; the stamp hash covers the whole entry, so adding the field refetches), and the `--dev` warning at line 108 becomes generic (`script font locales fall back to system fonts`) instead of naming `/ja`. In build step 1, measure each KR family's face count and record it in `verify.md`. If either is under 100 (Noto Serif KR 600 is the likelier one), set the `ko` entry's `minFacesPerFamily` just under the smaller measured count; never lower the Japanese bound.
- `apps/web/src/lib/font-stylesheet.ts`: the shared CSS matcher at line 93 widens to `/@font-face\{[^}]*(Noto[ _]+(Sans|Serif)[ _]+(JP|KR)|fonts\.gstatic\.com|\/fonts\/(ja|ko)\/)/i`, its comment and error message say "Noto CJK" instead of "Noto JP". `font-stylesheet.test.ts` gains: a `Noto Sans KR` `@font-face` rule fails, `next/font`'s `__Noto_Serif_KR_<hash>` fails, a `/fonts/ko/` URL fails, and a `:root:lang(ko)` block naming "Noto Sans KR" in a variable passes.
- `turbo.json` (`public/fonts/**`), `apps/web/.gitignore` (`/public/fonts/`), and the `next.config.ts` immutable cache header on `/fonts/:dir/:family/:version/:file*` already cover `ko`; no change.
- `apps/web/src/lib/display-font.ts`: `DisplayFont` gains `"notoSerifKr"` with `DISPLAY_FONT_BY_LOCALE.ko = "notoSerifKr"`; `BodyScriptFont` gains `"notoSansKr"` with `BODY_SCRIPT_FONT_BY_LOCALE.ko = "notoSansKr"`; `SCRIPT_FONT_STYLESHEET_BY_LOCALE.ko = "/fonts/ko/fonts.css"`. Comments name spec 0051 AC-10.
- `apps/web/src/app/[locale]/layout.tsx`: no `next/font` import for Korean. `DISPLAY_FONTS.notoSerifKr` is `{ variable: "" }` and `BODY_SCRIPT_FONT_CLASS.notoSansKr` is `""`, each with a comment that the `ko` stylesheet and `:root:lang(ko)` supply the font. The existing stylesheet `<link>` logic needs no change.
- `globals.css` (never `theme.generated.css`), after the Japanese block, with a comment in the same style: `:root:lang(ko) { --font-body-script: "Noto Sans KR", "Apple SD Gothic Neo", "Malgun Gothic", "Noto Sans CJK KR"; --font-display-loaded: "Noto Serif KR", "AppleMyungjo", "Batang", "Noto Serif CJK KR"; --font-body: var(--font-body-loaded), var(--font-body-script), var(--font-body-fallback); --leading-display: 1.3; --leading-heading: 1.4; --leading-subheading: 1.45; --leading-body: 1.75; --leading-body-small: 1.65; --leading-label: 1.5; }` then `:root:lang(ko) body { word-break: keep-all; overflow-wrap: anywhere; }` (headings inherit both; `anywhere`, unlike `break-word`, also lowers the min content width, so a long Korean word inside a flex or grid child cannot push it wider than the screen). A 700 weight on `/ko` headings is synthesized from 600, which is accepted.
- Share image: `SHARE_IMAGE_LOCALE.ko = "en"` in `apps/web/src/lib/open-graph.ts`.
- `messages/ko.json` matches `en.json`'s key paths. ICU plural messages carry only the `other` branch (plus any `=0` exact branch the English message has).
- Language switcher: the "한국어" option carries `lang="ko"` (already true for every native name option).

**Mobile surface**: `apps/mobile/src/i18n/index.ts` adds `import ko from "./locales/ko.json"` and `ko: { translation: ko }`; i18next uses `_other` only for `ko`. Korean renders in the system font (Apple SD Gothic Neo on iOS, Noto Sans CJK KR on Android); Hangul has no Han unification problem, so there is no glyph form check. `apps/mobile/src/components/text.tsx` passes `lineBreakStrategyIOS="hangul-word"` to `RNText` before `{...rest}` (so a caller can still override), with a comment naming spec 0051 AC-11; it changes nothing for non Hangul text. Screens that use React Native's `Text` directly are left as they are; the device check covers the key screens. Android has no word level Korean break setting in React Native, so Android may break inside a word; that is accepted and recorded in `verify.md`. If the device check shows clipped lines, stop and route back to `/architect` with screenshots rather than adding a bundled font or line height change in the build.

**Edge function** (`generate-drink-idea/index.ts`): `ko` in `SUPPORTED_LOCALES` (one line format kept for the parity test) and `LOCALE_NAMES.ko = "Korean"`, with an instruction that appends: `Write natural Korean in the 해요체 polite form, with no Hanja. Lime is 라임 and lemon is 레몬. Write cocktail names in Hangul as Korean bars write them, with no middle dot. Use half width digits, Western punctuation with no space before it, and “ ” for quotes.` The text passes through local copies of `normalizeKoreanTypography` and `normalizeKoreanName`, each one self contained function with no helpers outside it (`normalizeKoreanName` may call `normalizeKoreanTypography`). `LOCALE_TYPOGRAPHY` (line 225 today) gains `ko: normalizeKoreanTypography`, and `typesetIdea` uses `normalizeKoreanName` for `idea.name` and each ingredient `name` when the locale is `ko` (a `LOCALE_NAME_TYPOGRAPHY` map beside it, falling back to `LOCALE_TYPOGRAPHY`); amounts and the rest of the idea keep `normalizeKoreanTypography`. A "generate-drink-idea's Korean hand copies" describe block in `packages/shared/src/locale.test.ts`, as for Japanese, checks that the pinned terms in the instruction match `LOCALE_AI_TERMS.ko` and that both copies give the same output as the shared functions over the typography sample list.

**AI second pass** (replaces the native review; no new code): run in a Claude Code session on Opus. The checklist lives in this spec's `verify.md` under "Korean AI review", written in build step 1, and covers: 해요체 throughout with no 합니다체 or 반말 (casual speech); labels and buttons as short nouns; no Hanja; the pinned terms used exactly; drink names as Korean bars write them; placeholders (`{name}`, `{count}`) intact and the sentence still natural with a noun inserted (particles such as 이/가 written as `{name}이(가)` or reworded to avoid the particle); no English left untranslated except brand names and units; legal text (age gate, privacy) accurate to the English meaning; the notes factually match the recipe. The session writes fixes into the `ko.json` files, `LOCALE_AI_TERMS.ko` and the edge function sentence together, the proposals file, or (for catalog rows) a rerun of `translate-catalog` on the affected ids; it never edits the database by hand.

**Tests that change** (the compiler does not flag all of them): `apps/web/src/lib/display-font.test.ts` hard codes `ru`, `hi`, and `ja` in its "others" filters; it gains `ko` expectations (`notoSerifKr`, `notoSansKr`, `/fonts/ko/fonts.css`, share image `en`) and `ko` joins those filters. `apps/web/src/lib/font-stylesheet.test.ts` (above), including any assertion on the old "Noto JP @font-face rules in shared CSS" error text. A new `ko` strings scan test (in `apps/mobile/src/i18n/locales.test.ts` for the mobile file and a web test beside the messages for `apps/web/messages/ko.json`) walks every string and fails on a Han character, full width ASCII, an ideographic space, `。` `、` `「」` `『』`, or text that is not NFC (AC-22). `apps/mobile/src/i18n/locales.test.ts`, `pluralForms.test.ts`, and `plurals.test.ts` gain `ko` (their `Record<NonDefaultLocale, …>` maps fail typecheck until they do). `packages/shared/src/pluralForms.test.ts` gains `["ko", ["other"]]`. `packages/shared/src/catalogTranslation.test.ts`'s `localeTypography` block gains a `ko` case. Any test listing seven locales. At launch, `locale.test.ts`'s `hreflangAlternates` launched map plus a "launched Korean" describe block (`ko` and `ko-KR` detection, `CATALOG_TRANSLATION_LOCALES`), and a `ko` block in the `notesByLocale` fixture in `recipeNoteProposals.test.ts`.

**Checked, no change needed**: a live probe on 2026-11-12 (see rationale.md) shows `to_tsvector('simple', '진 토닉')` splits at the space, `search_fold` drops spaces, `has_cjk` is true for Hangul syllables and jamo, and the contains step finds 토닉 inside 진토닉. The web plural forms test iterates `NON_DEFAULT_LOCALES`. Detection's primary subtag rule handles `ko-KR`. Korean uses the dot decimal and comma thousands, so feature 58 owes it nothing new.

**Value sourcing**:

| Action | Value produced / displayed | Source |
|---|---|---|
| Catalog read with `locale = 'ko'` | which translation row joins | `resolve_locale('ko')` from `supported_locales`; no row → English base columns (AC-2) |
| Insert or update of a `ko` `recipe_translations` row | `name_search` | existing trigger: `to_tsvector('simple', name)` (AC-3) |
| Whether the CJK step runs for a Korean query | boolean | existing `cjk_query.active` (`has_cjk` covers Hangul) (AC-3) |
| Korean match across spacing | contains | existing `search_fold` on both sides (drops whitespace) (AC-3) |
| A drink, ingredient, tag, or glass name free of middle dots next to Hangul | text | `normalizeKoreanName` through `localeNameTypography`, or its edge function copy (AC-3, AC-14) |
| A failed Hanja or dot check | fixed row | `translate-catalog --locale ko` rerun on the failing ids (AC-14) |
| Recipe URL, canonical, sitemap entry | slug | `buildRecipeSlugPath(id, name, baseName)` unchanged, `baseName` = `base_name` (AC-9) |
| `/ko` body font | font stack | `--font-body-script: "Noto Sans KR"` in `:root:lang(ko)`, after Inter (AC-10) |
| `/ko` heading font | font family | `--font-display-loaded: "Noto Serif KR"` in `:root:lang(ko)`; `DISPLAY_FONT_BY_LOCALE.ko` = `"notoSerifKr"` applies no class (AC-10) |
| Whether a page links a font stylesheet | URL or none | `SCRIPT_FONT_STYLESHEET_BY_LOCALE[locale]` (AC-10) |
| Noto KR `@font-face` rules and slice files | CSS and woff2 | the `ko` entry in `script-fonts.config.mjs`, fetched by `fetch-script-fonts.mjs` at build, served from `/fonts/ko/` (AC-10) |
| Non `ko` CSS carries no Noto KR rule | pass or fail | the widened matcher in `font-stylesheet.ts`, run by `check-script-font-css.mjs` at `postbuild` (AC-10) |
| `/ko` line heights and wrapping | CSS values | the `:root:lang(ko)` rules in `globals.css` (AC-11) |
| iOS Korean wrapping | line break strategy | `lineBreakStrategyIOS="hangul-word"` in the shared `Text` (AC-11) |
| `/ko` share image | tagline, alt, font | `SHARE_IMAGE_LOCALE.ko` = `"en"` (AC-19) |
| Required plural forms for `ko` | form list | `Intl.PluralRules("ko")` → `other` (AC-12) |
| Detection after launch | locale | primary subtag `ko` within `LAUNCHED_LOCALES` (AC-8) |
| Hreflang, sitemap, `<html lang>` | code | `LOCALE_HREFLANG.ko` = `"ko"` (AC-8) |
| Language option label | name | `LOCALE_NATIVE_NAME.ko` = `"한국어"` (AC-8) |
| Catalog and notes prompts | language, terms, register | `LOCALE_AI_LANGUAGE.ko`, `LOCALE_AI_TERMS.ko` (AC-14, AC-15) |
| Drink idea in Korean | language, terms, register | edge function `LOCALE_NAMES.ko` plus its instruction (AC-17) |
| Korean AI output | NFC, half width, punctuation, quotes | `normalizeKoreanTypography`, or its edge function copy (AC-1, AC-17, AC-22) |
| Retranslation decision | whether to translate again | `source_name_hash` on the `ko` row (AC-14) |
| UI strings | text | `apps/web/messages/ko.json`, `apps/mobile/src/i18n/locales/ko.json`, AI drafted, then AI second pass (AC-1, AC-20) |
| Unit, batch, limit copy | Korean words | `ko` entries in `units.ts`, `batch.ts`, `drinkIdeaLimitMessage.ts` (AC-13) |
| Review sign off | pass record | the "Korean AI review" section of `verify.md`: model, date, findings, outcome (AC-20) |
| Launch | discovery and import translation | `"ko"` in `LAUNCHED_LOCALES` and `CATALOG_TRANSLATION_LOCALES`, one commit (AC-23) |

**Key invariants**:
- All 0045 to 0050 invariants hold. No SQL function body names `ko`; no SQL function changes.
- No `ko` catalog row contains Hanja, and no `ko` name field has a middle dot next to Hangul. Prose fields may keep `·` as a list separator.
- `localeNameTypography` equals `localeTypography` for every locale except `ko`.
- Japanese and every other locale's CSS, fonts, and search results are unchanged; no locale except `ko` links `/fonts/ko/fonts.css`.
- `ko` joins `LAUNCHED_LOCALES` and `CATALOG_TRANSLATION_LOCALES` in one commit, only after the AI second pass is recorded.
- The edge function's Korean instruction duplicates `LOCALE_AI_TERMS.ko` by hand; a change to one changes the other in the same commit.
- `normalizeKoreanTypography` is idempotent, its edge function copy matches it, and its output is NFC.

**Security model**: no change. `supported_locales` stays read only for `anon` and `authenticated`; no function, grant, or policy changes. No new PII. Compliance: Korean is a language, not a market. This spec does not target South Korea or change the age gate, so Korea's drinking age of 19 and PIPA (Korea's privacy law) are out of scope. Targeting Korea later needs its own legal review first.

**Configuration required**: no env vars or secrets. The web build fetches the KR fonts from `fonts.googleapis.com` and `fonts.gstatic.com` in `prebuild`, as it already does for JP.

**Critical test scenarios**:
- Happy path: after the backfill, `/ko/recipes/margarita-<uuid>` shows the Korean name, instructions, measures with `ml`, notes, and ingredient names, with Korean chrome in Noto KR, verifies **AC-1**, **AC-2**, **AC-9**, **AC-10**, **AC-13**.
- Search live, `ko` (example names from the real `ko` catalog): a two word drink name finds the recipe written with and without the space; its second word alone finds it through the contains step; a one syllable query finds the ingredients containing it, prefix first, staples hidden unless `include_staples`; "Margarita" still finds the recipe; `ㅈ` and `진ㅌ` return no CJK matches and no error, verifies **AC-3**.
- Regression: the widened 0045 structure query finds nothing; a spot check of `search_recipes` on `/ja` and `/en` with three queries each gives the same rows as before the `ko` row insert, verifies **AC-4**, **AC-5**.
- Typography (unit, pure): `normalizeKoreanTypography` turns `１５ml` into `15ml`, `얼음을 넣어요 .` into `얼음을 넣어요.`, `얼음을 넣어요。` into `얼음을 넣어요.`, `라임、레몬` into `라임,레몬`, `「김렛」` and `"김렛"을` into `“김렛”` and `“김렛”을`, U+3000 into a space; leaves `얼음·라임`, `1.5`, `30ml`, a URL, `B-52`, `(라임)`, `ㅋㅋ`, English sentences, and `“진”` alone; an odd count of straight quotes (`2" 잔`) is left alone; output is NFC (conjoining jamo compose to the syllable). `normalizeKoreanName` turns `진·토닉`, `진 · 토닉`, `진･토닉`, and `진•토닉` into `진 토닉` and `진·Tonic` into `진 Tonic`, and leaves `B·52` and `A·B` alone. Both are idempotent over the whole sample list. `localeNameTypography` returns the same function as `localeTypography` for every other locale, verifies **AC-1**, **AC-14**, **AC-17**, **AC-22**.
- Strings scan (unit): the `ko` strings scan passes on both `ko.json` files and fails on a planted Han character, `。`, and a decomposed syllable, verifies **AC-22**.
- Catalog checks (manual SQL): no `ko` row in the four translation tables has a Han character (`[㐀-䶿一-鿿豈-﫿]`); no `ko` name in `recipe_translations` (name, glass), `ingredient_translations`, or `tag_translations` has one of the six dots next to a Hangul syllable; any failing ids are rerun and checked again; every lime recipe's `ko` text contains 라임 and every lemon recipe's contains 레몬; a second `translate-catalog --locale ko` run translates nothing, verifies **AC-14**.
- Plurals (unit): the forms test passes with `ko`; the i18next Node test returns `_other` for 0, 1, 2, 5, verifies **AC-12**.
- Fonts and wrapping: on `/ko`, the network panel shows Noto Sans KR and Noto Serif KR slices, the rendered fonts panel lists no system fallback on the recipe page, pantry, and account page, no Korean word is split across lines at 360 px and 1280 px, recipe cards, chips, buttons, and pantry rows show no horizontal overflow at 360 px, and a long URL in a note still wraps; on `/en` and `/ja`, no request for `/fonts/ko/fonts.css` or a Noto KR file; `pnpm build` passes the postbuild check, and a stray `Noto_Sans_KR` `next/font` call in the layout makes it fail; the matcher unit tests pass, verifies **AC-10**, **AC-11**.
- Share image: `/ko/opengraph-image` is byte identical to `/en/opengraph-image`, verifies **AC-19**.
- Drift: the parity test fails if any list lacks `ko`; the Korean hand copies test fails if the edge function's pinned terms or typography copy drift, verifies **AC-6**, **AC-17**.
- Gating: before launch, `Accept-Language: ko-KR` lands on `/en`, the menu has no 한국어, the sitemap and alternates have no `ko`, `/ko/` is `noindex` with a self canonical; a stored `ko` preference is ignored and left in place, verifies **AC-7**, **AC-18**.
- Detection: after launch, `ko-KR` picks `ko`, verifies **AC-8**.
- Notes isolation: after `apply-recipe-notes --locale ko`, the other locales' notes snapshot is unchanged, verifies **AC-15**.
- Admin: saving Korean notes updates only the `ko` row, verifies **AC-16**.
- Drink idea: a `ko` request returns 해요체 Korean with no Hanja and passes pantry verification, verifies **AC-17**.
- AI review: `verify.md` holds the Korean AI review section with the model, date, every finding, and its outcome, verifies **AC-20**.
- Devices: on an English set iPhone and an English set Android phone with the app in `ko`, the recipe screen, pantry, and account screen show no clipped lines and `_other` for counts 1 and 2; on iOS, instructions wrap between words, verifies **AC-11**, **AC-12**, **AC-21**.

## Build plan

Tracer Bullet: one thin, unlaunched Korean thread through every layer, then content and the AI pass thicken it. Search needs no slice of its own. **Build now, unlaunched. Launch waits only on Korean's own checks (step 5).**

1. **Thread.** Migration `<timestamp>_korean_locale.sql`: `insert into public.supported_locales (code, text_search_config) values ('ko', 'simple');` plus a commented check block (free of `insert into public.supported_locales` and `('x', 'y')` tuples, so the parity test regex doesn't misread it). Rollback at `supabase/rollbacks/<timestamp>_korean_locale_down.sql`. You apply it in the SQL editor and run the widened 0045 structure query. Add `ko` and its map entries to `locale.ts`, fill every `Record<Locale, …>` the compiler flags (`units.ts`, `batch.ts`, `drinkIdeaLimitMessage.ts`, `display-font.ts`, `SHARE_IMAGE_LOCALE`). Add `normalizeKoreanTypography` and `normalizeKoreanName` with their tests, wire the first into `localeTypography`, and add `localeNameTypography` at the name call sites. Update every test named under "Tests that change" except the launch only ones, including the `ko` strings scan. Add `ko` to `generate-drink-idea` with its instruction, both typography copies, the `LOCALE_TYPOGRAPHY` and name map entries, and the Korean hand copies test, and you deploy it. Web: the `ko` font config entry (measure and record the face counts), the per entry face minimum and generic warning in `fetch-script-fonts.mjs`, the widened matcher with its tests, the `display-font.ts` and layout entries, and the `:lang(ko)` CSS; confirm `/en` and `/ja` never request the `ko` stylesheet. Mobile: `lineBreakStrategyIOS` in the shared `Text`, `ko.json` as a copy of `en.json` with the nav and the rating plural translated, registration, and the i18next Node plural test. Web `ko.json` likewise. Write the "Korean AI review" checklist into `verify.md`. Run `translate-catalog --locale ko --limit 1`. Check an English set iPhone and an English set Android phone. Done when `/ko/recipes/<slug>-<uuid>` shows Korean in Noto KR, searching its Korean name with and without spaces finds it, both phones render it cleanly, and the other locales are unchanged. Satisfies **AC-4**, **AC-5**, **AC-6**, **AC-7**, **AC-9**, **AC-10**, **AC-11**, **AC-12**, **AC-17**, **AC-18**, **AC-19**, **AC-21**, **AC-22**.
2. **Terms pass, then catalog backfill.** The AI second pass (Opus session) checks `LOCALE_AI_TERMS.ko` and the edge function sentence against the checklist; fixes land in both in one commit. Then you run `translate-catalog --locale ko` for the whole catalog, run it again to confirm it translates nothing, and run the Hanja, middle dot, lime, and lemon SQL checks (rerunning any failing ids until they pass), then the live `ko` searches. Satisfies **AC-2**, **AC-3**, **AC-14**.
3. **Notes proposal and UI strings.** Run `propose-recipe-notes --locale ko` and confirm the admin form's Korean section on one recipe. AI drafts the full web and mobile `ko.json` in 해요체 with `other` only plurals. Satisfies **AC-1**, **AC-13**, **AC-15**, **AC-16**.
4. **AI second pass, then the notes apply.** The Opus session runs the full checklist over the strings, the placeholder list, unit, batch, and limit copy, a 30 recipe catalog sample, 10 live drink ideas, and every note; fixes go in and `verify.md` records the model, date, and outcome. You run the 360 px check on web and both phones again, then `apply-recipe-notes --locale ko`. Satisfies **AC-1**, **AC-15**, **AC-17**, **AC-20**, **AC-21**.
5. **Launch.** After steps 2 to 4 are recorded, add `"ko"` to `LAUNCHED_LOCALES` and `CATALOG_TRANSLATION_LOCALES` in one commit with the launch only test changes (the `notesByLocale` fixture, the `hreflangAlternates` launched map, and a "launched Korean" describe block for `ko` and `ko-KR` detection and `CATALOG_TRANSLATION_LOCALES`). Ship a mobile build, and confirm the sitemap, hreflang, and detection in production. Satisfies **AC-8**, **AC-23**.
6. **Store listings.** Feature 60's row lists Korean. Satisfies **AC-24**.

## Migration plan

**Strategy**: feature flagged (`LAUNCHED_LOCALES`), one additive migration.
**Phases**: the `ko` row insert (step 1); backfills that only insert `ko` rows (steps 2 and 3).
**Rollback**: Korean is invisible until step 5, so fix forward. For a full revert, the Korean down SQL deletes the `ko` rows from the four translation tables, sets `user_preferences.locale` to null where it is `'ko'`, and deletes the `ko` row from `supported_locales`.
**Risks**: low. No search function changes. The main risk is text quality launched without a human reader, which the AI pass and the SQL checks reduce but do not remove.

## Consequences

**Positive**:
- Korean ships with no SQL function change; the spec 0050 CJK step pays off as designed.
- Search matches drink names with or without spaces, and partial words.
- Korean launches without waiting on finding a reviewer.
- The widened font matcher and per entry face minimum make Chinese the same small config change.

**Negative / tradeoffs**:
- No human has read the Korean text. Legal strings (age gate, privacy) and notes are checked only by a second model; errors a native speaker would catch may ship.
- No initial consonant search (ㅁㄱㄹㅌ), and a query ending in a half typed consonant finds nothing new until the syllable is complete.
- Android may break Korean inside a word; only iOS and web keep words whole.
- Two more web fonts on `/ko`, and Noto Serif KR is a different typeface from Fraunces. `/ko` pays one extra render blocking stylesheet.
- The `/ko` share image is in English. `/ko` URLs carry English words.
- Recipe text is machine translated. Learn and quizzes stay English under `/ko/`.
- Eight languages means more translation cost and one more string owed for every future feature.

**Neutral**:
- The default notes run's file gains a `ko` block at launch.
- The postbuild matcher now names two scripts; Chinese adds a third.

## Follow-up

- [ ] Update feature 60 in `docs/scope/scope.md` to add Korean to the store listing locales.
- [x] Enroll initial consonant (초성) search for Korean as its own feature (enrolled as feature 78); it needs a stored decomposed name and a script tested (not locale tested) SQL step, and could also strip a trailing loose jamo from the query.
- [ ] If a native Korean speaker becomes available, have them read the legal strings (age gate, privacy) first, then the UI strings.
- [ ] If Android's mid word breaking reads badly on the device check, decide whether to wrap Korean text on Android differently (`/architect`).
