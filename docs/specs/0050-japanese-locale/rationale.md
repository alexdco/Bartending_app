# 0050. Rationale: Japanese locale

## Context

Spec 0045 made the locale system language agnostic. Spec 0047 added per locale heading fonts and the plural forms test, and spec 0048 (Hindi) added the `base_name` slug fallback for scripts with no letter table, a per locale body script font (`BODY_SCRIPT_FONT_BY_LOCALE`), and a share image locale map (`SHARE_IMAGE_LOCALE`). Japanese fits all three. What it breaks is search.

Recipe search today has three tiers: a tsvector (indexed word list) match on the English name and on the translated name using the locale's config; a trigram (three character chunk) similarity tier on the English name only; and a trigram tier over ingredient names. Ingredient search uses trigram similarity alone. Every tier assumes words are separated by spaces and that a query is several characters long. Japanese has no spaces between words, Postgres has no Japanese text search config, and Japanese queries are often one or two characters (梅, ジン). Japanese input also arrives in several forms for the same word: katakana (ジン), hiragana left unconverted on a phone keyboard (じん), and rarely half width katakana (ｼﾞﾝ). Drink names are often written with a middle dot between words (ジン・トニック) or without it (ジントニック).

A live probe on 2026-11-11 against the BartendingAppWeb database showed:

| Check | Result |
|---|---|
| Extensions available | `pgroonga` (not installed), `pg_trgm` 1.6, `unaccent` 1.1; no `pg_bigm` |
| Text search configs | `simple` present, no `japanese` |
| `to_tsvector('simple', 'ジン・トニック')` | `'ジン':1 'トニック':2` (splits at ・) |
| `to_tsvector('simple', '梅酒サワー')` | `'梅酒サワー':1` (one token) |
| `word_similarity('ジン', 'ジントニック')` | 0.67 (passes the 0.6 bar) |
| `word_similarity('トニック', 'ジントニック')` | 0.6 (borderline) |
| `word_similarity('梅', '梅酒')` | 0.5 (misses) |
| `similarity('ジン', 'ドライジン')` | 0.125 (misses) |
| `similarity('卵', '卵白')` | 0.25 (misses) |
| `normalize('ｼﾞﾝ', NFKC)` | `ジン` |
| `strpos('ドライジン', 'ジン')` | 4 (found) |

So trigrams cannot carry Japanese search, and a plain substring check can. Korean (feature 73) and Simplified Chinese (feature 74) face the same problem and are queued behind Japanese, so the scope asked this spec to settle CJK search for all three.

Japanese also brings smaller questions. Inter and Fraunces have no Japanese glyphs. Japanese line breaking can split a word between any two characters and must not start a line with small kana or ー. Han unification means one code point can draw differently in Japanese and Chinese fonts, and Android picks the form from the system language. Japanese has one plural form, uses 。、「」 punctuation, and writes foreign drink names in katakana. As with Hindi, the work runs through the SQL editor, translation uses Haiku through `ANTHROPIC_API_KEY`, and the catalog has about 430 recipes. Japanese is offered as a language, not a push into the Japanese market.

## Options considered

### Option 1: The Hindi path, plus a CJK substring tier gated by script

Japanese gets a `('ja', 'simple')` row. One locale agnostic migration adds `search_fold` (NFKC, hiragana to katakana, drop ・ and spaces) and `has_cjk`, and gives `search_recipes` and `search_ingredients` a contains tier on translated names that runs only when the query has a Han, kana, or Hangul character. Fonts, slugs, and the share image reuse the 0048 maps.

**Pros**:
- Short queries, hiragana, half width input, and dotted or undotted names all match.
- Other locales' results are untouched, by construction.
- No new extension; Korean and Chinese reuse it as is.

**Cons**:
- No fuzzy matching for CJK and only prefix then popularity ranking.
- Edits two live search functions used by every locale.

### Option 2: PGroonga

Install `pgroonga` and index translated names with its bigram tokenizer and NFKC normalizer, which can also fold kana.

**Pros**:
- Real full text search for CJK, with scoring, and it scales with an index.

**Cons**:
- A new extension with its own operators and index type, maintained through the SQL editor.
- Every search path needs its own PGroonga branch, and the team would learn a second search system for three languages and 430 recipes.

### Option 3: Trigram tier on translated names only

Run the existing trigram matching over translated names too.

**Pros**:
- The smallest SQL change, and it would help Hindi spelling variants as well.

**Cons**:
- The probe shows it misses one and two character queries and short words inside longer names (梅, ジン in ドライジン, 卵 in 卵白).
- Ungated, it changes results in every locale.

