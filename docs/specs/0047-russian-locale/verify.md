# Verify: Russian locale · spec 0047 · updated 2026-11-10
_Steps derived from spec 0047 acceptance criteria. `/check verify` runs these; `/test` locks the durable ones._

## Build step 1 (thin thread): your steps before it counts as landed

_2026-11-10: migration applied. The `en`, `es`, `pt`, `fr` snapshot (every recipe detail, 9 recipe searches, 6 ingredient searches) hashed `731160d4cba89e77f940e66df7ee4dba` before and after; ё and е matched both ways; no function names a locale._

- [x] Before the migration, snapshot `es`, `pt`, `fr`: `select public.search_recipes('margarita', null, 20, 0, l) from unnest(array['es','pt','fr']) l;` and `select public.fetch_recipe_detail(id, l) from public.recipes, unnest(array['es','pt','fr']) l where name = 'Margarita';` → save the output → AC-5
- [x] Apply `supabase/migrations/20261110120000_russian_locale.sql` in the SQL editor → `select * from public.supported_locales where code = 'ru'` returns `('ru', 'russian')` → AC-4, AC-6
- [x] Run the check in the migration's header comment → `true, true` (ё and е match both ways) → AC-3
- [x] Rerun the snapshot → identical to the saved output → AC-5
- [x] Run the 0045 structure query with `ru|russian` added to the pattern (`p.prosrc ~ '''(es|pt|fr|ru|spanish|portuguese|russian)'''`) → no rows → AC-4
- [ ] Deploy `generate-drink-idea`, then request an idea with `locale: "ru"` → Russian text, «вы», « » quotes, pantry verification passes → AC-17
  _Reopened 2026-11-11: the live function was still version 9, with no `ru` in its locale list, so a `ru` request fell back to English. Version 10 (with Russian and the lime term line) was deployed 2026-11-11; check again against it._
- [x] `pnpm --filter @bartendingapp/shared translate-catalog --locale ru --limit 1` → one `ru` recipe row; run it again → translates nothing → AC-14
  _2026-11-10: it picked Jamaica Kiss. Instructions, the ingredient («кофейный ликёр»), the tag, and the measures came back in Russian and `name_search` matches `to_tsvector('russian', name)`. Haiku kept the name «Jamaica Kiss» in Latin letters and left the glass as "Hurricane glass" (es, pt, fr translated it): check glass wording in the step 3 terms review._
- [x] Visit `/ru/recipes/<slug>` for a recipe whose `ru` name is in Cyrillic → the URL slug is transliterated Latin (never `recipe-<uuid>`), the name shows in Russian, headings render in Lora → AC-9, AC-10
  _2026-11-10: «Взлёт» (Blastoff) serves at `/ru/recipes/vzlet-a780bf50-…` with a self canonical and `noindex` (unlaunched); `recipe-<uuid>` redirects (308) to it. Lora was confirmed in the step 1 network check._
- [x] Search `/ru` for that recipe's Russian name typed with е in place of ё, then for its English name → both find it → AC-3
  _2026-11-10: `search_recipes` in `ru` finds «Взлёт» for «Взлет» and for "Blastoff"._
- [x] On a phone with a dev build, switch to Русский and open a recipe with 2 ratings → «2 оценки»; 5 → «5 оценок»; 21 → «21 оценка» → AC-11

## UI / manual

- [x] `/ru` in the network panel → Lora and Inter's Cyrillic file load; `/en` and `/fr` → no Lora request → AC-10
- [ ] `/ru/opengraph-image` → Russian tagline in Lora SemiBold, no missing glyph boxes; `/en/opengraph-image` unchanged → AC-10
- [ ] Before launch: `Accept-Language: ru-RU` on `/` → lands on `/en` → AC-7
- [ ] Before launch: web language menu and production mobile language card show no Русский; mobile dev and preview builds do → AC-7
- [ ] Before launch: sitemap and every hreflang alternate have no `ru`; `/ru/` has `noindex`, a self canonical, and no alternates → AC-7
- [ ] Before launch: set a stored `ru` preference (cookie, AsyncStorage, `user_preferences.locale`) → it is ignored for detection and left in place → AC-18
- [ ] Signed in, save `ru` as the preference → `user_preferences.locale = 'ru'` is accepted and syncs → AC-18
- [ ] `/ru` body copy hyphenates long words at 360 px; headings and buttons do not → AC-1

## Value sourcing

