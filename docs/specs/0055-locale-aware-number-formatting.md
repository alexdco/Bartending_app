# 0055. Locale aware number formatting

**Date**: 2026-11-14
**Status**: In Progress

## Summary

Today every number the app formats for a measure, a conversion, or a batch uses a dot as the decimal point (`String(value)`), even in Spanish, Portuguese, French, and Russian, which write a decimal comma. The translated measure text, on the other hand, already uses a comma in French, Portuguese, and Russian, so one French recipe page can show `4,5 cl` next to `4.5 cl`. This spec adds one small shared module in `packages/shared` that formats numbers with `Intl.NumberFormat` (the built in number formatter in every JavaScript engine), fixes the decimal separator in stored measure text when it is shown, and lets number inputs accept either `1,5` or `1.5`. Every display formatter takes a required locale, so the compiler finds every place that still needs updating.

## Context

Scope feature 58 (from specs 0045, 0046, and 0047). Workspaces: `packages/shared` (the formatters), `apps/web`, and `apps/mobile` (call sites). This is a change to code that already exists; there is no schema change.

**How formatting works today.** The display formatters are pure functions in `packages/shared`: `formatDecimal` and `formatOunces` in [units.ts](../../packages/shared/src/units.ts), plus `formatConvertedAmount`, `formatAmountInUnit`, and `formatAmountOrRangeInUnit` built on them; `formatBatchAmount`, `formatBatchRange`, `batchCountText`, and `partSizeInputForUnit` in [batch.ts](../../packages/shared/src/batch.ts); `formatParts` in [parts.ts](../../packages/shared/src/parts.ts). Every one turns a number into text with `String(value)` or `toFixed`, so the output is locale blind. None of them takes a locale, except `computeBatch`, whose `BatchOptions.locale` is optional and unused for numbers. The only locale aware number on screen today is the rating average, which already calls `Intl.NumberFormat` on web and on Hermes (the mobile JavaScript engine), via `RATING_AVERAGE_FORMAT` in `ratings.ts`.

**The stored measure text disagrees with the formatted numbers.** A line shows its stored `measure` text as is in three cases: an oz sourced line while the toggle is on oz (spec 0021 AC-2), a line the parser could not read, and an unscaled batch line. That text comes from `recipe_ingredient_translations`, coalesced to the English `recipe_ingredients.measure` when no translation exists. A live count on 2026-11-14 found:

| Locale | Rows | `digit.digit` | `digit,digit` |
|---|---|---|---|
| es | 1848 | 28 | 6 |
| pt | 1816 | 0 | 38 |
| fr | 1824 | 0 | 238 |
| ru | 1824 | 3 | 38 |
| hi, ja, ko, zh | ~1829 each | 54 to 285 | 0 |
| English source | | many | 0 (and no three digit decimals) |

So French, Portuguese, and Russian text already reads correctly, Spanish is mixed, and an English fallback line always shows a dot. Generated drink ideas carry a short `amount` string per ingredient, written by the model, with the same risk of mixing.

**Inputs reject a comma.** `validatePartSize` and `validateCustomDilutionPercent` accept only `^\d+(\.\d+)?$`, and the bar recipe form calls `Number(ingredient.amountValue)`, which turns `1,5` into `NaN`. On iOS the decimal keypad (`keyboardType="decimal-pad"`) shows a `,` key, not `.`, when the device region uses a decimal comma, so a French or Spanish iPhone user cannot enter a fractional part size or amount at all.

## Requirements

**User stories**:
- As a bartender reading the app in Spanish, Portuguese, French, or Russian, I want measures, conversions, and batch amounts to use my decimal comma, so the numbers read naturally and match the rest of the page.
- As a bartender on an iPhone set to a decimal comma region, I want to type `1,5` into a number field and have it accepted.

