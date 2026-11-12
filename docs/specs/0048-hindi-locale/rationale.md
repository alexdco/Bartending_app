# 0048. Rationale: Hindi locale

## Context

Spec 0045 made the locale system language agnostic, and spec 0047 (Russian) added three pieces for non Latin scripts: a `SLUG_TRANSLITERATION` table in `slugify`, a heading font per locale on web (`DISPLAY_FONT_BY_LOCALE`), and a plural forms test driven by `Intl.PluralRules`. Hindi is written in Devanagari, and it breaks some of the assumptions those pieces still make:

- **Slugs.** Devanagari is an abugida (each consonant carries a built in "a" sound that speakers often drop). Whether the "a" is spoken depends on the word, so a character table cannot predict it: मार्गरीटा comes out as something like `maargariitaa`. Most Hindi drink names are English names written in Devanagari, so the readable slug is the English one. Today `slugify` drops every Devanagari letter and falls back to `recipe-<uuid>`. Every recipe read function returns only `coalesce(rt.name, r.name) as name`, so a `/hi` page never holds the English name it would need.
- **Body font.** Russian only needed a new heading font, because Inter has Cyrillic. Inter has no Devanagari, and neither does Fraunces. Without a loaded font, each browser picks its own (Kohinoor, Nirmala UI, Noto) with different metrics.
- **Shaping.** Devanagari joins consonants into conjuncts (क्ष, त्र) and places vowel signs before, above, and below letters. That needs OpenType shaping. `next/og` renders share images through Satori, which does not do complex script shaping, so a Hindi tagline may render with broken conjuncts.
- **Line height.** Vowel signs above and below the line make Devanagari taller than Latin at the same size, so the brand's 1.15 heading and 1.5 body line heights crowd it. On Android, React Native can clip such lines at a fixed line height.
- **Punctuation and units.** Hindi ends sentences with the danda (।). AI output mixes in full stops, and a period based abbreviation like मि.ली. collides with any rule that turns a final full stop into a danda.
- **Lime and lemon.** नींबू covers both. The catalog depends on telling them apart.

Search is mostly solved. A live probe on 2026-11-11 against the BartendingAppWeb database showed:

| Check | Result |
|---|---|
| `version()` | PostgreSQL 17.6 |
| Collation / ctype | `en_US.UTF-8` / `en_US.UTF-8` |
| `hindi` in `pg_ts_config` | present (also `nepali`, `tamil`) |
| `to_tsvector('hindi', 'मार्गरीटा कॉकटेल और नींबू का रस')` | `'और':3 'क':5 'कॉकटेल':2 'नींब':4 'मार्गरीट':1 'रस':6` (stems, no stop words) |
| `'संतरे'` matches query `'संतरा'` under `hindi` | true |
| `'मार्गरीटा'` matches query `'मार्गरिटा'` under `hindi` | false |
| `similarity('मार्गरीटा', 'मार्गरिटा')` | 0.54 |
| `ज़्यादा` versus `ज्यादा` | different lexemes |
| `मेंहदी` matches `मेहंदी` | false |
| `show_trgm('मार्गरीटा')` | 10 trigrams, the word kept whole |
| `to_tsvector('hindi', 'Margarita')` | `'margarita':1` |

So the built in config handles inflection, trigram handles Devanagari, and spelling variants are the gap. The recipe trigram tier in `search_recipes` reads only the English `r.name`, so it does not catch Hindi variants. Feature 77 already owns mark insensitive search across locales.

Hindi is offered as a language for speakers anywhere, not as a push into the Indian market, which has state level drinking ages from 18 to 25, prohibition in some states, and the DPDP Act 2023. Mobile names "Fraunces" and "Inter" but never loads them, so it renders in the system font, which covers Devanagari on iOS and Android. The work runs on the same constraints as Russian: you apply migrations in the Supabase SQL editor, translation runs use Haiku through `ANTHROPIC_API_KEY`, and the catalog has about 430 recipes. French (69) and Russian (70) both still owe `/check verify`; since 2026-11-11 Hindi's launch no longer waits on them.