### Option 4: AI written search keywords

Have `translate-catalog` also write space separated keywords per name into a column the `simple` config tokenizes.

**Pros**:
- Works with the existing tsvector tier, and could add kanji and kana readings of the same word.

**Cons**:
- A new column on the translation tables, more AI output to review, and any word the AI didn't list stays unfindable.

## Rationale

The forces are a tiny catalog, short queries in a script with no spaces, two more CJK languages queued behind this one, and a database you change only through the SQL editor. Option 1 is the boring answer that fits all four: a substring check is exactly what CJK search needs at this size, the folding helper handles the input variants Japanese users actually produce, and gating on the query's characters keeps the promise every earlier locale spec made, that adding a language changes nothing for the others. Option 2 is the right tool at a much larger scale, but it adds an extension and a second search model for a problem `strpos` solves today. Option 3 fails the probe. Option 4 moves the problem into AI output that someone has to review.

Building now keeps the review lead time running, and launch waits only on Japanese's own sign offs, as Hindi does since 2026-11-11. Plain `ja` in hreflang fits, since Japanese has no regional variants that matter here.

Calls made while writing (you may override any):
- **`search_fold` also lowercases and drops whitespace and ・**, so ジントニック finds ジン・トニック. A query that folds to nothing (only ・ or spaces) never matches, since an empty string is "contained" in every name. Full width Latin queries are not CJK and stay on the existing tiers. Runner up: keep ・ and spaces, which misses the undotted spelling.
- **The CJK tier excludes ids already found by the English trigram tier**, since both sit in bucket 1 and a mixed query can hit both.
- **`has_cjk` covers Han, Hiragana, Katakana, half width katakana, and Hangul now**, so Korean needs no SQL change. Runner up: Japanese ranges only, which makes feature 73 edit the function again.
- **The CJK tier sits in `match_bucket = 1`**, after whole word matches from the `simple` config and beside the English trigram tier, which a CJK query never triggers. Prefix scores 1.0 and contains 0.5, then `fame_score`. Runner up: a new bucket, which changes the ordering contract for no gain.
- **The recipe search's ingredient tier gets the same CJK condition**, so searching ライム finds lime drinks even when ライム isn't in the name. Runner up: recipe names only, which leaves Japanese ingredient search in recipes trigram only.
- **No index.** At about 430 recipes, folding at query time is microseconds. Runner up: a stored folded column with a trigram index, kept as a follow up for scale.
- **`normalizeJapaneseTypography(text)` in `packages/shared/src/japaneseTypography.ts`**, pure and idempotent, run on AI written text only. In order: (1) NFC; (2) half width katakana (U+FF61 to U+FF9F) to full width, by applying NFKC to those runs only, so full width ！？ and 〜 stay as they are; (3) full width digits (U+FF10 to U+FF19) to ASCII digits; (4) a `.` becomes 。 when it ends a sentence (followed by end of text, a newline, or a space and then a Japanese character, or directly by a Japanese character) and the character before it is Japanese (Hiragana, Katakana, Han, or a closing 」), or is an ASCII digit, letter, `%`, or `)` inside a line that holds a Japanese character, never between two digits and never in a line with no Japanese character (so `ジンを30ml.` becomes `ジンを30ml。` while `Dr. Smith` and `1.5` stay); (5) a `,` directly after a Japanese character becomes 、; (6) ASCII `!` and `?` directly after a Japanese character become ！ and ？; (7) ASCII spaces between two Japanese characters (including after 。 or 、) are removed; (8) a pair of straight `"…"` whose content holds a Japanese character becomes 「…」. Parentheses, colons, semicolons, `~`, single quotes, and nested quotes are left as is. Decimals, `30ml`, URLs, `B-52`, and Latin only text are untouched. Runner up: prompt only, which leaves unreviewed drink ideas inconsistent.
- **Line heights on `/ja`** override the six tokens (display 1.3, heading 1.4, subheading 1.45, body 1.8, body small 1.7, label 1.5), since Japanese text reads denser than Latin at the same size. Runner up: Hindi's values, slightly tighter for body text than Japanese typesetting usually wants.
- **`line-break: strict` on the body, `word-break: auto-phrase` on headings only.** Body text breaking between characters is normal in Japanese; headings are where a split word looks broken. Runner up: `auto-phrase` everywhere, which can leave ragged body paragraphs.
- **Noto Sans JP as a variable font and Noto Serif JP at 600, served as Google's unicode range slices from a self hosted stylesheet linked only on `/ja`.** Revised on 2026-11-11, see *Font delivery revision* below. The first version declared both through `next/font` in the shared layout under a 60 KB bound, which the build exceeded. Runner up: a self hosted subset, which would have to be rebuilt whenever copy changes.
- **Unit labels `ml`, `cl`, `L`, `オンス`**, matching Japanese packaging. **Parts label «パート»**; the reviewer may prefer a ratio style. **Jigger is «メジャーカップ»**, the term Japanese bartenders use. **Native name "日本語"**.
- **ICU plural messages in `ja.json` carry only `other`** (plus any `=0` branch the English message has), since `Intl.PluralRules("ja")` has no `one`. Runner up: copying `one` branches, which never fire.
- **Mobile adds no font or line height code up front.** The device check decides; a needed change goes back through `/architect` because bundling a CJK font costs several MB per install. Runner up: Hindi's conditional multiplier map, which doesn't address glyph forms.

