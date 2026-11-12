# Verify: Japanese locale · spec 0050 · updated 2026-11-11
_Steps derived from spec 0050 acceptance criteria. `/check verify` runs these; `/test` locks the durable ones._

## Step 1: thin thread (unlaunched)

### Commands
- [x] `pnpm test` → all pass (910 on 2026-11-11), including the Japanese hand copies, plural forms, `font-stylesheet`, and `display-font` tests → AC-7, AC-11, AC-12, AC-18, AC-22
- [x] `pnpm --filter web run fetch-script-fonts` → writes `/fonts/ja/fonts.css` and 248 slices; a second run prints "are current" → AC-11
- [x] `pnpm --filter web run build` → prebuild fetch runs, `next build` passes, postbuild prints "Script font check passed" → AC-11
- [x] Add a stray `Noto_Sans_JP({ variable: "--x" })` call to `apps/web/src/app/[locale]/layout.tsx` and build → postbuild fails naming the CSS file; revert → AC-11 (2026-11-11: build failed with "Noto JP @font-face rules in shared CSS" naming the chunk; layout restored byte for byte and a clean build passes again)
- [ ] A Vercel build log shows both the font fetch line and "Script font check passed" → AC-11
- [ ] A second `pnpm build` with a Turborepo cache hit still serves `/fonts/ja/fonts.css` and its slices → AC-11 (2026-11-11, partly checked locally: the cache artifact lists the `public/fonts/ja/` woff2 files, and deleting `public/fonts` then building gives a cache miss that refetches all 248 slices, so `/ja` keeps its fonts either way; a true hit that restores them was not observed locally, so confirm on a Vercel redeploy with remote cache)
- [x] `curl -I` on a slice → `Cache-Control: public, max-age=31536000, immutable`; on `fonts.css` → revalidating (`max-age=0`) → AC-11 (checked locally; repeat on the deployment)

### Database (SQL editor)
- [x] Before applying `20261111140000_japanese_locale.sql`, snapshot `search_recipes` and `search_ingredients` in `en`, `es`, `pt`, `fr`, `ru`, `hi` over a fixed query list, as `anon` and `authenticated` (2026-11-11: the step 2 after apply snapshot, taken before this apply, 175 cases each role)
- [x] Apply it, then `select code, text_search_config from public.supported_locales where code = 'ja'` → one row, `simple` → AC-7, AC-19 (applied 2026-11-11; `resolve_locale('ja')` → `ja`, `locale_search_config('ja')` → `simple`)
- [x] `select to_tsvector('simple', 'ジン・トニック')` → `'ジン':1 'トニック':2` → AC-3 (passed 2026-11-11)
- [x] Rerun the snapshot → identical rows and order → AC-6 (2026-11-11, as `anon`: 175 cases, 0 differences, same 2066 recipe and 560 ingredient rows)
- [x] The 0045 structure query with its pattern widened to `'(es|pt|fr|ru|hi|ja|spanish|portuguese|french_unaccent|russian|hindi|simple)'` (quoted literals only) → no match in any function body → AC-5
- [ ] Set a test user's `user_preferences.locale` to `'ja'` → accepted; detection ignores it and leaves it in place → AC-19

### Edge function
- [ ] Deploy `generate-drink-idea`; a `locale: "ja"` request returns polite Japanese with 。 and passes pantry verification → AC-18 (deployed as version 16 on 2026-11-11, `verify_jwt` still true; the `ja` request check is still owed)

### Catalog
- [x] `translate-catalog --locale ja --limit 1` → one `ja` recipe row, NFC, no half width katakana, no full width digits → AC-22 (2026-11-11: Jamaica Kiss → ジャマイカ・キス, plus one ingredient, one tag, three measures; all NFC, no half width katakana, no full width digits)
- [x] `/ja/recipes/<slug>-<uuid>` for that recipe uses the English name slug, returns 200 with no 308, and shows the Japanese name → AC-10 (slug part checked 2026-11-11: `buildRecipeSlugPath` gives `jamaica-kiss-4235ac1d-3173-4159-a24a-40f824453d58`; the 200 and no 308 check needs the web app) (2026-11-11 on a local production build: `/ja/recipes/jamaica-kiss-4235ac1d-…` returns 200 with no redirect and shows ジャマイカ・キス)
- [x] Searching its whole Japanese name on `/ja` finds it → AC-3 (thin thread; short and hiragana queries are step 2) (2026-11-11 as `anon`: ジャマイカ・キス finds it)

