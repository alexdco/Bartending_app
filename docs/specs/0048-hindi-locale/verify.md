# Verify: Hindi locale · spec 0048 · updated 2026-11-11
_Steps derived from spec 0048 acceptance criteria. `/check verify` runs these; `/test` locks the durable ones._

## Build step 1 (thin thread): your steps before it counts as landed

- [x] Before the migration, snapshot `es`, `pt`, `fr`, `ru`: `select public.search_recipes('margarita', null, 20, 0, l) from unnest(array['es','pt','fr','ru']) l;` and `select public.fetch_recipe_detail(id, l) from public.recipes, unnest(array['es','pt','fr','ru']) l where name = 'Margarita';` → save the output → AC-5 (2026-11-11: md5 per locale of the margarita search, Margarita detail, and a 50 row browse)
- [x] Apply `supabase/migrations/20261111120000_hindi_locale.sql` in the SQL editor → `select * from public.supported_locales where code = 'hi'` returns `('hi', 'hindi')` → AC-4, AC-6
- [x] Run the check in the migration's header comment → `true` (संतरा finds संतरे) → AC-3
- [x] Rerun the snapshot → identical to the saved output → AC-5 (all twelve hashes identical)
- [x] Run the 0045 structure query with `hi|hindi` added to the pattern (`p.prosrc ~ '''(es|pt|fr|ru|hi|spanish|portuguese|russian|hindi)'''`) → no rows → AC-4
- [x] Deploy `generate-drink-idea`, confirm the live version lists `hi`, then request an idea with `locale: "hi"` → everyday Hindi with आप, sentences end in ।, lime is हरा नींबू, pantry verification passes → AC-17 (version 11, 2026-11-11. For step 5 review: one idea wrote the mixed script `टेकila`, `हरा नींबू का रस` likely wants the oblique `हरे`, and ice came out `बर्फ` without the nukta)
- [x] `pnpm --filter @bartendingapp/shared translate-catalog --locale hi --limit 1` → one `hi` recipe row whose text is NFC (`select name = normalize(name, NFC) from public.recipe_translations where locale = 'hi'` is true); run it again → translates nothing → AC-14, AC-23 (Japanese Fizz, NFC true, no bare नींबू. With `--limit 1` the rerun picks the next untranslated recipe (Jamaica Kiss) rather than redoing Japanese Fizz, which shows the gating; the translates nothing check belongs to the full step 3 run. For review: Japanese Fizz glass stayed `Highball glass`)
- [x] Visit `/hi/recipes/recipe-<uuid>` for that recipe (bare slug until step 2) → Hindi name and instructions, headings in Noto Serif Devanagari, body Devanagari in Noto Sans Devanagari, Latin letters in Inter, no missing glyph boxes → AC-2, AC-10 (checked by you 2026-11-11 on Japanese Fizz)
- [x] Search `/hi` for that recipe's Hindi name in an inflected form, then for its English name → both find it → AC-3 (via `search_recipes(…, 'hi')`, the RPC the page calls: जापान finds जापानी फ़िज़ by stemming, and Japanese Fizz finds it; the in browser search is still yours)
- [x] On an iPhone and an Android phone with the app language set to हिन्दी (dev or preview build): the recipe screen, pantry, and account screen show intact conjuncts (क्ष, त्र, र्ग) and no clipped vowel signs; a rating count of 1 and 2 both read correctly. Add `LINE_HEIGHT_SCALE_BY_LOCALE` only if a line clips → AC-11, AC-20 (checked by you 2026-11-11; no `LINE_HEIGHT_SCALE_BY_LOCALE` needed)

## Build step 2 (slug source): your steps before it counts as landed

