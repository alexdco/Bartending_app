# Verify: Korean locale · spec 0051 · updated 2026-11-13
_Steps derived from spec 0051 acceptance criteria. `/check verify` runs these; `/test` locks the durable ones._

## Step 1: thin thread (unlaunched)

### Commands
- [x] `pnpm test` → all pass (961 on 2026-11-12), including `koreanTypography.test.ts`, the Korean hand copies, the `ko` strings scans (web and mobile), plural forms, the Korean i18next plurals, `font-stylesheet`, and `display-font` → AC-6, AC-10, AC-12, AC-17, AC-22
- [x] `pnpm typecheck` and `pnpm lint` → pass (2026-11-12; lint shows only the two existing mobile `import/no-named-as-default-member` warnings)
- [x] `node apps/web/scripts/fetch-script-fonts.mjs` → writes `/fonts/ko/fonts.css` and 248 font files, `/fonts/ja/` reported current → AC-10 (2026-11-12)
- [x] `pnpm --filter web run build` → prebuild fetch runs, `next build` passes, postbuild prints "Script font check passed" → AC-10 (2026-11-13: "Script font check passed (1 built CSS files)")
- [x] Add a stray `Noto_Sans_KR({ variable: "--x" })` call to `apps/web/src/app/[locale]/layout.tsx` and build → postbuild fails with "Noto CJK @font-face rules in shared CSS" naming the CSS file; revert → AC-10 (2026-11-13: failed naming `.next\static\chunks\3einbe6wlpd1i.css`; layout restored byte for byte from a copy, and a clean build passes again)

