# 0047. Rationale: Russian locale

## Context

Spec 0045 made the locale system language agnostic: one `supported_locales` row in SQL, one `SUPPORTED_LOCALES` list plus `Record<Locale, …>` maps in `packages/shared/src/locale.ts`, a parity test that keeps them in sync, and a copy of the list inside `generate-drink-idea`. French (spec 0046) proved a fourth language needs no SQL function edits. Every language so far uses the Latin script and two plural forms. Russian breaks four assumptions the code still makes:

- **Slugs.** `slugify` in `packages/shared/src/seo.ts` keeps only `a-z0-9`. Every Cyrillic recipe name collapses to the fallback, giving `/ru/recipes/recipe-<uuid>`. The page still resolves, because the id is read from the trailing uuid, but the URL carries no words, and the sitemap lists about 430 identical looking paths.
- **Fonts.** On web, `apps/web/src/app/[locale]/layout.tsx` loads Inter and Fraunces with `subsets: ["latin"]` only, and Fraunces has no Cyrillic glyphs. Russian headings would fall back to Georgia, mixed into the page. Mobile names "Fraunces" and "Inter" but never loads them, so it already renders in the system font, which covers Cyrillic.
- **Plurals.** Russian uses `one` (1, 21), `few` (2 to 4, 22), and `many` (5 to 20, 0) for whole numbers, plus `other` for fractions. Web has 6 ICU plural messages and mobile has 2 plural keys (`summary`, `starsLabel`), all written with `one`/`other` only. A missing `few` silently falls back to `other` and shows the wrong ending ("2 ингредиентов" instead of "2 ингредиента"), with no error.
- **Grammar around inserted names.** Russian nouns change their ending by their role in the sentence. A string that drops a name or noun into a sentence (`Missing: {names}`) reads wrong when the inserted word sits in the wrong case.

Search is less of a problem than the scope expected. A live probe on 2026-11-10 showed Postgres 17.6 with `en_US.UTF-8` collation and character type: `pg_trgm` builds trigrams from Cyrillic and matches case insensitively (`similarity('маргарита', 'Маргарита') = 1`), and the built in `russian` config already stems "ликёр" and "ликер" to the same word. Russian has no other accents, and `unaccent` would wrongly fold й into и.

Russian is offered as a language for speakers anywhere (the Baltics, Central Asia, Israel, the diaspora), not as a push into the Russian market. Russia's alcohol advertising ban (38-FZ) and its personal data localization rule (152-FZ) are therefore out of scope, and this spec does nothing to target the Russia storefront. The work runs on the same constraints as French: you apply migrations in the Supabase SQL editor, translation runs use Haiku through `ANTHROPIC_API_KEY`, and the catalog has about 430 recipes, 295 ingredients, and 62 tags. Learn and quizzes stay English until feature 64. Measures keep the dot decimal until feature 58, though Russian writes a decimal comma.

## Options considered

### Option 1: The 0045 path, plus three reusable non Latin pieces

Russian gets a `supported_locales` row with the built in `russian` config, like Spanish. Three pieces are added once, built so later scripts plug in: a transliteration step in `slugify`, a heading font chosen per locale on web, and a plural forms test driven by `Intl.PluralRules`.

**Pros**:
- No SQL function edits, and no new database objects beyond one row.
- Hindi, CJK, and Arabic get the slug, font, and plural patterns ready made.
- Each piece is small and testable on its own.

**Cons**:
- `slugify` gains a script table that later languages extend, and a mistake there changes URLs.
- A second display font on web is one more thing to keep in sync with the brand.

### Option 2: The 0045 path only

Add the row, the TS entries, and message files exactly like French. Accept `recipe-<uuid>` slugs and Georgia headings, and rely on the reviewer for plurals.

**Pros**:
- Smallest change, and it truly tests 0045 with nothing new.

**Cons**:
- Wordless URLs for every Russian recipe, and visibly mismatched headings.
- Plural gaps return silently whenever a new string is added.
- Every later non Latin language faces the same three problems again.

### Option 3: Romanize Russian content in the URL and the UI

Store a transliterated name beside each Russian name and use it in slugs and search.

**Pros**:
- Users could search Russian recipes by typing Latin letters.

**Cons**:
- A new column, its backfill, and edits to the search functions, which breaks AC-4.
- Search by English name already covers most Latin typing.

## Rationale

The forces are that Russian is the first of six non Latin languages, and the failures it exposes (wordless slugs, missing glyphs, silent plural gaps) are not Russian specific. Option 2 ships each of them and leaves the same work to Hindi and Japanese. Option 3 solves a search problem the probe showed is small, at the cost of the 0045 promise. Option 1 keeps the database to one row, because the live probe showed `russian` and trigram search already handle Cyrillic and ё, and spends the effort where users see it: URLs, headings, and word endings. The plural test is the piece most worth having, since Arabic's six forms would otherwise fail the same silent way.