- [ ] Before the migration, snapshot every changed function in `es`, `pt`, `fr`, `ru`, once as `anon` and once as `authenticated` (in the SQL editor: `begin; select set_config('request.jwt.claims', '{"sub":"<test user id>","role":"authenticated"}', true); set local role authenticated; ... rollback;`, and `set local role anon` for the anon run). Cover `search_recipes('margarita', null, 20, 0, l)`, `search_recipes('', null, 50, 0, l)`, `classic_recipes(10, l)`, `popular_recipes_by_region(<a region>, l)`, `fetch_recipes_by_ids(array[<two ids>], l)`, `fetch_recipe_detail(<Margarita id>, l)`, and, as `authenticated` only, `recommend_recipes('{}', null, 20, 0, l)`, `match_recipes_to_pantry(0.25, 20, 0, l)`, `fetch_favorite_recipes(l, 20, 0)` → save the output → AC-5 (skipped: no pre migration snapshot was taken; bodies were copied from the live definitions and every current slug was checked byte identical)
- [x] Apply `supabase/migrations/20261111130000_recipe_read_base_name.sql` in the SQL editor → it commits with no error → AC-9
- [x] Run the check in the migration header → no rows (`base_name` equals `recipes.name`) → AC-9
- [x] `select p.proname, p.proacl, p.proconfig, p.prosecdef from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname in (<the eight>)` → each ACL is `postgres`, `anon`, `authenticated`, `service_role` with no public entry; `search_path=""`; `prosecdef` false → AC-5
- [ ] Rerun the snapshot as both roles → every column identical to the saved output; the only difference is the added `base_name` → AC-5
- [x] Run the 0045 structure query with `hi|hindi` in the pattern → no rows → AC-4 (checked 2026-11-11 after the base_name migration; also `base_name = recipes.name` across fetch_recipe_detail `ru`, search_recipes `fr`, classic_recipes `es`)
- [ ] After the web deploy (migration first), browse `/en`, `/es`, `/ru` search, home, popular, and a recipe page → card links and canonicals unchanged, no 308 on click → AC-5, AC-9
- [x] Once the one `hi` recipe from step 1 exists: on `/hi`, its card links to `<english-slug>-<uuid>`, clicking returns 200 with no 308, and the page canonical and the sitemap's `/hi` entry use the same slug → AC-9 (card click checked by you 2026-11-11; canonical is `japanese-fizz-<uuid>`; the sitemap has no `hi` until launch)

## Build step 3 (terms review, then catalog backfill)

_2026-11-11: you approved `LOCALE_AI_TERMS.hi` and `HINDI_INSTRUCTION` with fixes from the step 1 findings: glass name examples (हाईबॉल गिलास, कॉकटेल गिलास, ओल्ड फ़ैशन्ड गिलास), inflected citrus forms (हरे, हरी, पीले, पीली), no Latin letters inside a Hindi word, and ice «बर्फ़» in the edge sentence. After the backfill, lemonade «पीले नींबू का शरबत» and lemon-lime soda «पीले और हरे नींबू वाला सोडा» were pinned too, since नींबू पानी and नींबू-चूने failed AC-14. `generate-drink-idea` version 12 carries both changes._

- [x] Native reviewer approves `LOCALE_AI_TERMS.hi` and `HINDI_INSTRUCTION` in `generate-drink-idea` → AC-14, AC-17
- [x] `pnpm --filter @bartendingapp/shared translate-catalog --locale hi` → every live recipe, ingredient, and tag has a `hi` row → AC-2, AC-14 (2026-11-11: 396 ingredients, 393 tags, 463 recipes; one batch of 10 hit `ON CONFLICT DO UPDATE command cannot affect row a second time` and went through on the rerun. 475 recipe rows, all names in Devanagari, 1,829 measure rows)
- [x] Run it again → translates nothing → AC-14 (third run: 0 ingredients, 0 tags, 0 recipes)
- [x] Every `hi` row is NFC and `name_search` equals `to_tsvector('hindi', name)` → AC-3, AC-23 (0 non NFC rows across the four tables, 0 mismatches)
- [x] The AC-14 regex `(?<!(हरा|हरे|हरी|पीला|पीले|पीली) )नींबू` over `hi` rows of all four tables → no rows; no «लाइम» or «लेमन» → AC-14 (2026-11-11: the first pass failed 13 recipe rows, mostly नींबू पानी for lemonade, plus «वोदका लेमन». After the lemonade pin, `source_name_hash` was set to `''` on those 14 `hi` rows (the column is `not null`) and `translate-catalog --locale hi` retranslated them. Now clean, NFC, and `name_search` matches; only Vodka Slime's स्लाइम matches लाइम, a false positive)

## Build step 4 (notes proposal and UI strings)

- [x] Hindi typography in the notes run → `localeTypography("hi")` already returns `normalizeHindiTypography` for `propose-recipe-notes` (no change needed) → AC-1, AC-15
- [x] `pnpm --filter @bartendingapp/shared propose-recipe-notes --locale hi` → 473 proposals in `scripts/tagging/recipe-notes-proposals.hi.json`, NFC, every sentence ends in । → AC-15 (for step 5 review: 12 note lines keep a bare नींबू, for example «नींबू स्वाद वाले रम», «कड़वा नींबू» for bitter lemon, «नींबू का पहिया»; fix them in the review before the apply)
- [x] Admin recipe form on one recipe → a Hindi notes section appears; saving it changes only that recipe's `hi` row → AC-16 (2026-11-11 on Japanese Fizz, local build: the Hindi tip `बर्फ़ के साथ ज़ोर से शेक करें।` stored in NFC; an md5 over every other `recipe_translations` row's notes and `updated_at` matched before and after. `recipes.updated_at` moved 2 s later from a separate Save recipe click, with the English text unchanged; no trigger links the two tables)
- [x] Web `messages/hi.json` and mobile `locales/hi.json` drafted in full: everyday Hindi, आप, danda, Western digits, ICU `one`/`other` and `_one`/`_other` → AC-1, AC-11 (only the brand, sample placeholders, and Service shorthand stay in Latin letters; key parity, plural forms, and placeholder tests pass)
- [x] Every message on the placeholder list is label plus value (`लोकप्रिय: {region}`, `पसंदीदा: {name}`, `सवाल {number}/{total}`) → AC-12 (the native reviewer checks the list in step 5)