## Options considered

### Option 1: The Russian path, with an English name slug source and Devanagari fonts

Hindi gets a `supported_locales` row with the built in `hindi` config. A locale agnostic migration adds `base_name` to the recipe read functions, and slugs fall back to it when a name has letters outside Latin and Cyrillic. Web loads Noto Sans Devanagari (body, after Inter) and Noto Serif Devanagari (headings) only on `/hi`. The share image maps `hi` to English, and a typography pass sets the danda.

**Pros**:
- Readable, stable URLs with no redirect on card clicks.
- Japanese, Korean, Chinese, and Arabic get the slug fallback with no further SQL.
- Consistent, correctly shaped Devanagari on every OS.

**Cons**:
- Edits about eight live read functions once, against the "no function edits per locale" pattern.
- URLs carry English, not Hindi, words.
- Two more fonts, and an English share image on `/hi`.

### Option 2: The Russian path with a Devanagari transliteration table and system fonts

Add Devanagari to `SLUG_TRANSLITERATION`, rely on each OS's Devanagari font, and render the share image in Hindi.

**Pros**:
- No SQL function edits and no new web fonts.
- The URL reflects the Hindi name.

**Cons**:
- Lossy slugs (`maargariitaa`) that no Hindi or English reader would type.
- Text looks different on Windows, macOS, and Android, with uneven line heights.
- A share image likely to show broken conjuncts.

### Option 3: Option 1 plus a custom normalized Hindi search config

Also build a `hindi_normalized` config that strips the nukta and folds long and short vowel signs and nasal marks, so spelling variants match.

**Pros**:
- The best Hindi search, catching the variants the probe showed missing.

**Cons**:
- A custom dictionary to write and maintain, in a database you change only through the SQL editor.
- Solves for one language what feature 77 is scoped to solve for all.

### Option 4: Bare `recipe-<uuid>` slugs for Hindi

Keep everything in Option 1 except the slug source: accept the existing fallback and decide slugs with Japanese.

**Pros**:
- No function edits at all.

**Cons**:
- Wordless URLs for every Hindi recipe, and the sitemap lists about 430 identical looking paths.
- Japanese faces the same problem anyway, so the work is deferred, not avoided.

## Rationale

The forces are that Hindi is the first language whose script has no workable letter table, and that four more such languages are queued behind it. Option 2 picks the cheapest path for each problem, but every choice ships something a Hindi reader would notice: unreadable slugs, inconsistent fonts, and a broken share image. Option 4 avoids the function edit only by handing it to Japanese. Option 1 spends a single, locale agnostic migration so the slug question is answered for every remaining script, and puts the rest of the effort where users see it: fonts, line heights, punctuation, and the lime and lemon distinction. Option 3 is right in spirit, but spelling variants exist in every language, and feature 77 already owns them.

Building now keeps the Hindi review lead time running. Launch originally also waited for French and Russian to verify, so three unverified locales would never be live at once. On 2026-11-11 you dropped that wait: Hindi launches on its own sign offs. The cost is that Hindi, French, and Russian may all be live before French and Russian pass `/check verify`; it is accepted because each locale sits behind its own `LAUNCHED_LOCALES` entry and can be hidden again by removing it. Plain `hi` in hreflang fits, since Hindi is written the same way everywhere it is used. Detection keeps the primary subtag rule, so `en-IN` users (a large share of Indian devices) stay in English, and Marathi and Nepali speakers, who share the script but not the language, never land in Hindi.