- [ ] Catalog read with `locale = 'ru'` for a recipe with no `ru` row → English text, never blank or another language → AC-2
- [ ] Russian recipe search config → `select public.locale_search_config('ru')` returns `russian` → AC-3
- [ ] Insert or update of a `ru` `recipe_translations` row → `name_search` equals `to_tsvector('russian', name)` → AC-3
- [ ] Russian ingredient search → a lowercase query matches a capitalized Russian ingredient name (trigram) → AC-3
- [ ] Recipe slug → the slug follows the page locale's name: `/ru` uses the transliterated Russian name, `/en` the English one → AC-9
- [ ] `/ru` heading font comes from `DISPLAY_FONT_BY_LOCALE.ru` (`lora`); every other locale stays on Fraunces → AC-10
- [ ] Required plural forms come from `Intl.PluralRules`: `ru` needs one, few, many, other → AC-11
- [ ] Mobile plural at runtime uses Hermes `Intl.PluralRules` (device check above) → AC-11
- [ ] Detection after launch: `ru-KZ` picks `ru`; `uk-UA`, `be-BY`, `kk-KZ` pick English → AC-8
- [ ] Hreflang, sitemap, and `<html lang>` use `LOCALE_HREFLANG.ru` (`ru`) → AC-8
- [ ] Switcher label is `Русский` whatever the active language → AC-8
- [ ] Catalog and notes prompts carry `LOCALE_AI_LANGUAGE.ru` and `LOCALE_AI_TERMS.ru` (lime «лайм», lemon «лимон») → AC-14, AC-15
- [ ] Russian AI output passes through `normalizeRussianTypography` (or the edge function copy): straight quotes become « », a spaced hyphen becomes ` — ` → AC-1, AC-17
- [ ] Retranslation uses the `ru` row's `source_name_hash` → a second run translates nothing → AC-14
- [ ] Units show `унц.`, `мл`, `сл`, `л` in `ru`, with a dot decimal → AC-13
- [ ] Launch adds `ru` to `LAUNCHED_LOCALES` and `CATALOG_TRANSLATION_LOCALES` in one commit → AC-19

## Commands

- [ ] `pnpm test` → all pass, including `seo.test.ts` (transliteration), `russianTypography.test.ts`, `locale.test.ts` (parity with `ru`), and `apps/mobile/src/i18n/plurals.test.ts` (1, 2, 5, 21) → AC-6, AC-9, AC-11, AC-17
- [ ] `pnpm -r typecheck` and `pnpm lint` → no errors → AC-6
- [ ] Slug regression: `select count(*) from (select name from public.recipes union all select name from public.recipe_translations) s where name ~ '[Ѐ-ӿ]'` → 0 before the `ru` backfill, so existing slugs are byte identical (checked 2026-11-10: 0 of 1,937 names) → AC-5

## Build step 2 (plural and placeholder tests)

- [ ] `pnpm test` → `packages/shared/src/pluralForms.test.ts` (en, es, pt, fr need one, other; ru needs one, few, many, other), `apps/web/src/i18n/pluralForms.test.ts`, `apps/mobile/src/i18n/pluralForms.test.ts`, and both `placeholderMessages.test.ts` pass → AC-11, AC-12
- [ ] Delete `ratings.summary_few` from mobile `ru.json` → the mobile forms test fails naming `ratings.summary_few`; restore it → AC-11
- [ ] Drop the `many` branch from web `ru.json` `ratings.summary` or `recipe.missingIngredients` → the web forms test fails naming the key; restore it → AC-11
- [ ] Remove the `one` branch from `recipe.missingIngredients` in `es.json` → the web forms test fails with `lacks one`; restore it (checked 2026-11-10) → AC-11
- [ ] Add a message with `{name}` to web or mobile `en.json` → the matching placeholder test fails until `placeholderMessages.ts` lists it → AC-12
- [ ] In `/ru`, a recipe with 2, 5, and 21 ratings shows «2 оценки», «5 оценок», «21 оценка», and the rating stars read «Поставить 2 звезды», «Поставить 5 звёзд» → AC-11
- [x] Native reviewer reads both `placeholderMessages.ts` lists and the six drafted web `ru` plural messages (step 5) → AC-11, AC-12

## Build step 3 (terms review, then catalog backfill)

_2026-11-10: the native reviewer approved `LOCALE_AI_TERMS.ru` and the edge function sentence as is. No glass name or cocktail name term was added, so Haiku may keep some glass and cocktail names in Latin letters._

_2026-11-10: backfill run twice. All 475 live recipes, every ingredient, and every tag have a `ru` row; 376 recipe names are in Cyrillic; every `ru` `name_search` equals `to_tsvector('russian', name)`; all 27 lime and lemon ingredients read «лайм» or «лимон» correctly._

