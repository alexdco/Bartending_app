# Verify: Batch cocktail conversion · spec 0022 · updated 2026-09-15
_Steps derived from spec 0022 acceptance criteria. `/check verify` runs these; `/test` locks the durable ones._

## UI / manual
- [ ] Open a recipe with at least one parseable ingredient → "Batch this recipe" control is visible → AC-1
- [ ] Open a recipe whose every ingredient line is unparseable → no "Batch this recipe" control renders → AC-1
- [ ] Enter 50 servings, scope "Everything", unit oz → every ingredient's batch amount equals its single serving amount times 50, rounded to the nearest tenth as a decimal (never a fraction) → AC-2
- [ ] Enter servings of 0, 501, or a decimal (e.g. "12.5") → rejected inline with an error, no batch computed until corrected; 1 and 500 both compute successfully → AC-2
- [ ] Batch a recipe with one parseable ingredient and one unparseable line (e.g. "2 Dashes bitters") → the unparseable line renders unscaled with its original measure text and a "not scaled, adjust manually" flag, has no checkbox under Custom selection, and is excluded from the total → AC-3
- [ ] Choose scope "Alcohol only" → only `spirit`/`liqueur` categorized lines are included; a null category ingredient is included and flagged "uncategorized" → AC-4
- [ ] Choose scope "Everything except citrus" → every `citrus` categorized line is excluded; a null category ingredient is included and flagged "uncategorized" → AC-4
- [ ] Choose scope "Custom ingredient selection" → every parseable line shows a checkbox, checked by default; unchecking one removes it from the output entirely (no flag) and from the total → AC-5
- [ ] Switch scope away from Custom and back → every checkbox resets to checked → AC-5
- [ ] Select 20% dilution on a batch whose included spirit/liqueur lines sum to a known volume → a "Water" line appears equal to 20% of that volume and is included in the total → AC-6
- [ ] Select a Custom dilution value outside 0–50 (e.g. 60) → rejected inline, no water line computed; 0 and 50 both compute successfully → AC-6
- [ ] Under Custom selection, uncheck every spirit/liqueur line, select 20% dilution → no water line appears; a "no alcohol in this batch, no dilution added" note is shown instead → AC-6
- [ ] Compare the displayed total against manually summing the unrounded per line ml values (not the displayed rounded lines) → they match; summing the rounded per line displays may legitimately differ slightly → AC-7
- [ ] With the network tab open, change servings, scope, unit, and dilution in turn → no network request fires for any of these changes → AC-8
- [ ] Confirm the batch tool is usable while signed out (guest) and while signed in, with no access prompt → AC-10

## Commands
- [ ] `pnpm --filter @bartendingapp/shared exec vitest run batch` → all batch.ts tests pass → AC-2, AC-3, AC-4, AC-6, AC-7, AC-8
- [ ] `pnpm -r typecheck` → clean across `packages/shared`, `packages/import-job`, `apps/web`, `apps/mobile`
- [ ] `pnpm -r lint` → clean (no new errors) across all workspaces
- [ ] `SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... ANTHROPIC_API_KEY=... pnpm --filter @bartendingapp/shared classify-ingredients` → classifies the existing ingredient catalog, leaving unparseable/failed responses `null` rather than a default category; re-running immediately reclassifies 0 rows (hash gate holds) → AC-9

## Acceptance-criteria coverage
- AC-1 … covered by the "Batch this recipe" visibility steps above.
- AC-2 … covered by the servings scaling and boundary input steps, plus the batch.ts unit tests.
- AC-3 … covered by the mixed parseable/unparseable step.
- AC-4 … covered by the Alcohol only / Except citrus scope steps.
- AC-5 … covered by the Custom selection steps.
- AC-6 … covered by the dilution steps (normal case, boundary, and no alcohol in scope).
- AC-7 … covered by the total volume comparison step.
- AC-8 … covered by the network tab step.
- AC-9 … covered by the classify-ingredients command, run against the live catalog by the engineer (not run in this environment; no service role key available here).
- AC-10 … covered by the guest/signed-in access step.