Waiting for French's verify run means a shared path bug is fixed once, the same gate French used on Portuguese. Plain `ru` in hreflang serves every Russian speaking region. Detection keeps the existing primary subtag rule, so Ukrainian, Belarusian, and Kazakh devices never land in Russian, which would be both wrong and offensive to many of those users.

Calls made while writing (you may override any):
- **Transliteration table: the Yandex style used in Russian URLs** (й y, х kh, ц ts, ч ch, ш sh, щ shch, ж zh, ю yu, я ya, ё e, ы y, ъ and ь dropped). It touches only characters in the Cyrillic block (U+0400 to U+04FF): each is lowercased with `toLowerCase()` and mapped, and every other character passes to today's pipeline untouched, so existing slugs come out byte identical. Runner up: ICAO 9303 (the passport standard: ю iu, я ia, й i), which reads less naturally in a URL.
- **The table lives in a `SLUG_TRANSLITERATION` map keyed by character**, not by locale, so a Cyrillic name gets the same slug whatever the page locale, and Hindi or Arabic add their own characters later. Runner up: a per locale table, which breaks when an English page shows a Russian name.
- **Web heading font is a `DISPLAY_FONT_BY_LOCALE: Record<Locale, "fraunces" | "lora">` map in `layout.tsx`**, and the layout applies only the chosen font's `.variable` class to `<html>`. Both fonts write the same `--font-display-loaded` variable, so `theme.generated.css` needs no change. A `Record` makes the compiler ask every future locale which heading font it uses. Runner up: a CSS `:lang(ru)` override, which loads both fonts' CSS everywhere and hides the rule from the type system.
- **Lora loads with `subsets: ["latin", "cyrillic"]`, `preload: false`, `display: "swap"`.** Without preload, browsers download Lora only on pages that apply it, so non `ru` pages never fetch it (AC-10). Inter gains the `cyrillic` subset. Runner up: preload Lora too, which adds a font download to every page in every locale.
- **Russian body text on web gets `hyphens: auto` through a `:lang(ru)` rule** on body copy (not headings or buttons). Russian words run long, and `<html lang="ru">` lets the browser hyphenate correctly. Runner up: no hyphenation, which risks overflowing cards at 360 px.
- **Plural test rule.** Required forms = `new Set([0..1000].map(n => new Intl.PluralRules(locale).select(n)))` plus `other`. That gives `en` one/other, `fr` one/other (French `many` only starts at a million, matching spec 0046's choice), and `ru` one/few/many/other. Fractions are not tested; every current plural counts whole things (the decimal `{average}` sits outside the plural). Web messages are walked recursively through nested namespaces and parsed with `@formatjs/icu-messageformat-parser` (not resolvable from `apps/web` today, so it is added as a web dev dependency); the walk descends into nested `plural` and `select` blocks, and a `plural` block passes if it has each required keyword. Exact cases like `=0` are allowed beside the keywords but never replace one. English is exempt, since it is the source. Runner up: a regex parser, which breaks on nested plurals like `missingIngredients`.
- **The plurals in scope today**, each needing all four forms in `ru`: web `missingIngredients` (`=0 {Не хватает: {names}}` plus one/few/many/other for "+# more"), `summary`, `rateStars`, `starsLabel`, `unreviewedAllergens` (the verb agrees in each form), `ingredientCount`; mobile `summary` and `starsLabel`. The test will flag `missingIngredients` in `es`, `pt`, and `fr` (`=0 … other …`, no `one`), so the build adds a `one` branch copying the `other` text in those three files, a change that leaves their wording identical. Runner up: exempt that message, which defeats the test.
- **`normalizeRussianTypography(text)` in `packages/shared/src/russianTypography.ts`**, pure and idempotent: a pair of straight `"…"` becomes « … », and a hyphen or en dash with spaces on both sides (` - `, ` – `) becomes U+00A0 plus `— `. Hyphens inside words, number ranges like `2-3`, URLs, lone apostrophes, an unpaired quote, and text already inside « » are untouched. It runs on AI written text only, never on hand written UI strings. It is wired at the same call sites as `normalizeFrenchTypography`, with a `ru` branch. Runner up: fold both into one `normalizeTypography(locale, text)`, which you declined because it refactors shipped French code.
- **Share image font.** `opengraph-image.tsx` loads a bundled Fraunces `.ttf` for its tagline. Bundle `Lora-SemiBold.ttf` (Latin plus Cyrillic) beside it and pick the file from `DISPLAY_FONT_BY_LOCALE`, so a future script adds its own file there. Runner up: an English tagline on `/ru` share images, which looks unfinished when a link is shared in Russian.
- **ё is written where Russian spelling uses it** (ликёр, лёд), stated in `LOCALE_AI_TERMS.ru`, since search treats ё and е the same and ё helps reading. The reviewer may switch to plain е. Runner up: always е, the common print habit.
- **Parts label in batch copy is `ч.`** (short for часть, "part"), drafted for the reviewer. Runner up: the full word with plural forms, which needs plural handling in `batch.ts`.

