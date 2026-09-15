# Verify: Recipe ingredient unit conversion · spec 0021 · updated 2026-09-14
_Steps derived from spec 0021 acceptance criteria. `/check verify` runs these; `/test` locks the durable ones._

## UI / manual

- [ ] Open a recipe detail page (web and mobile) whose ingredients include at least one parseable amount → an oz / ml / cl toggle appears above the ingredient list → AC-1
- [ ] With the toggle showing, switch to ml → every convertible ingredient's displayed amount updates on the page → AC-1
- [ ] With ml selected, check a converted line (e.g. an ingredient parsed as "1 1/2 oz") → shows as a decimal rounded to the nearest tenth with a trailing "ml" (e.g. "44.4 ml") → AC-2
- [ ] Switch to cl → the same line shows a decimal rounded to the nearest tenth with a trailing "cl" (e.g. "4.4 cl") → AC-2
- [ ] Switch back to oz → the line returns to its original parsed form (fraction or decimal, e.g. "1 1/2"), never shown as a decimal while oz is selected → AC-2
- [ ] Find a recipe with an unparseable line (a non volume unit like "2 Dashes", or a vague phrase like "a splash") → that line's text never changes as the toggle is switched between oz/ml/cl → AC-3
- [ ] Load any recipe detail page fresh (first visit, or revisiting a page seen before) → the toggle always starts on oz, never remembers a prior selection → AC-4
- [ ] Open the same recipe detail page in the Spanish locale → the unit toggle still appears and functions, and toggling shows the same converted numbers as the English view; only the unit word (oz/ml/cl) differs by locale, never the number → AC-7
- [ ] Open a recipe whose ingredients are all unparseable (e.g. entirely "to taste"/dashes) → no toggle renders at all → AC-1, AC-3 (Toggle visibility row)

## Commands

- [ ] `pnpm --filter @bartendingapp/shared test` → `packages/shared/src/units.ts`'s parsing/conversion functions behave per the fixed rules (plain integer/decimal, mixed fraction, bare fraction, unicode glyph parse; ranges, non volume units, and bare numbers with no unit do not parse; ml/cl round to the nearest tenth; oz formats via `formatOunces`) → AC-2, AC-3, AC-5
- [ ] Apply `supabase/migrations/20260914000000_recipe_ingredient_unit_conversion.sql` against the live `BartendingAppWeb` project, then confirm via schema introspection that `recipe_ingredients` has `amount_value`, `amount_unit` (check constrained), and `amount_max_value`, and that `fetch_recipe_detail` returns `amount_value`/`amount_unit` per ingredient → AC-5, AC-6
- [ ] Run `pnpm --filter @bartendingapp/import-job start` (the normal TheCocktailDB import) against the live project, twice in a row → after the first run, ingredient rows have non null `amount_value`/`amount_unit` wherever `measure` is parseable; after the second run, the same values are unchanged (idempotent), and a row's structured value manually corrupted between runs is overwritten back to the parsed result → AC-5, AC-6
- [ ] Run `pnpm --filter @bartendingapp/import-job importCustomRecipes` against `customRecipes.json`, twice in a row → same idempotency and overwrite behavior as the catalog path → AC-5, AC-6
- [ ] `pnpm typecheck` / `pnpm lint` / `pnpm test` (repo wide) → all clean → confirms no regressions introduced by the units module, import job changes, or the two `ingredient-list.tsx` files

## Acceptance-criteria coverage

- AC-1 (toggle appears and updates every convertible line) — covered by the first two UI steps and the "no convertible lines → no toggle" step.
- AC-2 (ml/cl decimal rounded to the nearest tenth; oz stays in original form) — covered by the ml/cl/oz UI steps and the units test command.
- AC-3 (unparseable lines always show original text, unaffected by the toggle) — covered by the unparseable line UI step and the units test command.
- AC-4 (toggle always defaults to oz, no persistence) — covered by the fresh-load UI step.
- AC-5 (import job parses canonical measure into structured fields, null on failure, measure never modified) — covered by the migration/schema step and both import idempotency command steps.
- AC-6 (re running the import job re parses and overwrites stale structured values) — covered by both import idempotency command steps (the "run twice, corrupt between runs" check).
- AC-7 (a translated detail view still supports the toggle with the same converted numbers, only the unit word localized) — covered by the Spanish locale UI step.