Calls made while writing (you may override any):
- **The slug rule looks at the characters, not the locale.** `buildRecipeSlugPath` uses `baseName` when `name` holds a letter (`\p{L}`) whose script is not Latin, Cyrillic, Common, or Inherited. Allowing Common and Inherited keeps letters like `µ` and `ʼ` from flipping an existing Latin slug. A mixed name like "B-52 शॉट" uses the English name rather than a half slug. Runner up: a `LOCALE_SLUG_SOURCE` map per locale, which needs the locale threaded into every call site and gives an English page showing a Hindi name a different slug.
- **`base_name` is a new last output column, not a changed `name`.** Adding a column means `drop` and `create` (Postgres cannot change a function's output columns with `create or replace`), so the migration restates grants and settings. Runner up: a separate `recipe_base_names(ids)` lookup per page, which adds a round trip to every list.
- **`baseName` is a required parameter**, so the compiler finds every call site. Runner up: optional, which would silently leave some `/hi` links bare.
- **Body font stack is Inter, then Noto Sans Devanagari** through a `:lang(hi)` override of `--font-body`, so Latin brand names and numbers on `/hi` keep Inter and only Devanagari characters use Noto. Noto Sans Devanagari loads only the `devanagari` subset, weights 400 and 600, `preload: false`. Runner up: Noto Sans Devanagari for all `/hi` text, which changes how Latin reads on those pages.
- **Heading font is Noto Serif Devanagari SemiBold** through the existing `DISPLAY_FONT_BY_LOCALE` map, with `latin` and `devanagari` subsets so a heading mixing both stays in one face. Runner up: Tiro Devanagari Hindi, which has no SemiBold.
- **Line heights on `/hi` override the six `--leading-*` tokens** (display 1.35, heading 1.4, subheading 1.45, body 1.75, body small 1.7, label 1.6) in a `:root:lang(hi)` block, because text styles apply `leading-*` utilities to spans, labels, buttons, and nav, which element selectors would miss. Mobile gets a `LINE_HEIGHT_SCALE_BY_LOCALE` multiplier only if the device check shows clipping. Runner up: change the shared tokens for every locale, which loosens every other language's layout.
- **Share image maps `hi` to English through `SHARE_IMAGE_LOCALE`**, and `DISPLAY_FONT_FILES` is keyed by a narrower `ShareImageFont` type with a test, so the share image never needs a Devanagari file. Arabic can reuse the map. Runner up: try a Devanagari tagline and check it visually, which you declined.
- **`normalizeHindiTypography(text)` in `packages/shared/src/hindiTypography.ts`**, pure and idempotent, run on AI written text only. In order: (1) normalize to NFC (one standard byte form, so precomposed and decomposed nukta letters match in search, hashes, and the lime check); (2) rewrite dotted unit abbreviations from a small map (`मि.ली.` → `मिली`, `सें.ली.` → `सेली`, `ली.` after a digit and a space → `ली`); (3) remove a space before `।`; (4) a single `.` directly after a Devanagari character (U+0900 to U+097F) becomes `।` only when it ends a sentence: followed by a newline, a closing quote, the end of text, or a space and then a word that is not on a short abbreviation list (`डॉ`, `श्री`, `सं`, `पृ`); a run of dots (`...`) and every `|` are left alone; (5) a pair of straight `"…"` becomes “ … ”. Decimals, URLs, Latin text, and an unpaired quote are untouched. The cross check showed a looser rule turns `डॉ. शर्मा` into `डॉ। शर्मा`, so those cases are unit tests. Runner up for rule 4: no conversion at all, relying on the prompt, which the cross check called safer but which leaves unreviewed drink ideas mixed. Wired beside `normalizeRussianTypography` with an `hi` branch. Runner up: prompt only, which leaves unreviewed drink ideas inconsistent.
- **Units are dotless** (`मिली`, `सेली`, `ली`, `औंस`), as on Indian packaging, so the danda rule never meets an abbreviation in UI strings. Runner up: `मि.ली.`, which the normalizer would then have to protect everywhere.
- **Native name is "हिन्दी"**, the spelling most language pickers use. The reviewer may switch to "हिंदी". Runner up: "हिंदी", the more common everyday spelling.
- **Simple syrup is «शुगर सिरप»**, the bar loanword, matching the everyday register. Runner up: «चाशनी», the kitchen word, which suggests a thicker syrup.
- **Parts label in batch copy is «भाग»**, which does not change form with the count. Runner up: «हिस्सा», which needs plural handling.
