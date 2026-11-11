# Verify: Hindi locale · spec 0048 · updated 2026-11-11
_Steps derived from spec 0048 acceptance criteria. `/check verify` runs these; `/test` locks the durable ones._

## Build step 1 (thin thread): your steps before it counts as landed

- [ ] Before the migration, snapshot `es`, `pt`, `fr`, `ru`: `select public.search_recipes('margarita', null, 20, 0, l) from unnest(array['es','pt','fr','ru']) l;` and `select public.fetch_recipe_detail(id, l) from public.recipes, unnest(array['es','pt','fr','ru']) l where name = 'Margarita';` → save the output → AC-5
- [ ] Apply `supabase/migrations/20261111120000_hindi_locale.sql` in the SQL editor → `select * from public.supported_locales where code = 'hi'` returns `('hi', 'hindi')` → AC-4, AC-6
- [ ] Run the check in the migration's header comment → `true` (संतरा finds संतरे) → AC-3
- [ ] Rerun the snapshot → identical to the saved output → AC-5
- [ ] Run the 0045 structure query with `hi|hindi` added to the pattern (`p.prosrc ~ '''(es|pt|fr|ru|hi|spanish|portuguese|russian|hindi)'''`) → no rows → AC-4
- [ ] Deploy `generate-drink-idea`, confirm the live version lists `hi`, then request an idea with `locale: "hi"` → everyday Hindi with आप, sentences end in ।, lime is हरा नींबू, pantry verification passes → AC-17
- [ ] `pnpm --filter @bartendingapp/shared translate-catalog --locale hi --limit 1` → one `hi` recipe row whose text is NFC (`select name = normalize(name, NFC) from public.recipe_translations where locale = 'hi'` is true); run it again → translates nothing → AC-14, AC-23
- [ ] Visit `/hi/recipes/recipe-<uuid>` for that recipe (bare slug until step 2) → Hindi name and instructions, headings in Noto Serif Devanagari, body Devanagari in Noto Sans Devanagari, Latin letters in Inter, no missing glyph boxes → AC-2, AC-10
- [ ] Search `/hi` for that recipe's Hindi name in an inflected form, then for its English name → both find it → AC-3
- [ ] On an iPhone and an Android phone with the app language set to हिन्दी (dev or preview build): the recipe screen, pantry, and account screen show intact conjuncts (क्ष, त्र, र्ग) and no clipped vowel signs; a rating count of 1 and 2 both read correctly. Add `LINE_HEIGHT_SCALE_BY_LOCALE` only if a line clips → AC-11, AC-20

## UI / manual
- [ ] Network panel on `/hi` → both Noto font files load; on `/en`, `/fr`, `/ru` → no Noto request → AC-10
- [ ] On `/hi`, nav, buttons, labels, and footer use the taller line heights with no clipped matras at 360 px → AC-10 (unblocked by spec 0049, 2026-11-11: `/hi` computes the Hindi line heights on bare `text-<role>` and `leading-<role>`; the matra check itself is still yours)
- [ ] On `/en`, open the language menu → in dev it has no हिन्दी; the option markup carries `lang` → AC-7, AC-10
- [ ] `/hi/opengraph-image/card` is byte identical to `/en/opengraph-image/card`; its alt is the English tagline; `/ru` card unchanged → AC-19
- [ ] Before launch: `Accept-Language: hi-IN` on `/` lands on `/en`; the sitemap and hreflang alternates have no `hi`; `/hi/` renders `noindex` with a self canonical → AC-7
- [ ] Before launch: a stored `hi` preference (cookie, `user_preferences.locale`) is ignored for detection and left in place → AC-18
- [ ] `/es`, `/pt`, `/fr`, `/ru` recipe and search pages look and read the same as before → AC-5

## Commands
- [ ] `pnpm --filter @bartendingapp/shared test` → locale parity, Hindi hand copy, typography, unit, batch, and limit copy tests pass → AC-1, AC-6, AC-13, AC-17, AC-23
- [ ] `pnpm --filter web test` → display font, share image locale, and plural forms tests pass → AC-10, AC-11, AC-19
- [ ] `pnpm --filter mobile test` → locale key parity and Hindi plurals (0 and 1 → `_one`, 2 and 5 → `_other`) pass → AC-11

## Value sourcing
- [ ] `select public.resolve_locale('hi')` → `hi`; a recipe with no `hi` row reads in English under `/hi` → AC-2
- [ ] `select public.locale_search_config('hi')` → `hindi` → AC-3
- [ ] Insert or update a `hi` `recipe_translations` row → its `name_search` equals `to_tsvector('hindi', name)` → AC-3
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