- [x] Native reviewer approves `LOCALE_AI_TERMS.ru` and `RUSSIAN_INSTRUCTION` in `generate-drink-idea` → AC-14, AC-17
- [x] `pnpm --filter @bartendingapp/shared translate-catalog --locale ru` → every recipe, ingredient, tag, and measure gets a `ru` row → AC-2, AC-14
- [x] Run it again → translates nothing (hash gating per locale) → AC-14
- [x] `select count(*) from public.recipes r where deleted_at is null and not exists (select 1 from public.recipe_translations t where t.recipe_id = r.id and t.locale = 'ru')` → 0 (the script skips soft deleted recipes; 17 of 492 are deleted) → AC-2
- [x] Lime and lemon: every `ru` ingredient name for an English name containing "lime" uses «лайм», and "lemon" uses «лимон», never mixed → AC-14
- [x] `select count(*) from public.recipe_translations where locale = 'ru' and name ~ '[Ѐ-ӿ]'` → above 0, then do the two open step 1 checks (Cyrillic slug, ё search) with one of those recipes → AC-3, AC-9

## Build step 4 (notes proposal and UI strings)

_2026-11-11: `propose-recipe-notes --locale ru` wrote 473 recipes (1,419 notes) to `packages/shared/scripts/tagging/recipe-notes-proposals.ru.json`: all Cyrillic, none over 240 characters, no straight quotes or spaced hyphens. Haiku wrote «лимонный» (the lemon adjective) for lime in 15 notes, «со льдом» (with ice) for lime in one, and «лимон» for "citrus" in three; those 19 were fixed by hand in the file. The same slip is in two catalog instructions (Rum Old-fashioned: lime peel as «лимонной цедры»; Rosemary Blue: lemon wedge as «лаймовый дольку»)._

- [x] `recipeNoteProposals.test.ts` → Russian notes get « » quotes and a no break space before the em dash → AC-1, AC-15
- [x] `propose-recipe-notes --locale ru` → `recipe-notes-proposals.ru.json` holds Russian notes for empty `ru` fields only → AC-15
- [x] Web and mobile `ru.json` drafted in full: same keys and ICU placeholders as `en.json`, lowercase «вы», « » quotes, every placeholder list message phrased as label plus value → AC-1, AC-12
- [x] `/ru`, `/ru/search`, `/ru/pantry`, a recipe, `/ru/privacy`, `/ru/learn`, `/ru/quizzes`, `/ru/popular`, `/ru/account`, `/ru/favorites`, `/ru/drink-ideas`, `/ru/shopping-list` → 200, Russian headings, no message errors → AC-1
- [x] Fix the two catalog instructions above in the SQL editor → a lime query over `ru` instructions finds no «лимон» where the English says lime → AC-14
- [x] Signed in as admin, open one recipe's edit form → a Russian notes section shows; save a Russian note → only that recipe's `ru` row changes → AC-16
- [x] Step 5: the reviewer decides on one added line for `LOCALE_AI_TERMS.ru` and `RUSSIAN_INSTRUCTION` (change both in one commit): `Lime juice is «сок лайма» and a lime wedge or wheel is «долька лайма» or «кружок лайма»; never use «лимонный» for lime.` → AC-14, AC-17

## Build step 5 (native review, then notes apply)

_2026-11-11: the native reviewer approved as is: the web and mobile UI strings, both placeholder lists, the unit, batch, and limit copy, the drink idea sample, every proposed note, and the lime term line (now in `LOCALE_AI_TERMS.ru` and `RUSSIAN_INSTRUCTION`; `generate-drink-idea` version 10 deployed). `apply-recipe-notes --locale ru` applied 473 of 473 recipes._

- [x] Native reviewer signs off the UI strings (age gate and privacy first), placeholder lists, unit, batch, and limit copy, drink ideas, and every note → AC-1, AC-12, AC-13, AC-15, AC-17
- [x] 360 px layout check on web and a phone (age gate, nav, recipe page, batch calculator, account) → no clipped text → AC-1
- [x] `apply-recipe-notes --locale ru` → 473 `ru` rows gain notes; the notes of `en` (`recipes`), `es`, `pt`, `fr` hash the same before and after → AC-15
- [x] Every `ru` note whose English mentions lime says «лайм» (0 lost) → AC-14
- [x] The two `ru` rows without notes are expected: Boyarsky has no English notes, and Early Riser has none in any locale (no drink style), so both show English → AC-2
- [ ] With `generate-drink-idea` version 10, a `ru` request whose pantry has lime → Russian text, «вы», «сок лайма» or «лайм», never «лимонный» for lime → AC-17

## Later build steps (not yet built)

- Step 6: launch and production checks → AC-8, AC-19; step 7: store listings → AC-20

## Acceptance criteria coverage

- AC-1: hyphenation, typography steps (full strings in step 4) · AC-2: value sourcing fallback · AC-3: migration check, search steps · AC-4: structure query · AC-5: snapshot and slug regression · AC-6: parity test · AC-7: gating steps · AC-8: detection (after launch) · AC-9: slug steps · AC-10: fonts and share image · AC-11: plural tests and device · AC-12: step 2 · AC-13: units · AC-14: translate run · AC-15, AC-16: step 4 · AC-17: drink idea · AC-18: stored preference · AC-19, AC-20: launch