**Acceptance criteria**:
- **AC-1**: On the recipe detail ingredient list (web and mobile), every converted amount and range on the oz / ml / cl toggle uses the locale's decimal separator: `44,4 ml`, `20–30 ml`, `4,4 cl` in `es`, `pt`, `fr`, `ru`; `44.4 ml` in `en`, `hi`, `ja`, `ko`, `zh`. Oz fractions (`1 1/2`) are unchanged in every locale.
- **AC-2**: In the batch panel (web and mobile), every line amount, range, water line, total, the floor text (`< 0,1 oz`, `< 0,001 l`), and count (`0,5` for a half `each`) uses the locale's decimal separator. Numbers of 1000 and above use the locale's own thousands rule from `Intl.NumberFormat`: `30,000 ml` in `en`, `30 000 ml` in `fr` and `ru` (whatever space character the engine's locale data gives), `15.000 ml` but `1500 ml` in `es`.
- **AC-3**: In Quick Build (bartender mode, web and mobile), parts (`1,5 pt`) and converted amounts use the locale's separators.
- **AC-4**: Stored measure text shown as is (an oz line on the oz toggle, an unparsed line, an unscaled batch line, and an English fallback line) shows the locale's decimal separator at display time: `2.5 cl` shows as `2,5 cl` in `es`, an English fallback `1.5 oz` shows as `1,5 oz` in `fr`, and in a dot locale a `digit,digit` decimal of one or two digits shows with a dot. Everything else in the text (fractions, ranges, words, any three digit group after a comma) is unchanged. Stored data is not modified.
- **AC-5**: A generated drink idea's ingredient `amount` gets the same display time normalization as AC-4 (web and mobile). Idea `steps` text is not changed.
- **AC-6**: The part size input, the custom dilution input, and the bar recipe amount input (web and mobile) accept a single `,` or `.` as the decimal point (`1,5` and `1.5` both mean 1.5) in every locale. An input with two or more separators, a sign, non Latin digits (such as Devanagari `१,५` from a Hindi keyboard), or any other character is invalid. The servings input stays whole numbers only. The part size and dilution range limits are unchanged; the bar recipe amount must be greater than 0 and has no upper limit.
- **AC-7**: A number the app writes into an input (the part size after its unit family switches) uses the locale's decimal separator (`0,75` in `fr`).
- **AC-8**: On the bar recipe form, an amount that AC-6 rejects blocks saving and shows an inline message under that ingredient's amount field (the same `error` prop pattern the part size input uses), with copy in all nine locales on web and mobile. The message clears as soon as the text becomes valid or empty. The form never saves `NaN` or silently drops the amount. An empty amount still saves as no amount, as today.
- **AC-9**: Rounding is unchanged: each formatter rounds exactly as it does today (tenth for oz, ml, cl batch and conversions; thousandth for l; two decimals for parts; half for `each`), and only the separators differ. In `en`, the only visible change is the thousands separator on batch numbers of 1000 and above.
- **AC-10**: Digits are Latin (0 to 9) in every locale, including `hi`.
- **AC-11**: All number formatting for these surfaces goes through one shared module in `packages/shared`; every display formatter listed in Feature design takes a required `locale: Locale` parameter, and no display path formats a measure, conversion, batch, or parts number with `String(value)` or `toFixed`.
- **AC-12**: Numbers inside translated messages use the locale's separator: the part size error shows its limits as `0,25` and `4` in `fr` (web and mobile). Message arguments (`{min}` in next-intl, `{{min}}` in i18next) receive strings already formatted by the shared module, never raw numbers, because neither library formats a plain argument by locale.

## Options considered

### Option 1: `Intl.NumberFormat` behind one shared module (fix in place)

Add `packages/shared/src/numberFormat.ts` with a pure `formatNumber(value, locale, maxFractionDigits)` that calls `Intl.NumberFormat`, plus a text normalizer and an input parser. Thread a required locale through the existing formatters.

**Pros**:
- Correct separators and thousands rules for all nine locales, and any future locale, with no table to maintain.
- Already proven on both engines here: the rating average uses it on web and Hermes.
- The existing formatters keep their shape and rounding; only their last step changes.

**Cons**:
- Engines can differ in small ways: French grouping may come out as a narrow no break space (U+202F) in Node and Chrome but a regular no break space (U+00A0) on iOS, and the Spanish "no grouping below 10000" rule depends on the engine's locale data.
- Tests depend on Node's built in locale data (full ICU, the default since Node 13).

### Option 2: A hand written separator table in `locale.ts`

A `Record<Locale, { decimal: string; group: string }>` beside the other locale tables, applied by string replacement.

**Pros**:
- Identical output on every engine, and it matches the repo's `Record<Locale, …>` idiom.

**Cons**:
- Each new locale needs a row, and rules like Spanish's grouping threshold or Hindi's lakh grouping (`1,00,000`) have to be coded by hand.
- It can drift from the rating average, which already uses `Intl`.

### Option 3: Fix the stored measure text instead of normalizing at display

Add a decimal separator rule to each locale's translation prompt and run a one time SQL fix on the ~31 off rows.

**Pros**:
- Clean stored data, and no extra work at display time.

**Cons**:
- Does nothing for English fallback lines (a missing translation still shows `1.5 oz` in French), or for generated drink ideas.
- Any later retranslation that slips reintroduces the mix; display time normalization catches every source at once.

## Decision

**Chosen option**: Option 1: `Intl.NumberFormat` behind one shared module, with display time normalization of stored measure text (instead of Option 3) and lenient input parsing.

All formatting for measures, conversions, batch, parts, and inputs goes through `packages/shared/src/numberFormat.ts`, and every display formatter takes a required locale.

**Implementation skills**: `vitest` (`antfu/skills`, `.agents/skills/vitest/`) · `react-native-best-practices` (`callstackincubator/agent-skills`, `.agents/skills/react-native-best-practices/`)

## Rationale

The real problem is consistency on one page: French, Portuguese, and Russian text already writes a comma, so the dot comes only from the formatters. Fixing the formatters at their single last step (`String(value)` becomes `formatNumber`) is the smallest change that removes the mix, and `Intl` is already trusted here for the rating, on both engines. A hand written table (Option 2) would buy identical output across engines at the cost of reimplementing locale rules the engines already ship, and the only differences we accept (which space character French uses for grouping) are invisible to a reader.

Normalizing stored text at display beats fixing the data (Option 3) because two of the sources (the English fallback and generated ideas) are not stored translations at all. The swap is safe because of what the data looks like: the English source has no comma decimals and no three digit decimals, so "a dot between digits" is always a decimal in comma locales, and "a comma followed by one or two digits" is always a decimal in dot locales. Idea steps are left alone because free prose can hold a list like `2,3` where a swap would be wrong.

A required locale parameter (instead of an optional one defaulting to `en`, which `unitLabel` uses) makes TypeScript list every call site that has not been updated. With about twelve call sites across two apps, a quiet miss is the most likely bug, and the compiler is the cheapest guard. Accepting either separator in inputs, with a single separator always read as the decimal point, fits the input ranges (nothing goes above 500, so nobody types a thousands separator) and fixes the iOS keypad dead end without making a user's keyboard choice matter.

## Feature design

**Data model sketch**: none. No schema change, no migration. Stored `measure` text is read, never written.

**Shared module `packages/shared/src/numberFormat.ts`** (pure functions, exported from `index.ts`):

| Function | Signature | Behavior |
|---|---|---|
| `formatNumber` | `(value: number, locale: Locale, maxFractionDigits: number) => string` | `new Intl.NumberFormat(locale, { minimumFractionDigits: 0, maximumFractionDigits: maxFractionDigits, useGrouping: true }).format(value)`. Callers round first; `maxFractionDigits` matches their rounding precision so `Intl` never rounds again. No cache (a list formats about ten numbers; a module level cache would be shared mutable state). |
| `localizeDecimalText` | `(text: string, locale: Locale) => string` | Comma locale: replace `(\d)\.(?=\d)` with `$1,`, and a leading decimal (`(^\|\s)\.(?=\d)`, as in `.5 oz`) with `$10,` so it reads `0,5 oz`. Dot locale: replace `(\d),(?=\d{1,2}(?!\d))` with `$1.`. Nothing else changes. The comma locale is the one whose `formatNumber(1.5, locale, 1)` contains `,` (no separate exported helper). |
| `parseDecimalInput` | `(raw: string) => number \| null` | Trim; must match `^[0-9]+([.,][0-9]+)?$` (ASCII digits only, so Devanagari digits are rejected); swap `,` for `.`; `Number(...)`. Null otherwise. |

**Formatter changes** (each gains a required `locale: Locale`; rounding untouched):

| Formatter | File | Change |
|---|---|---|
| `formatDecimal` | units.ts | `formatNumber(value, locale, 1)` |
| `formatOunces` | units.ts | Unchanged and locale free: whole and fraction stay ASCII digits (`1 1/2`) in every locale. Only its wrappers take a locale. |
| `formatConvertedAmount`, `formatAmountInUnit`, `formatAmountOrRangeInUnit` | units.ts | pass `locale` through |
| `formatBatchAmount` | batch.ts | `formatNumber(rounded, locale, decimals)`; floor text `< ${formatNumber(1 / factor, locale, decimals)} ${unit}` |
| `formatBatchRange` | batch.ts | pass `locale`; keep the suffix slice (output still ends in ` ${unit}`) |
| `batchCountText` | batch.ts | Signature change: `(count, locale)`; `formatNumber(value, locale, 1)` per end. `batchCountPluralValue` stays numeric. |
| `computeBatch` | batch.ts | `BatchOptions.locale` becomes required and reaches every formatter call |
| `partSizeInputForUnit` | batch.ts | writes `formatNumber(value, locale, 2)` (values stay at or below 120, so grouping never appears) |
| `formatParts` | parts.ts | `formatNumber(value, locale, 2)` |
| `validatePartSize`, `validateCustomDilutionPercent` | batch.ts | parse through `parseDecimalInput`, then the existing range checks |

**Call sites** (each passes its screen's locale): web `recipes/ingredient-list.tsx`, `recipes/batch-panel.tsx`, `service/quick-build-page-client.tsx`, `service/bar-recipe-form-page-client.tsx`, `drink-ideas/generated-recipe-card.tsx`; mobile `recipes/ingredient-list.tsx`, `recipes/batch-panel.tsx`, `app/bartender-build/[kind]/[id].tsx`, `app/bar-recipe-form.tsx`, `drink-ideas/generated-recipe-card.tsx`. These verbatim measure returns wrap their text in `localizeDecimalText`: the `ingredient.measure` returns in both ingredient lists, the `unscaled` branch of both batch panels, and the Quick Build fallbacks (web `quick-build-page-client.tsx` `line?.measure ?? ingredient.measure` and `ingredient.measure ?? ""`; mobile `bartender-build/[kind]/[id].tsx`, the same two). `buildQuickBuildInstructionSteps` only joins strings it is given, so it needs no change. Both batch panels pass `formatNumber(min, locale, 2)` and `formatNumber(max, locale, 2)` as strings into `partSizeError`.

**Blast radius of the required locale**: the shared tests `units.test.ts`, `batch.test.ts`, and `parts.test.ts` update every formatter call, plus `computeBatch` in both batch panels. The AC-11 sweep for `String(` and `toFixed(` covers only `units.ts`, `batch.ts`, `parts.ts`, and the call site files listed above (other `String(` uses, such as `hindiTypography.ts` and `recipeImages.ts`, are not display formatting).

**Locale data notes**: the `pt` tag resolves to Brazilian Portuguese number rules, which is intended (the app's `pt` is Brazilian). The Spanish "no grouping below 10000" rule comes from engine locale data and may differ on iOS Hermes, so it is checked by hand on a device, not asserted in tests.

**API surface**: no endpoints, Edge Functions, or RPCs change.

**Value sourcing**:

| Action | Value produced / displayed | Source |
|---|---|---|
| Any formatted number | decimal and grouping characters | `Intl.NumberFormat(locale)` locale data, via `formatNumber` |
| Web screens | `locale` | next-intl `useLocale()` cast to `Locale`, as `ingredient-list.tsx` does today |
| Mobile screens | `locale` | `isSupportedLocale(i18n.language) ? i18n.language : "en"`, as mobile `ingredient-list.tsx` does today |
| Converted amount | number before formatting | `convertAmount` from stored `amount_value` / `amount_max_value` / `amount_unit` (spec 0021, 0054), unchanged |
| Batch amount, count, water, total | number before formatting | `computeBatch` math and rounding (spec 0035, 0054), unchanged |
| Verbatim measure text | text to normalize | coalesced `measure` from `fetch_recipe_detail` (translation, else English) |
| Drink idea amount | text to normalize | `GeneratedDrinkIdea.ingredients[].amount` from the Edge Function response; normalized with the current UI locale at render |
| Input value | parsed number | `parseDecimalInput(raw)` on the input's text |
| Prefilled part size text | text | `partSizeInputForUnit(..., locale)` |
| Bar form invalid amount message | copy | new key in web `messages/*.json` and the mobile translation files, nine locales |

**Key invariants**:
- Rounding happens once, in the existing formatter, before `formatNumber`; `maxFractionDigits` equals that precision.
- `localizeDecimalText` changes only a separator character between digits, plus the leading `0` it adds before a bare `.5` in comma locales.
- `localizeDecimalText` runs only on raw stored or generated text (measure text, an idea `amount`), never on formatter output or on a string built from it, such as the Quick Build instruction text, so no text is normalized twice.
- Stored data is never rewritten by this feature.
- A parsed input is either a finite number or null; `NaN` never leaves `parseDecimalInput`.

**Security model**: no change. Display and client side parsing only; no new data, no new access paths.

**Configuration required**: none.

**Critical test scenarios** (vitest, beside the source):
- `formatNumber` for all nine locales at `44.4`, `0.5`, `30000`: comma vs dot, `fr` grouping is a space character (assert `/\s| /`, not one exact code point), Latin digits in `hi` (the `es` 1500 threshold is a device check, not a test), verifies **AC-1**, **AC-2**, **AC-10**
- Part size error in `fr` shows `0,25`, verifies **AC-12**
- `formatBatchRange` in `fr` with a floored low end gives `< 0,1–2 oz`, verifies **AC-2**
- `formatAmountOrRangeInUnit` in `fr` and `en`: `44,4` vs `44.4`, a range `20–30`, an oz fraction unchanged, verifies **AC-1**, **AC-9**
- `computeBatch` in `fr`: amounts, range, water, total, `< 0,1 oz`, `0,5` each; in `en` the same numbers as before apart from grouping, verifies **AC-2**, **AC-9**
- `formatParts` in `pt`: `1,5`; `formatParts` keeps two decimals, verifies **AC-3**, **AC-9**
- `localizeDecimalText`: `2.5 cl` to `2,5 cl` in `es`; `1 1/2 oz` unchanged; `2-3 dashes` unchanged; `.5 oz` to `0,5 oz` in `fr`; `4,5 cl` to `4.5 cl` in `zh`; `1,000` unchanged in `en`; `1,50` in `en` intentionally becomes `1.50` (documents the edge), verifies **AC-4**, **AC-5**
- `parseDecimalInput`: `1,5` and `1.5` give 1.5; `1,5,0`, `1.5.0`, `-1`, `abc`, `""`, `1,`, `१,५` give null; `validatePartSize("0,75", "oz")` gives 0.75, verifies **AC-6**
- Part size round trip in `fr`: `partSizeInputForUnit("30", "ml", "oz", "fr")` gives `"1"`; a quarter result gives `0,75`; feeding `0,75` back through `partSizeInputForUnit("0,75", "oz", "ml", "fr")` converts it (not reset to the default), verifies **AC-6**, **AC-7**
- Bar form amount `0` is rejected; `0,5` saves as 0.5, verifies **AC-6**, **AC-8**
- Bar form: an invalid amount blocks save and shows the message; an empty amount saves as null, verifies **AC-8**
- Typecheck: no formatter call without a locale compiles, verifies **AC-11**

## Build plan

Tracer Bullet: the first slice runs the shared module through one real surface on both apps, then each later slice thickens to the next surface.

1. Thin thread: add `numberFormat.ts` (`formatNumber`, `localizeDecimalText`, `parseDecimalInput`) with its tests; make `formatDecimal`, `formatOunces`, `formatConvertedAmount`, `formatAmountInUnit`, and `formatAmountOrRangeInUnit` take a required locale; update both ingredient lists, including `localizeDecimalText` on the verbatim measure return; check a French recipe on web and on a mobile dev build, satisfies **AC-1**, **AC-4**, **AC-9**, **AC-10**, **AC-11**
2. Batch: required locale on `formatBatchAmount`, `formatBatchRange`, `batchCountText`, and `BatchOptions.locale`; `localizeDecimalText` on unscaled lines; both batch panels, satisfies **AC-2**, **AC-4**, **AC-9**, **AC-11**
3. Quick Build: required locale on `formatParts`; `localizeDecimalText` on the measure fallbacks; both Quick Build screens, satisfies **AC-3**, **AC-4**, **AC-9**, **AC-11**
4. Inputs: `validatePartSize` and `validateCustomDilutionPercent` through `parseDecimalInput`; `partSizeInputForUnit` writes the locale's separator; formatted `min`/`max` strings into `partSizeError` on both apps; bar recipe form on both apps parses through `parseDecimalInput`, blocks save with an inline message on an invalid amount, and adds that copy in nine locales on web and mobile, satisfies **AC-6**, **AC-7**, **AC-8**, **AC-12**
5. Drink ideas: `localizeDecimalText` on each ingredient `amount` in both generated recipe cards, satisfies **AC-5**
6. Final sweep: grep `packages/shared/src`, `apps/web/src`, and `apps/mobile/src` for `String(` and `toFixed(` in display paths, and confirm on a physical or simulated iOS device in a comma region that the decimal keypad's `,` is accepted, satisfies **AC-6**, **AC-11**

## Consequences

**Positive**:
- A French, Spanish, Portuguese, or Russian page reads with one decimal separator throughout, including Spanish rows and English fallbacks.
- iOS users in comma regions can enter fractional part sizes, dilution, and bar recipe amounts.
- New locales get correct separators for free.

**Negative / tradeoffs**:
- English changes slightly: batch numbers of 1000 and above gain a comma (`30,000 ml`). Existing tests that assert `30000` must be updated.
- Output can differ by engine in the grouping space character and possibly the Spanish grouping threshold (Hermes on iOS uses the system formatter). Tests assert a space class, not an exact code point, and the threshold is checked by hand on a device.
- Every formatter signature changes, which touches about twelve call sites and many existing tests in one go.
- `localizeDecimalText` relies on the shape of today's data (no comma decimals or three digit decimals in English). A future English source with `1,000 ml` is safe; one with `1,5` would be misread in dot locales only if it had one or two digits, which is the intended reading anyway.

**Neutral**:
- The rating average keeps its own `Intl.NumberFormat` call; it can move onto `formatNumber` later, but it is already correct.
- Idea `steps` and Learn content are untouched (Learn is English only until feature 64).

## Follow-up

- [ ] Specs 0045, 0046 (AC-13), and 0047 say measures "keep the dot until feature 58"; `/sync` should flag those lines as superseded by this spec once it ships.
- [ ] If idea steps show mixed separators in review, consider a per locale separator rule in the drink idea prompt (left out here to avoid an Edge Function change).
- [ ] Consider a no break space between number and unit (French typography) as its own small change; deliberately out of scope here.