### UI / manual
- [x] `/ja` HTML links `/fonts/ja/fonts.css`; `/en` HTML has no `/fonts/ja` reference → AC-11
- [ ] On `/ja`, the network panel shows Noto Sans JP and Noto Serif JP slices; headings render in Noto Serif JP; the rendered fonts panel lists no system fallback → AC-11
- [x] On `/en`, `/ru`, `/hi`, no request for `/fonts/ja/fonts.css`, any Noto JP file, `fonts.googleapis.com`, or `fonts.gstatic.com` → AC-11 (2026-11-11 on a local production build, HTML level: `/en` has no `/fonts/ja` link and no Noto JP, googleapis, or gstatic reference, and the postbuild check proves no built CSS carries a Noto JP rule; a browser network panel pass on `/ru` and `/hi` is still worth doing in /check verify)
- [ ] Switch `en` → `ja` → `en` without a reload → Noto JP loads on `/ja`, no `fonts.css` link remains on `/en` → AC-11
- [ ] On `/ja`, no line starts with ー or ッ; in Chrome a long heading breaks between phrases → AC-11
- [x] `/ja/opengraph-image` is byte identical to `/en/opengraph-image` → AC-20 (2026-11-11: the home `og:image` `/ja/opengraph-image/card` is byte identical to `/en/opengraph-image/card`, 40,965 bytes, alt "Cocktail recipes and pantry ideas"; recipe pages use the drink photo)
- [x] `Accept-Language: ja-JP` lands on `/en`; no 日本語 in the menu; no `ja` in the sitemap or alternates; `/ja/` is `noindex` with a self canonical → AC-8 (2026-11-11 on a local production build: `Accept-Language: ja-JP` on `/` → 307 to `/en`; `/en` has no 日本語 and hreflang en, es, fr, hi, pt-BR, ru only; the sitemap has no `/ja/`; `/ja` and the `/ja` recipe page are `noindex` with a self canonical and no alternates)
- [ ] Mobile dev build lists 日本語; production build does not → AC-8
- [ ] English set iPhone and English set Android phone, app in `ja`: no clipped lines on recipe, pantry, account; 直 骨 刃 in Japanese forms; rating count 1 and 2 show the `_other` string → AC-12, AC-21

## Acceptance-criteria coverage (step 1)
- AC-5 structure query · AC-6 snapshot · AC-7 tests + row · AC-8 gating · AC-10 slug · AC-11 fonts, build, cache, network · AC-12 plurals + phones · AC-18 drink idea · AC-19 preference · AC-20 share image · AC-21 phones · AC-22 one translated recipe

## Step 2: CJK search tier

### Before apply (done by /develop, read only)
- [x] Old and new `search_recipes` and `search_ingredients` bodies run side by side as plain queries (helpers inlined) over 17 queries (Latin, accented, Cyrillic, Devanagari, full width Latin, `B-52`, empty) in `en`, `es`, `pt`, `fr`, `ru`, `hi` → 102 cases, 0 differences, 1810 recipe rows and 484 ingredient rows compared (2026-11-11) → AC-6
- [x] Fold and gate expressions on live Postgres: `ｼﾞﾝ`, `じん`, `ジン` fold to `ジン`; `ジン・トニック`, `ジン　トニック`, `ｼﾞﾝ･ﾄﾆｯｸ` fold to `ジントニック`; `・ ` folds to empty; `has_cjk` is false for `Margarita`, `ＧＩＮ`, `मार्गरीटा` and true for `梅`, `진` → AC-3, AC-4

### Database (SQL editor)
- [x] Snapshot `search_recipes` and `search_ingredients` in the six locales over a fixed query list, as `anon` and `authenticated`; apply `20261111150000_cjk_search.sql`; rerun → identical rows and order → AC-6 (2026-11-11, after apply: the pre CJK bodies from the rollback file run inline against the live functions, 25 queries including CJK ones, in 7 locales including `ja`, as `anon` and as `authenticated` → 175 cases each, 0 differences)
- [x] `select proname, proacl from pg_proc where proname in ('search_fold','has_cjk','search_recipes','search_ingredients')` → each grants anon, authenticated, service_role and nothing to public → security model (passed 2026-11-11; helpers immutable and parallel safe, `search_path ''`)
- [x] `select public.search_fold('ｼﾞﾝ'), public.search_fold('じん'), public.search_fold('ジン・トニック')` → `ジン`, `ジン`, `ジントニック`; `select public.has_cjk('Margarita'), public.has_cjk('ＧＩＮ'), public.has_cjk('梅'), public.has_cjk('진')` → f, f, t, t → AC-3 (passed 2026-11-11; folds are idempotent; live `has_cjk` keeps its `\u` escapes)
- [x] The 0045 structure query with its pattern widened to `'(es|pt|fr|ru|hi|ja|spanish|portuguese|french_unaccent|russian|hindi|simple)'` (quoted literals only) → no match in any function body → AC-5 (passed 2026-11-11)
- [x] `select * from public.search_recipes('・', locale => 'ja')` and `('・ ', ...)` → no CJK matches → AC-3 (2026-11-11: identical to the pre CJK body in the snapshot)
- [x] `select * from public.search_recipes('ジン', locale => 'en')` → no CJK matches (no `en` translation rows) → AC-3 (2026-11-11: identical to the pre CJK body in the snapshot)

