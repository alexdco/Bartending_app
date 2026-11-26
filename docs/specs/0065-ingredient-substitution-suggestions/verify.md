# Verify: ingredient substitution suggestions · spec 0065 · updated 2026-11-23
_Steps derived from spec 0065 acceptance criteria and its Value sourcing table. `/check verify` runs these; `/test` locks the durable ones. Milestones 1 to 3 are built; milestone 4 (catalog seeding) has its scripts built, and the catalog review and apply runs are yours._

## Setup
- Sign in as a bar member (the test account works) with a current bar that has a house recipe on its menu using Lime Juice, plus a catalog recipe you can open in Quick Build that uses Lime Juice (a Daiquiri or Margarita).
- On the Service screen, 86 Lime Juice. The starter swaps in the migration cover Lime, Lime Juice, Lemon, Lemon Juice, Simple Syrup, and Sugar Syrup.

## UI / manual (web `pnpm web`, mobile `pnpm mobile`; run each step on both)
- [ ] Open Quick Build for the catalog recipe → a banner sits above the recipe name with "Lime Juice is 86'd" and Lemon Juice listed with its adjusted amount and note → AC-1, AC-2 (Value sourcing: 86'd from `stock_86` intersected with the recipe's ingredient ids; current bar from `useCurrentBar()`; heading name from the Quick Build line's `name`)
- [ ] A recipe with Ice or Water while those are 86'd → no block for them → AC-1 (Value sourcing: staple exclusion from `isStaple`)
- [ ] 86 two of the recipe's ingredients → one block each, in the recipe's ingredient order, and a repeated ingredient shows once → AC-1 (Value sourcing: block order, deduped by id)
- [ ] Unmark everything → the banner is gone, and the recipe looks exactly as before → AC-1
- [ ] 86 Simple Syrup, open a recipe that uses it → at most 3 swaps, in rank order (Sugar Syrup, Agave Syrup, Honey Syrup), with Orgeat Syrup (rank 4) left out → AC-2, AC-3 (Value sourcing: candidates and rank from `substitutes[].items`)
- [ ] Also 86 Sugar Syrup → it drops out and Orgeat Syrup moves into the list → AC-3 (Value sourcing: stock filter from the same `stock_86` snapshot)
- [ ] 86 Lemon Juice as well as Lime Juice → the Lime Juice block says "No substitute in stock" → AC-4
- [ ] 86 an ingredient with no `substitutes_reviewed_at` (any spirit, until you apply the seeding) → its block shows the heading only, with no "No good substitute" claim → AC-5 (Value sourcing: reviewed flag from `substitutes_reviewed_at is not null`)
- [ ] In the SQL editor, set `substitutes_reviewed_at = now()` on an ingredient with no swaps, 86 it, and reopen Quick Build → "No good substitute" → AC-5
- [ ] With the Agave Syrup swap (ratio 0.67) for a 1 oz Simple Syrup line → about "0.67 oz" in oz mode and the ml equivalent in ml mode; toggle the units and the swap amount follows → AC-7 (Value sourcing: original amount and unit, display unit, `formatAmountInUnit`, multiplier from `ratio`)
- [ ] Switch to parts mode → the swap shows a parts amount scaled from the original line's parts → AC-7 (Value sourcing: parts value from `computeParts`)
- [ ] A line with an unparsed measure ("Juice of 1") whose swap ratio isn't 1 → a ratio phrase such as "2/3 the amount"; a ratio off a step reads "About …" → AC-7 (Value sourcing: phrase key from the nearest step, exact within ±0.01)
- [ ] A swap with ratio 1 on an unparsed line → no amount text, just the name → AC-7
- [ ] The Orgeat Syrup swap (Simple Syrup 86'd, Sugar Syrup too) → an "Adds allergens: Tree nuts" tag → AC-8 (Value sourcing: added allergens are the substitute's allergens minus the original's; labels from the spec 0043 strings)
- [ ] A swap whose substitute has `allergens is null` → a "Check allergens" tag → AC-8 (Value sourcing: unknown when null)
- [ ] A swap whose substitute is already in the recipe → an "Already in this drink" tag → AC-2 (Value sourcing: `substitute_ingredient_id` in the recipe's ids)
- [ ] Switch the UI to Spanish (web `/es/...`, mobile language setting) → the banner strings are Spanish, and substitute names use their Spanish catalog names → AC-9 (Value sourcing: `name_translations[locale]`, else `name`; locale from `useLocale()` or the active i18next language)
- [ ] After a note translation is applied, Spanish shows the Spanish note; edit the English note in the SQL editor → Spanish falls back to the new English note until it is retranslated → AC-9 (Value sourcing: note translation only while `source_note_hash = note_hash`)
- [ ] An alcohol free recipe (catalog `non_alcoholic`, or a house recipe with no spirit or liqueur) with an ingredient 86'd that has a spirit or liqueur swap → that swap is hidden; if it was the only one → "No good substitute" → AC-6 (Value sourcing: catalog `alcoholicStatus`, house `alcohol_free`; substitute category spirit, liqueur, or null)
- [ ] Turn on airplane mode after opening the Service screen once, then open Quick Build → the banner still shows from the persisted service data → AC-10
- [ ] With no current bar (signed in, no bar), open Quick Build → the recipe shows with no banner and no error → AC-10
- [ ] On the Service screen, the house recipe using 86'd Lime Juice shows "⚠ · Swap available"; also 86 Lemon Juice → the hint goes away and the ⚠ stays → AC-11 (Value sourcing: `pickSubstitutes` per menu item with its `alcohol_free`)

## Analytics (PostHog live events, consent given on web)
- [ ] Open Quick Build with one 86'd ingredient → exactly one `substitutes_shown` with `ingredient_id`, `shown_count`, `outcome`, `recipe_kind` (`catalog` or `house`), `platform` (`web`, `ios`, or `android`) and nothing else → AC-12 (Value sourcing: props from `pickSubstitutes`, kind from the route, platform from the app)
- [ ] Toggle oz, ml, and parts, switch the language, and wait for a background refetch → no second event for the same ingredient and outcome → AC-12 (Value sourcing: dedupe key `recipeId + ingredientId + outcome` held for the mount)
- [ ] Mark another swap 86'd so the outcome changes on the same screen → one new event with the new outcome → AC-12
- [ ] Web without analytics consent, or a mobile build with `EXPO_PUBLIC_DISABLE_ANALYTICS` → no event → AC-12

## Commands
- [x] Paste `supabase/tests/ingredient_substitutes_check.sql` in the SQL editor → 16 PASS lines, no FAIL → AC-6, AC-15, plus the RPC member check (passed 2026-11-23)
- [ ] `pnpm test` → all green, including `packages/shared/src/substitutes.test.ts` and `ingredientSubstituteProposals.test.ts` → AC-1 to AC-9, AC-11, AC-13, AC-14 logic
- [ ] `pnpm --filter @bartendingapp/shared propose-ingredient-substitutes` → `scripts/tagging/ingredient-substitutes-proposals.json` lists the not yet reviewed, non staple ingredients, each with at most 5 catalog swaps and `"reviewed": false` → AC-13
- [ ] Mark some entries `"reviewed": true` (one with an empty list), run `apply-ingredient-substitutes` → it lists the skipped entries and writes `ingredient-substitutes-apply.sql`; run that in the SQL editor → those ingredients get their rows and `substitutes_reviewed_at`, including the empty one → AC-13
- [ ] Put a ratio of 5 or a 121 character note on a reviewed entry, run apply → "Validation failed, no SQL written" → AC-13, AC-15
- [ ] Rerun propose without `--force` → it refuses to overwrite; with `--force` → only the ingredients still unreviewed appear → AC-13
- [ ] `pnpm --filter @bartendingapp/shared translate-catalog --locale es` → writes `substitute-note-translations-apply.sql`; run it → Spanish notes stored with `source_note_hash` equal to `note_hash`; a rerun reports no swap notes to translate → AC-14

## Value sourcing coverage
- 86'd ingredients, current bar, heading name, staple exclusion, block order: the first four UI steps
- candidates and rank, stock filter: the Simple Syrup steps
- substitute name and locale: the Spanish step
- note text with the hash check: the note translation step
- original amount, parts value, display unit, formatting, multiplier: the Agave and parts steps
- ratio phrase key: the unparsed measure step
- reviewed or not: the two AC-5 steps
- alcohol rule (recipe and substitute): the alcohol free step, and the check script's AC-6 line
- allergen labels, added allergens, unknown: the Orgeat and "Check allergens" steps
- already in drink: the "Already in this drink" step
- menu hint: the Service screen step
- event props and dedupe key: the Analytics steps