## Font delivery revision (2026-11-11)

**What happened.** Build step 1 declared Noto Sans JP and Noto Serif JP with `next/font/google` in the shared `[locale]/layout.tsx`, as the first version of this spec said. `next/font` writes one `@font-face` rule per unicode range slice into the CSS of the module that declares the font, and Google serves each CJK face as 124 slices. Because every locale renders that layout, every page's CSS grew by about 190 KB (about 68 KB compressed) of render blocking rules that only `/ja` uses, over AC-11's 60 KB bound. The spec said to stop and come back here rather than restructure the layout in the build, which is what this revision settles.

**Measured** (Google Fonts CSS2 API, 2026-11-11, modern Chrome user agent): Noto Sans JP variable, 124 faces, about 115 KB of CSS, slice files about 5.5 MB in total; Noto Serif JP 600, 124 faces, about 117 KB of CSS, slice files about 4.0 MB. A page downloads only the slices its characters need.

**Options considered.**

- **Own stylesheet, linked only on `/ja` (chosen).** A build step downloads Google's CSS and slices, rewrites the URLs to `/fonts/ja/…`, and the layout links the stylesheet only when the locale is `ja`. Other locales grow by 0 bytes, `/ja` keeps the same per page slice downloads, and no visitor request goes to Google. Costs a fetch script, a postbuild check, and a cache header, and loses `next/font`'s metric adjusted fallback face.
- **Raise the bound.** Keep `next/font` as built. No work, but every visitor in every locale pays about 68 KB compressed of render blocking CSS for a locale they never use, permanently, and Korean and Chinese would each add as much again.
- **Link Google's servers on `/ja` only.** Least code, but each `/ja` visitor's IP address goes to Google. The privacy page names every processor (Supabase, Anthropic, PostHog) and gates analytics behind consent; Google is not on it, so this would need a privacy change for a font.
- **Move the `next/font` calls into a `next/dynamic` component.** Might split the CSS into its own chunk, but whether the App Router keeps that CSS off other locales' pages is not something we could rely on without a spike, and the font variable class must sit on `<html>`, which a lazy component cannot reach.
- **Self hosted subset of the characters we use.** Small CSS and few files, but it must be rebuilt whenever UI strings or catalog text add a character, and a missed character silently falls back to a system font.

**Sub decisions.**

- **Fetch at build, gitignored, not committed.** No 9.5 MB of binaries in git history (again on every refresh), and the build already depended on Google through `next/font`. Runner up: commit the files for offline, reproducible builds.
- **A failed fetch fails the build**, so a deploy never ships `/ja` in system fallback fonts by accident; `pnpm dev` only warns, so offline work on other locales is not blocked. Runner up: warn and continue in both.
- **A postbuild script enforces the 0 byte rule** on every build, not just at verify, because a later edit that adds a `next/font` CJK call to the layout would otherwise regress it quietly. Runner up: a manual check at `/check verify`.
- **`SCRIPT_FONT_STYLESHEET_BY_LOCALE` as a `Record<Locale, string | null>`** and a config list in the fetch script, so Korean and Chinese (features 73 and 74) add one entry each. Runner up: a hard coded `locale === "ja"` check in the layout, which the next CJK locale would have to generalize anyway.
- **A plain render blocking `<link>` on `/ja`**, not a non blocking load, because the rules are small next to the fonts and a late stylesheet would show headings in the wrong family first. Runner up: `media="print"` swap trick.
- **Immutable caching on the versioned slice paths** (`/fonts/ja/<family>/<version>/…`), keeping Google's version segment so a new upstream version gets new URLs. `fonts.css` keeps the default revalidating cache. Runner up: Vercel's default caching, which revalidates every slice.
