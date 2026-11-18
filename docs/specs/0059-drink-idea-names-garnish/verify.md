# Verify: Drink idea names and garnish · spec 0059 · updated 2026-11-17
_Steps derived from spec 0059 acceptance criteria and its Value sourcing table. `/check verify` runs these; `/test` locks the durable ones._

## Before you start
- [ ] `generate-drink-idea` is deployed from this branch (the version after 25 on BartendingAppWeb), and its file list includes `functions/generate-drink-idea/idea-checks.ts`.
- [ ] Sign in as the test account (test@bartendingapp.dev). Reset its daily quota row in the SQL editor whenever a batch needs more than the 10 a day limit.

## UI / manual
- [ ] Pantry A (vodka, lime juice, simple syrup), web, English, generate an idea → the response (Network tab) has a `garnish` that is `null` or `{ name, source_name, in_pantry }`, and has no `name_source_names` → AC-1, AC-3
- [ ] Same idea, garnish source outside the pantry (for example `Lime`) → the card shows "Optional garnish: lime wheel (not in your pantry)" below the ingredients, in the same small text as the ingredient lines → AC-2
- [ ] Add the garnish's ingredient to the pantry (or get a garnish whose source is `Ice` or a pantry item) and generate again → the card shows "Garnish: {name}" with no "not in your pantry" text, and `in_pantry` is `true` → AC-1, AC-2
- [ ] An idea whose `garnish` is `null` → no garnish line at all → AC-2
- [ ] Switch the web locale to each of es, pt, fr, ru, hi, ja, ko, zh and generate → the garnish line uses that locale's label (fr "Garniture : …", ja "ガーニッシュ：…", zh "装饰：…"), and the garnish name is in that language → AC-2, AC-5
- [ ] Mobile dev build, same pantry, English and one other locale → the same garnish line under the ingredients, label from `drinkIdeas.garnish` or `drinkIdeas.optionalGarnish` → AC-2
- [ ] Read the steps of every idea above → no step mentions the garnish, and no step names an ingredient outside the pantry and staples → AC-5
- [ ] Read the names of every idea above → no name mentions an ingredient, mixer, or spirit the recipe lacks, and no name is an established cocktail (Margarita, Mojito, Martini, Daiquiri, Gin and Tonic, in any language) → AC-3, AC-5
- [ ] Chinese idea → the garnish name has Chinese typography (no middle dot, full width punctuation) like the drink name → AC-6 (Value sourcing: `garnish.name` typeset)

## Live proof (AC-9)
- [ ] 27 ideas: pantries A (vodka, lime juice, simple syrup), B (gin, lemon juice, sugar), C (white rum, mint, lime juice) × all 9 locales, none holding soda, tonic, or whole citrus. Reset the quota in the SQL editor between batches. Record each idea's name, garnish line, and any miss below, reviewed in its own language. Zero misses, or the prompt is fixed and that locale's 3 ideas run again → AC-9

| Locale | Pantry | Name | Garnish line | Miss? |
|---|---|---|---|---|

## Failure paths (Sentry and the quota)
- [ ] In Sentry, find any `generate-drink-idea` error with stage `claude_generate` after the deploy → its message is the last attempt's reason (`no_output`, `pantry_mismatch`, or `name_mismatch`), `extra.reason` matches it, and `extra.reasons` lists both attempts → AC-7
- [ ] After a 502 `generation failed`, the test account's `ai_generation_quota` row (and today's `ai_generation_daily_total` row) count is unchanged from before the request → AC-4
- [ ] Function logs: when a first attempt fails with `name_mismatch` and the second passes, the request still returns 200 (the retry hint named the offending entry) → AC-4

## Commands
- [ ] `pnpm exec vitest run supabase/functions/generate-drink-idea` → all pass: pass, mixer in the name, empty and blank `name_source_names`, case, spacing, and plural, staple, pantry, and outside garnish, blank garnish, both checks failing → AC-1, AC-3, AC-8, AC-10
- [ ] `pnpm exec vitest run packages/shared/src/generateDrinkIdea.test.ts` → `parseGeneratedDrinkIdea` turns a missing or malformed garnish into `null` → AC-1, AC-2
- [ ] `pnpm exec vitest run packages/shared/src/locale.test.ts` → the Chinese hand copy tests pass after the `CHINESE_INSTRUCTION` cleanup → AC-6
- [ ] `pnpm exec vitest run apps/web/src/i18n apps/mobile/src/i18n` → the placeholder lists include `drinkIdeas.garnish` and `drinkIdeas.optionalGarnish`, and every locale has both keys → AC-2
- [ ] `grep -n "mixer the recipe does not use" supabase/functions/generate-drink-idea/index.ts` → no match (the rule now lives in the shared prompt) → AC-6

## Acceptance criteria coverage
- AC-1: UI steps 1 to 3, Commands 1 and 2
- AC-2: UI steps 2 to 6, Commands 2 and 4
- AC-3: UI steps 1 and 8, Command 1
- AC-4: Failure paths 2 and 3
- AC-5: UI steps 5, 7, and 8
- AC-6: UI step 9, Commands 3 and 5
- AC-7: Failure path 1
- AC-8: Command 1
- AC-9: Live proof
- AC-10: Command 1