### Live `ja` search (after the `ja` row and translated recipes exist; pick names from the real catalog)
- [x] The katakana, hiragana, and half width forms of one drink word return the same recipes → AC-3 (2026-11-11: ジャマイカ, じゃまいか, ｼﾞｬﾏｲｶ, and キス each find ジャマイカ・キス)
- [x] A name written with ・ is found by the same query without it → AC-3 (2026-11-11: ジャマイカキス and ジャマイカ キス find ジャマイカ・キス)
- [x] A one kanji query finds a recipe whose `ja` name contains it; within the CJK tier a prefix match lists before a contains match, ties by fame → AC-3 (2026-11-12, after the backfill: 母 finds オーウェンの祖母の復讐 and 南 finds ラッシー・南インドの飲み物, the only kanji names besides 手作りカルーア; じん lists every ジン… name first, then ピンク・ジン and ラモス・ジン・フィズ, then the gin ingredient tier, 50 rows, no duplicates)
- [x] `Margarita` on `ja` still finds the recipe through the English name → AC-3 (2026-11-11: checked with Jamaica Kiss on `ja`)
- [x] `B-52ショット` (or another mixed query) returns each recipe at most once → AC-3 (2026-11-12: B-52 is ビー・52 in `ja`; ビー・52, ビー52, スパイス75, and マルティネス 2 each return their recipe once, 0 duplicates)
- [x] `search_ingredients` with a one kanji query lists the ingredients containing it, prefix first; staples hidden unless `include_staples` → AC-4 (2026-11-12: 卵 → 卵, 卵白, 卵黄; 氷 → nothing, and 氷 with `include_staples` → 氷)
- [x] A recipe is found through a Japanese ingredient name in the ingredient tier → AC-4 (2026-11-11: コーヒー and こーひー find Fancy White Russian through コーヒーリキュール)

## Acceptance-criteria coverage (step 2)
- AC-3 fold checks, live `ja` searches, `・` and `en` checks · AC-4 ingredient searches · AC-5 structure query · AC-6 pre apply side by side plus post apply snapshot

## Build step 3 (terms review, then catalog backfill)

_2026-11-12: you approved `LOCALE_AI_TERMS.ja` and `JAPANESE_INSTRUCTION` as drafted. No extra pins were needed after the backfill: grapefruit, cranberry, lemonade, and egg white came out as plain katakana or kanji (グレープフルーツ, クランベリー, レモネード, 卵白)._

- [x] Native reviewer approves `LOCALE_AI_TERMS.ja` and `JAPANESE_INSTRUCTION` in `generate-drink-idea` → AC-15, AC-18
- [x] `pnpm --filter @bartendingapp/shared translate-catalog --locale ja` → every live recipe, ingredient, and tag has a `ja` row → AC-2, AC-15 (2026-11-12: 474 recipes, 0 skipped; 475 recipe rows for 475 live recipes, 398 ingredients, 395 tags, 1,829 measure rows)
- [x] Run it again → translates nothing → AC-15 (0 ingredients, 0 tags, 0 recipes)
- [x] Every `ja` row is NFC with no half width katakana or full width digits, and `name_search` equals `to_tsvector('simple', name)` → AC-3, AC-22 (0 non NFC rows across the four tables, 0 bad characters, 0 mismatches; only AT&T keeps a Latin name)
- [x] Lime and lemon: every ingredient, recipe name, and recipe instruction whose English says lime has ライム, and lemon has レモン, with no swap → AC-15 (the only lemon misses are lemonade names, レモネード, which is right)

For step 5 review: the model uses ・ in ingredient names unevenly (フレッシュライムジュース next to フレッシュ・ライムジュース). Search folds the dot away, so it only matters for looks.

## Build step 4 (notes proposal and UI strings)

- [x] Japanese typography in the notes run → `localeTypography("ja")` already returns `normalizeJapaneseTypography` (wired in step 1) → AC-1, AC-16
- [x] `pnpm --filter @bartendingapp/shared propose-recipe-notes --locale ja` → 473 proposals in `scripts/tagging/recipe-notes-proposals.ja.json` (gitignored) → AC-16 (2026-11-12: 1,419 note lines, 0 non NFC, every line ends in 。 or another Japanese closer, 0 half width katakana, 0 full width digits, 0 ASCII punctuation after Japanese, 0 spaces between Japanese words. For step 5 review: 28 style notes end on a noun (体言止め, such as Brigadier and Bumble Bee) rather than です・ます, and Gin Rickey's bartender tip drops the lemon its source names)
- [ ] Admin recipe form on one recipe → a Japanese notes section appears; saving it changes only that recipe's `ja` row → AC-17
- [x] Web `messages/ja.json` and mobile `locales/ja.json` drafted in full: polite Japanese, `other` only plurals → AC-1, AC-12 (commit 87495d7)