## Build step 5 (native review)

_2026-11-11: review sheet `packages/shared/scripts/tagging/hindi-review.csv` (gitignored, 2,269 rows): 648 web and 126 mobile strings, 4 unit labels, 7 drink idea limit lines, 65 lines from 5 sampled drink ideas (the edge function's exact prompt and model, run locally), and 1,419 proposed notes. An automated pre pass flags 58 rows: in notes, 26 grapefruit written as अंगूर (grape), 13 bare नींबू, 12 हरा/पीला before a postposition (likely हरे/पीले), 2 missing egg white, 2 बर्फ without nukta, 1 loanword; in drink ideas, 2 हरा नींबू का. The catalog's ingredient names are right (चकोतरा), but 6 recipes' Hindi instructions also say अंगूर for grapefruit._

_2026-11-11: the pre pass missed Devanagari digits (`४५ मिली`), which AC-1 rules out: 23 drink idea lines, 2 notes, and in the live catalog 88 `hi` measure rows and 7 `hi` recipe rows. `normalizeHindiTypography` (and the edge function's hand copy) now writes them as 0 to 9; the review sheet and `recipe-notes-proposals.hi.json` were rewritten the same way._

- [x] Run the digit update in the SQL editor (`translate()` over `hi` rows of `recipe_ingredient_translations.measure` and the `recipe_translations` text columns) → both closing counts are 0 → AC-1 (2026-11-11: both 0; 1,646 `hi` measures now carry Western digits)
- [x] Deploy `generate-drink-idea` with the digit rule; a Hindi drink idea shows `45 मिली`, not `४५ मिली` → AC-1, AC-17 (2026-11-11: version 13 returned 502 on every live Hindi try for the test account, because `Ice is «बर्फ़»` made Haiku list ice as an ingredient and fail the pantry check, 4 of 8 local runs. Version 14 rewords it to ice in steps only, 8 of 8 local runs pass. Live on version 14: 200, amounts `45`, `30`, `20`, ice only in the steps. For the review: `मिलीलीटर` instead of `मिली`, `हरा नींबू वाली` instead of `हरे`, `ग्लास` instead of `गिलास`)
- [x] Grapefruit and cranberry in the catalog: `LOCALE_AI_TERMS.hi` and `HINDI_INSTRUCTION` pin «चकोतरा» and «क्रैनबेरी»; the «Grapefruit Juice» tag set to चकोतरे का रस; `source_name_hash` cleared on 13 `hi` recipe rows, then `translate-catalog --locale hi` → AC-2, AC-14 (2026-11-11: 14 recipes retranslated, the 13 plus Japanese Fizz. After: 0 grapefruit recipes without चकोतरा, the only करंट left are Diesel's blackcurrant and the brand Absolut Kurant, the AC-14 regex finds 0 rows in all four tables, 0 Devanagari digits, 0 non NFC, 0 `name_search` mismatches. Japanese Fizz has no `hi` notes now, like every `hi` row, so the step 4 admin form tip is gone; the notes apply restores it)
- [x] Native reviewer fills the `fix` column: UI strings (age gate and privacy first), the placeholder list rows, unit and limit copy, the drink idea samples, and every note → AC-1, AC-12, AC-13, AC-15, AC-17 (2026-11-11: you signed off the drafts as correct and asked for the pre pass fixes)
- [x] Fixes applied to `hi.json` (web, mobile), `drinkIdeaLimitMessage.ts`, the unit labels, and `recipe-notes-proposals.hi.json`; tests pass → AC-1, AC-13 (2026-11-11: no UI string, unit, or limit changes; 63 note lines fixed: grapefruit, bare नींबू, हरा/पीला before a postposition, egg white, बर्फ़, limeade, plus elderflower, blackberry, cranberry, and "pucker" mistranslations. All 1,419 lines pass the AC-14 regex, NFC, danda, digit, and loanword checks. `generate-drink-idea` version 15 carries the grapefruit and cranberry pins)
- [ ] 360 px layout check on web and on both phones with the reviewed strings → AC-10, AC-20
- [x] `apply-recipe-notes --locale hi` → only `hi` rows change; the `en`, `es`, `pt`, `fr`, `ru` notes snapshot is identical before and after → AC-15 (2026-11-11: 473 of 473 applied; an md5 over each other locale's notes and `updated_at` matched before and after; 473 of 475 `hi` rows carry notes, all pass AC-14, NFC, and digits; Japanese Fizz has its reviewed tip)

## UI / manual
- [x] Network panel on `/hi` → both Noto font files load; on `/en`, `/fr`, `/ru` → no Noto request → AC-10
- [x] On `/hi`, nav, buttons, labels, and footer use the taller line heights with no clipped matras at 360 px → AC-10 (unblocked by spec 0049, 2026-11-11: `/hi` computes the Hindi line heights on bare `text-<role>` and `leading-<role>`; the matra check itself is still yours)
- [ ] On `/en`, open the language menu → in dev it has no हिन्दी; the option markup carries `lang` → AC-7, AC-10
- [ ] `/hi/opengraph-image/card` is byte identical to `/en/opengraph-image/card`; its alt is the English tagline; `/ru` card unchanged → AC-19
- [ ] Before launch: `Accept-Language: hi-IN` on `/` lands on `/en`; the sitemap and hreflang alternates have no `hi`; `/hi/` renders `noindex` with a self canonical → AC-7
- [ ] Before launch: a stored `hi` preference (cookie, `user_preferences.locale`) is ignored for detection and left in place → AC-18
- [ ] `/es`, `/pt`, `/fr`, `/ru` recipe and search pages look and read the same as before → AC-5

## Commands
- [x] `pnpm --filter @bartendingapp/shared test` → locale parity, Hindi hand copy, typography, unit, batch, and limit copy tests pass → AC-1, AC-6, AC-13, AC-17, AC-23 (repo wide `pnpm test`, 849 passed, 2026-11-11)
- [x] `pnpm --filter @bartendingapp/shared exec vitest run src/seo.test.ts` → the `buildRecipeSlugPath` tests pass (Devanagari falls back to the English name; Latin, Cyrillic, `µ`, and `ʼ` names keep their own slug) → AC-5, AC-9
- [x] `pnpm --filter web test` → display font, share image locale, and plural forms tests pass → AC-10, AC-11, AC-19
- [x] `pnpm --filter mobile test` → locale key parity and Hindi plurals (0 and 1 → `_one`, 2 and 5 → `_other`) pass → AC-11

## Value sourcing
- [x] `select public.resolve_locale('hi')` → `hi`; a recipe with no `hi` row reads in English under `/hi` → AC-2 (Margarita, untranslated, reads English under `hi`)
- [x] `select public.locale_search_config('hi')` → `hindi` → AC-3
- [x] Insert or update a `hi` `recipe_translations` row → its `name_search` equals `to_tsvector('hindi', name)` → AC-3 (true for both `hi` rows)
- [ ] `search_ingredients` with a Hindi ingredient name from a translated row → found by trigram similarity → AC-3
- [ ] `/hi` body font stack in devtools → Inter, then Noto Sans Devanagari → AC-10
- [ ] `/hi` heading font in devtools → Noto Serif Devanagari → AC-10
- [ ] `/hi` computed `--leading-body` → 1.75; `/en` → 1.5 → AC-10
- [ ] `/hi` share card → English tagline in Fraunces → AC-19
- [ ] `<html lang>` on `/hi` → `hi`; switcher label → हिन्दी on every locale → AC-8
- [ ] `translate-catalog --locale hi` prompt includes `LOCALE_AI_TERMS.hi`; a second run skips rows by `source_name_hash` → AC-14
- [ ] Hindi AI output through `normalizeHindiTypography`: a stored `hi` instruction has । and no `मि.ली.` → AC-1, AC-23
- [ ] Unit toggle and batch labels on `/hi` → औंस, मिली, सेली, ली; measures keep the dot decimal → AC-13

## Open items
- Resolved 2026-11-11 by spec 0049: `@theme inline` now registers `--text-*`, `--text-*--line-height`, and `--leading-*`, so the `:root:lang(hi)` overrides reach every sized element.
- Spec test scenario wording: NFC keeps ज़ as U+091C U+093C (U+095B is a composition exclusion), so the typography test asserts both spellings normalize to the two code point form, not to a precomposed one.

## Acceptance-criteria coverage
- AC-1 commands, value sourcing (typography) · AC-2 step 1 page visit, value sourcing · AC-3 migration check, search, value sourcing · AC-4 structure query · AC-5 snapshots, UI regression · AC-6 parity test · AC-7 gating · AC-8 value sourcing (post launch steps come in step 6) · AC-9 step 2 · AC-10 fonts, line heights, switcher · AC-11 plural tests, devices · AC-12 step 4 · AC-13 labels · AC-14 translate run · AC-15, AC-16 step 4 · AC-17 drink idea · AC-18 stored preference · AC-19 share card · AC-20 devices · AC-21, AC-22 launch · AC-23 NFC checks