### Database (SQL editor)
- [ ] Before applying `20261112120000_korean_locale.sql`, snapshot `search_recipes` on `/ja` and `/en` with three queries each → AC-5 (2026-11-13: not possible, the `ko` row was already live when the snapshot ran. An after snapshot was taken instead as the baseline for later steps: `search_recipes` (limit 50) and `search_ingredients` (limit 50, staples included) on `en` gin, lime, margarita and `ja` ジン, トニック, マルガリータ. Recipes: en 50 `1fe8ee21`, 50 `7fabd19f`, 3 `37effc3e`; ja 50 `8718098c`, 7 `cedc7e5f`, 3 `e775905d`. Ingredients: en 3 `ac441483`, 8 `c2aca380`, 0; ja 7 `00e6cbf5`, 1 `5930d855`, 0. Hashes are md5 prefixes of `id:name` joined with `|` in result order. Results read as expected, for example ジン・トニック for トニック and Margarita, House Margarita, Whitecap Margarita for margarita. Since no SQL function changed, the row insert can't change these results.)
- [x] Apply it, then `select code, text_search_config from public.supported_locales where code = 'ko'` → one row, `simple` → AC-4, AC-6 (applied before 2026-11-13; one row, `simple`)
- [x] `select to_tsvector('simple', '진 토닉')` → `'진':1 '토닉':2` → AC-3 (2026-11-13, through the `ko` row's config)
- [x] Rerun the `/ja` and `/en` snapshot → same rows and order → AC-5 (2026-11-13, after the step 2 backfill: all twelve counts and hashes match the baseline above)
- [x] The 0045 structure query with its pattern widened to `'(es|pt|fr|ru|hi|ja|ko|spanish|portuguese|french_unaccent|russian|hindi|simple)'` (quoted literals only) → no match in any function body → AC-4 (2026-11-13: no match)
- [ ] Set a test user's `user_preferences.locale` to `'ko'` → accepted; detection ignores it and leaves it in place → AC-18

### Edge function
- [x] Deploy `generate-drink-idea`; a `locale: "ko"` request returns 해요체 Korean, no Hanja, no middle dot in the drink or ingredient names, and passes pantry verification → AC-17 (deployed as version 17 on 2026-11-13 with the Supabase CLI from disk, `verify_jwt` still true. Two live requests as the test account, 4 item pantry: both 200, so every `source_name` passed the pantry check. 라임 보드카 스매시 and 라임 보드카 스파클; 해요체 steps (담아요, 넣어요, 흔들어요); 라임, 심플 시럽, 셰이커, 얼음 as pinned; amounts `45ml` and `1.5온스`; no Hanja, no middle dot in names, no full width or Japanese punctuation, all NFC. For the AI second pass: run 1 strains a shaken drink into a cocktail glass over ice; run 2 is called 스파클 with nothing sparkling and stirs with 막대 (a stick) rather than 바 스푼, since the edge sentence pins no bar tools)

### Catalog
- [x] `translate-catalog --locale ko --limit 1` → one `ko` recipe row, NFC, no Hanja, no middle dot next to Hangul in any name field → AC-14, AC-22 (2026-11-13: Jamaica Kiss → 자메이카 키스, glass 허리케인 글라스, instructions in 해요체, three measures (자메이카산 1샷, 1샷, 조각), plus one ingredient (Coffee Liquer → 커피 리큐르) and one tag (Sweetened Iced Tea → 달콤한 아이스 티). Every row: no Hanja, no middle dot next to Hangul, no full width or Japanese punctuation, NFC. Write the SQL checks with code point escapes (`'[㐀-䶿一-鿿豈-﫿]'`): the same ranges written as literal characters flagged every Hangul row as Hanja through the MCP SQL tool. For the AI second pass: the instructions say 한 잔 for "a shot" (the measures say 샷), and 조각 alone for "cubes".)
- [x] `/ko/recipes/<slug>-<uuid>` for that recipe uses the English name slug, returns 200 with no 308, and shows the Korean name → AC-9 (2026-11-13: `buildRecipeSlugPath` gives `jamaica-kiss-4235ac1d-3173-4159-a24a-40f824453d58`; on a local production build that URL returns 200 with no redirect, `<html lang="ko">`, and shows 자메이카 키스)
- [x] Searching its Korean name on `/ko` with and without the spaces finds it → AC-3 (2026-11-13, `search_recipes(..., 'ko')`: 자메이카 키스, 자메이카키스, 키스, and Jamaica Kiss each return 자메이카 키스 only)

### UI / manual
- [ ] `/ko` HTML links `/fonts/ko/fonts.css`; `/en` and `/ja` HTML have no `/fonts/ko` reference, and their network panels show no Noto KR file → AC-10 (2026-11-13 on a local production build, HTML level: `/ko` links `/fonts/ko/fonts.css` and not the `/ja` one; `/en`, `/ja`, `/ru` have no `/fonts/ko` or Noto KR reference, and `/ja` still links `/fonts/ja/fonts.css`; `/fonts/ko/fonts.css` serves 248 faces with no Google URL. A browser network panel pass is still to do)
- [ ] On `/ko`, the network panel shows Noto Sans KR and Noto Serif KR slices and no Google request; headings render in Noto Serif KR; the rendered fonts panel lists no system fallback on the recipe page, pantry, and account page → AC-10
- [ ] On `/ko` at 360 px and 1280 px, no Korean word splits across lines; recipe cards, chips, buttons, and pantry rows show no horizontal overflow at 360 px; a long URL still wraps → AC-11
- [ ] In every other locale, the switcher's 한국어 option (dev only while unlaunched) carries `lang="ko"` → AC-10
- [x] `/ko/opengraph-image` is byte identical to `/en/opengraph-image` → AC-19 (2026-11-13: `/ko/opengraph-image/card` and `/en/opengraph-image/card` are byte identical, 40,965 bytes)
- [x] `Accept-Language: ko-KR` lands on `/en`; no 한국어 in the menu; no `ko` in the sitemap or alternates; `/ko/` is `noindex` with a self canonical → AC-7 (2026-11-13 on a local production build: `Accept-Language: ko-KR` on `/` → 307 to `/en`; `/en`, `/ja`, `/ru` have no 한국어 and no `ko` hreflang; the sitemap has no `/ko/`; the `/ko` recipe page is `noindex` with a self canonical and no alternates)
- [ ] Mobile dev build lists 한국어; production build does not → AC-7
- [ ] English set iPhone and English set Android phone, app in `ko`: no clipped lines on the recipe screen, pantry, and account screen; rating counts 1 and 2 show the `_other` string; on iOS, instructions wrap between words. Android may break inside a word, which is accepted; note what you see → AC-11, AC-12, AC-21

### Acceptance criteria coverage (step 1)
- AC-3 (thin thread part), AC-4, AC-5, AC-6, AC-7, AC-9, AC-10, AC-11, AC-12, AC-14 (one recipe), AC-17, AC-18, AC-19, AC-21, AC-22 are covered above. AC-1, AC-2, AC-13 to AC-16, AC-20, AC-23, AC-24 belong to steps 2 to 6.

## Step 2: terms pass, then catalog backfill

- [x] `pnpm --filter @bartendingapp/shared translate-catalog --locale ko` → every live recipe, ingredient, and tag has a `ko` row → AC-2, AC-14 (2026-11-13: 475 recipe rows, 398 ingredients, 395 tags, 1,829 measure rows, the same as `ja`, with no id that has a `ja` row missing its `ko` row)
- [x] Run it again → translates nothing → AC-14 (2026-11-13, after the `--ids` rerun below: 0 ingredients, 0 tags, 0 recipes)
- [x] Redeploy `generate-drink-idea` with the post-backfill terms (2026-11-13, by you, Supabase CLI from disk)
- [x] `translate-catalog --locale ko --ids <75 ids>` (Lemon-Lime Soda, its five recipes, and the 69 합니다체 recipes) → 1 ingredient and 74 recipes retranslated, 0 skipped (2026-11-13). Rechecked over the whole `ko` catalog afterwards: 0 합니다체, Lemon-Lime Soda is 레몬 라임 소다, 0 lime or lemon misses (lemonade excluded), and still 0 Hanja, 0 middle dots next to Hangul, 0 Japanese or full width punctuation, 0 non NFC, 0 spaces before punctuation, 0 `name_search` mismatches; 475 recipe and 1,829 measure rows
- [x] Hanja, middle dot, punctuation, NFC, and `name_search` checks → AC-14, AC-22 (2026-11-13, with code point escapes, confirmed to match a known Han character and a known 진·토닉 first: 0 Hanja in any of the four tables, 0 middle dots next to Hangul in any name or glass, 0 Japanese or full width punctuation, 0 non NFC rows, 0 spaces before punctuation, 0 `name_search` mismatches. Five names keep their Latin form, which is right: AT&T, B-52, B-53, Damned if you do, H.D.)
- [x] Lime and lemon: every lime recipe's `ko` text has 라임 and every lemon recipe's has 레몬 → AC-14 (2026-11-13: 82 lime and 132 lemon recipes. Every lemon miss is lemonade (레모네이드), which is right. One real error: Lemon-Lime Soda (`bb600caf-7f4e-4472-9222-cc52c3845540`) came out as 레모네이드, which also explains the four lime misses. Fixed by pinning «레몬 라임 소다» in both copies of the terms and rerunning that ingredient and its five recipes)
- [x] Register (found by the AI pass, AC-1): 69 of 475 recipe instructions use 합니다체 (붓습니다, 레이어합니다), 48 throughout and 21 mixed with 해요체. Haiku drifted even though the terms say 해요체, so both copies now say "ending every sentence in -요 (넣어요, 부어요) and never in 합니다체 (넣습니다, 붓습니다)", and the 69 ids are rerun. Check after the rerun: `select count(*) from recipe_translations where locale = 'ko' and instructions ~ '(습니다|합니다|십시오)'` → 0
- [x] `translate-catalog` gains `--ids <uuid,...>`: it retranslates only those recipe, ingredient, or tag ids, even when the hash says they are current, which is the AC-14 remedy (`selectsRow` in `catalogTranslation.ts`, with tests)
- [x] Live `ko` searches → AC-3 (2026-11-13, `search_recipes(..., 'ko')`: 진토닉 and 진 토닉 each find 진토닉 only; 토닉 finds 7, 보드카 토닉 and 진토닉 first; 올드패션드 and 패션드 find 올드 패션드 and 럼 올드 패션드; Margarita finds the same three recipes as `en`; ㅈ and 진ㅌ return 0 rows with no error. `search_ingredients`: 라 lists 라거, 라벤더, 라이 위스키 and so on, prefix matches first; 얼음 returns 0 rows with staples hidden and 1 with `include_staples`)
- For the step 4 sample: 모스코우 뮬 (Moscow Mule; Korean menus usually write 모스코 뮬), and 브랜디 스니터 글라스 in Kentucky B And B (snifter is usually 스니프터).

## Step 3: notes proposal and UI strings

- [x] Korean typography in the notes run → `localeTypography("ko")` already returns `normalizeKoreanTypography` (wired in step 1) → AC-1
- [x] `pnpm --filter @bartendingapp/shared propose-recipe-notes --locale ko` → 473 proposals in `scripts/tagging/recipe-notes-proposals.ko.json` (gitignored) → AC-15 (2026-11-13: 1,419 note lines, every source field has a Korean line, all end in -요, 0 합니다체, 0 Hanja, 0 Japanese or full width punctuation, 0 non NFC, 0 spaces before punctuation, 0 straight quotes, none over 240 characters)
- [x] Fixed in the proposals file before the apply (2026-11-13, Claude Opus 5.5): three lemon and lime swaps (The Laverstoke's bartender tip said 레몬 for lime, Dry Martini's presentation tip said 라임 for lemon, Caipirinha's said 레몬 휠 for a lime wheel); Bible Belt's style note added a lime its source doesn't name; Oatmeal Cookie's presentation tip left "jar" in English (now 메이슨 자); one 코업 글라스 is now 쿠프 글라스. For step 4: 29 notes call a coupe 칵테일 글라스, which is not wrong but is less specific than 쿠프 글라스, and some phrasing is literal (타르트한 신맛 for "tart")
- [ ] Admin recipe form on one recipe → a Korean notes section appears; saving it changes only that recipe's `ko` row → AC-16 (needs the test admin's session; the form builds its sections from `NON_DEFAULT_LOCALES`, which holds `ko`; 2026-11-13: run by you before the apply, but the apply then rewrote Jamaica Kiss's `ko` row in the same batch as every other note, so the database can't show the admin save on its own. It still needs a confirmed save, or a click through in /check verify)
- [x] Web `messages/ko.json` and mobile `locales/ko.json` drafted in full: 해요체, short noun labels, `other` only plurals → AC-1, AC-12 (commit fad5564, 2026-11-13: every English key present, placeholders and rich text tags match the English, 0 합니다체; the only strings left as in English are `home.siteName` (Cocktailist), `batch.percent` (`{value}%`), and `service.emailPlaceholder`; the `ko` strings scans pass)

## Step 4: notes apply

- [x] `generate-drink-idea` redeployed with the review pins → version 20 (2026-11-13, by you)
- [x] `pnpm --filter @bartendingapp/shared apply-recipe-notes --locale ko` → only `ko` rows change → AC-15 (2026-11-13, by you: 473 `ko` rows hold notes, all NFC, 0 Hanja, 0 합니다체, 0 of the pinned spelling variants. No non `ko` `recipe_translations` row is newer than 2026-11-12, and an md5 over `recipes` notes matches the one taken before the apply (`9309bb3f`). Early Riser is the one recipe with English notes and no `ko` notes; no locale has notes for it, the same as Japanese)
- [ ] 360 px check on web and both phones again → AC-11, AC-21
- [ ] Two more live drink ideas after the limit resets (00:00 UTC), confirming the version 20 pins (붓다, 글라스, 셰이크, 온스)

## Step 5: launch

- [x] One commit adds `"ko"` to `LAUNCHED_LOCALES` and `CATALOG_TRANSLATION_LOCALES`, with `ko` in the `hreflangAlternates` launched map and a "launched Korean" describe block (`ko` and `ko-KR` detection, `en-KR` stays English, a stored `ko` kept) → AC-8, AC-23 (fbe627d, 2026-11-13; `pnpm test` 979 pass. The `notesByLocale` fixture already had its `ko` block from step 1. Made while three step 3 and 4 checks were still open: the AC-16 admin save, the 360 px and phone check, and two drink ideas after the limit reset; they gate the merge, not this commit)
- [ ] Ship a mobile build with the launch → AC-23
- [ ] Production: `Accept-Language: ko-KR` lands on `/ko`; the menu shows 한국어; the sitemap and every hreflang alternate list `ko`; `/ko` pages drop `noindex` → AC-8, AC-23
- [ ] Feature 60 store listings in Korean → AC-24 (does not hold up the web launch)

## Recorded during the build

- Face counts (build step 1, AC-10): on 2026-11-12, Google returned 124 `@font-face` rules for `Noto+Sans+KR:wght@100..900` and 124 for `Noto+Serif+KR:wght@600` (Noto Sans JP and Noto Serif JP: 124 each). Both are above the default `MIN_FACES_PER_FAMILY` of 100, so the `ko` entry in `script-fonts.config.mjs` sets no `minFacesPerFamily`. The first `fetch-script-fonts.mjs` run wrote `/fonts/ko/fonts.css` and 248 font files, and reported `/fonts/ja/` as current.

## Korean AI review

This replaces the native review (AC-20). Run it in a Claude Code session on Opus, a stronger model than the Haiku model that drafted the text. Read each item against the checklist below, then fix it or record it as accepted with a reason.

### Checklist

- [x] **Register**: 해요체 throughout (저장했어요, 검색해 보세요). No 합니다체 (저장했습니다) and no 반말 (저장했어).
- [x] **Labels and buttons**: short nouns (저장, 검색, 로그인), not sentences.
- [x] **No Hanja**: no Chinese characters anywhere.
- [x] **Pinned terms used exactly**: lime 라임, lemon 레몬 (never mixed up), shaker 셰이커, jigger 지거, muddler 머들러, strainer 스트레이너, bar spoon 바 스푼, simple syrup 심플 시럽, bitters 비터스, ice 얼음, 록 글라스, 칵테일 글라스, 콜린스 글라스, 하이볼 글라스; units `ml`, `cl`, `L`, 온스.
- [x] **Drink names**: in Hangul as Korean bars and menus write them (마가리타, 모히토, 진토닉, 올드 패션드); the established name first, else the standard loanword spelling. No middle dot between words.
- [x] **Placeholders**: `{name}`, `{count}`, `{{count}}`, `{time}` intact, and the sentence still reads naturally with a value inserted. A particle after a placeholder is written `{name}이(가)` style, or the sentence is reworded to avoid it.
- [x] **Nothing left in English** except brand names (Cocktailist) and units.
- [x] **Legal text** (age gate, privacy) says exactly what the English says, no more and no less.
- [ ] **Notes**: each note matches the recipe's facts (spirit, method, glass, garnish).
- [x] **Typography**: half width digits, Western punctuation (. , ? !) with no space before it, “ ” for quotes, no `。` `、` `「」`.

### Inputs, in order

- [x] Before the backfill (build step 2): `LOCALE_AI_TERMS.ko` in `packages/shared/src/locale.ts` and the `KOREAN_INSTRUCTION` sentence in `supabase/functions/generate-drink-idea/index.ts`. Fixes land in both in one commit. (2026-11-13, Claude Opus 5.5 in Claude Code. Register, no Hanja, citrus, names, middle dot, digits, punctuation, quotes, and NFC pass as drafted. Three fixes, made together: (1) the edge sentence pinned no bar tools, and a live idea stirred with 막대 instead of 바 스푼, so it now pins 셰이커, 스트레이너, 머들러, 지거, 바 스푼 and Hangul glass names, phrased as step wording like the Hindi tool sentence so no tool becomes an ingredient; ice and simple syrup stay out of the edge copy for the same reason. (2) The edge sentence now says to keep lemon and lime distinct, as the shared terms do. (3) The Jamaica Kiss row said 샷 in the measures and 한 잔 in the steps, so the shared terms now pin shot 샷, dash 대시, teaspoon 티스푼, tablespoon 테이블스푼, with the same word in measures and steps. The hand copies test now pins the tools and the lemon and lime sentence in both copies. Accepted, not a terms issue: run 1's "strain a shaken drink over ice into a cocktail glass" is drink logic, left for the 10 live ideas in step 4.)
- [x] Build step 4: the full `apps/web/messages/ko.json` and `apps/mobile/src/i18n/locales/ko.json`. (2026-11-13: read in full against the checklist; no changes. Note that the same model drafted them in step 3, so this pass is a self review, not a second model)
- [x] The placeholder message list from spec 0047 AC-12 (`apps/web/src/i18n/placeholderMessages.ts`). (2026-11-13: every listed message reads naturally with a value inserted; particles after a value are ones that do not change with it (에서, 이후에), written 와(과) and (으)로 style, or reworded as label plus value)
- [x] The unit, batch, and drink idea limit copy (`units.ts`, `batch.ts`, `drinkIdeaLimitMessage.ts`, and the batch strings in both `ko.json` files).
- [x] A 30 recipe sample of the catalog backfill (name, instructions, glass, measures, ingredient and tag names). (2026-11-13, ordered by `md5(id || 'ko-sample')`. Findings, each then counted across the whole catalog: 붓아요 (a second misconjugation of 붓다) in 5 recipes, Gin Squirt as 진 스커트, Half-and-Half as 헤비 크림, and uneven spellings: 베르무스 next to 베르무트, 데킬라 next to 테킬라, 아마레또 next to 아마레토, 샹파뉴 next to 샴페인 in the steps, 메이슨 항아리 for mason jar. Pinned in both copies of the terms and rerun with `--ids` (5 ingredients and 27 recipes, then the 6 rows that kept the old form, rerun once more). After: 0 of each variant across the four tables, Half-and-Half is 하프 앤 하프, Gin Squirt is 진 스쿼트, and Hanja, middle dot, NFC, and `name_search` still 0. Accepted: 잔 for an unnamed "glass" in steps, Corpse Reviver as 코퍼스 리바이버)
- [ ] 10 live drink ideas from `generate-drink-idea` with `locale: "ko"`. (2026-11-13, as the test account, pantry Simple Syrup, Vodka, Lime Vodka, Lime Juice: 8 ideas, all 200 and past the pantry check, before the daily limit (10 for a signed in user, 2 used earlier today). 해요체 throughout, no Hanja, no middle dot, 라임 and the pinned tools used. Findings: 붓어요 in 4 of 8, 칵테일 글래스 in 3 (one garbled as 코쿨테일 글래스), 셔이크 once, and oz in 4 of 8 against the pinned 온스. Pinned in both copies; the edge function needs a redeploy, then 2 more ideas after the limit resets at 00:00 UTC to confirm. Accepted: run 5 is called 스파클 with nothing sparkling, which is drink logic)
- [x] Every note in `recipe-notes-proposals.ko.json`, before `apply-recipe-notes --locale ko` runs. (2026-11-13: all 1,419 lines through the automated checks in step 3, the lemon and lime comparison against each source, and the spelling variants above: 48 swaps to 베르무트, 테킬라, 아마레토, 샴페인, 서던, and 메이슨 자. The four 헤비 크림 notes match sources that say heavy cream. Not every note was read for facts one by one)

### How fixes land

- UI strings: edit the `ko.json` files.
- Terms: edit `LOCALE_AI_TERMS.ko` and the edge function sentence together, in one commit.
- Notes: edit `recipe-notes-proposals.ko.json` before the apply.
- Catalog rows: rerun `translate-catalog --locale ko` on the affected ids (with `--force` if hash gating would skip them). Never edit the database by hand.
- Drink ideas: a finding (for example Hanja) is fixed in the edge function instruction and redeployed.

### Sign off

- Model: Claude Opus 5.5, in Claude Code
- Date: 2026-11-13
- Findings and outcome: the findings above are fixed, except that two drink ideas are still owed after the redeploy and the limit reset. Open: the Notes item (facts checked by lemon and lime and by spelling, not note by note), and the 360 px and phone checks.
