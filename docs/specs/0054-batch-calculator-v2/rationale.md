# 0054. Batch calculator v2: rationale

Decision record for [index.md](index.md). `/develop` builds from the index; this file explains why.

## Context

Spec 0035 fixed the batch calculator's math, but by choice it left three gaps in its Follow-up. Feature 57 promotes them. First, counted lines (`2 dashes`) show unscaled, so a 25 serving batch still reads `2 dashes`, and the bartender multiplies by hand into a number nobody can pour (50 dashes). Second, ranges (`2-3 oz`) stay unparsed, so the batch leaves them out of the total and the dilution entirely. Third, dilution starts at None for every drink. A stirred or shaken batch served from a bottle then comes out far too strong unless the bartender knows to add 20 to 25% water.

The live catalog shows the size of each gap. Of 540 unparsed ingredient lines, about 60 are dashes, 14 drops, 8 splashes, about 20 ranges (`2-3 oz`, `1-2 shot`, `3/4-1 cup`, `2-3 dashes`, `2 or 3`), and 157 bare numbers. The bare numbers mix two meanings. Most are item counts (`1` Lime, `6` Egg White). A few are shares of a layered shot glass (`1/3` Baileys, `1/4` Kahlua). A handful are leftovers from earlier line splits (`2` with the name `–3 Dashes Worcestershire Sauce`).

Method based dilution has no data to stand on. `recipes.method` exists (added for Quick Build in spec 0023) but is null on all 492 recipes, because the `classify-method-and-aliases` backfill was never run. Where it was meant to be filled, it was free text ("Shake", "Dry shake then shake"), which code cannot map safely and which shows untranslated in nine locales.

The constraints are the ones spec 0035 set. Parsing happens once at write time (import, admin save, reparse), and clients read stored values. Unit sizes live in code, never in data. Every value is carried unrounded and rounded once at display. Clients narrow stored values so an unknown one degrades instead of crashing. The app ships in nine locales on web and mobile. No mobile build is in users' hands yet, which keeps rollout simple.

## Options considered

### Option 1: Extend in place (chosen)

Add `dash`, `splash`, `drop`, `each` to the `amount_unit` check, fill the long unused `amount_max_value` for ranges, and teach `parseMeasure` and `computeBatch` both. The reparse script backfills, as in spec 0035. Turn `recipes.method` into a checked list filled by the existing classifier, with `method_source` protecting admin picks.

**Pros**:
- Reuses every mechanism spec 0035 built: the unit check, the reparse script, the unknown unit guard, the parse once rule.
- No new tables. Two existing columns finally get used as designed.
- One classifier run also fills Quick Build's method line and the pending search aliases.

**Cons**:
- `amount_unit` now mixes volume, ratio, and count meanings, so every reader must branch on unit kind (made safe by the `isVolumeUnit` membership fix).
- Older clients ignore `amount_max_value` and would read a range as its low end.
- Depends on an AI classification for method quality.

### Option 2: Separate count and range columns

Add `count_value`/`count_unit` and `range_low`/`range_high` columns, leaving `amount_unit` purely for volume and parts.

**Pros**:
- Each column has one meaning; volume code never sees a count.
- Old clients ignore the new columns entirely, so no silent range misread.

**Cons**:
- Four new columns, four new pair checks, and every write path and mapper grows.
- `amount_max_value` stays dead weight beside a second range pair.
- The reparse, import, and admin paths each need parallel logic, the duplication spec 0035 removed.

### Option 3: Parse at render, method by keyword

Leave the data alone. Clients parse counted and range text from `measure` when the batch opens, and a pure keyword scan of the instructions (shake, stir, blend) picks the method.

**Pros**:
- No migration, no reparse, no AI cost.
- Ships fastest.

**Cons**:
- Breaks the parse once rule: the admin form, import, Quick Build, and the batch would each see a different answer for the same line.
- Keyword scans misread real instructions ("stir in the soda after shaking", "build in a shaker").
- No admin override, and no translated method label.

## Rationale

Option 1 wins because it puts each new meaning where spec 0035 already put the old ones. The force that decided it is consistency of parsing. Spec 0035 spent a whole slice making the import, admin save, and reparse paths agree, and its unknown unit guard was built for exactly this moment: adding units without breaking older clients. Option 2 buys a cleaner column meaning at the cost of undoing that consolidation. Option 3 throws it away. The real risk of Option 1 (an old client reading a range as its low end) does not apply today, because no mobile build is in users' hands. The migration plan states what to do if that changes.

For method, the engineer chose the existing Haiku classifier over a keyword rule or manual entry. The classifier reads instructions the way a bartender would, and the code already exists. Running it also clears two long pending items: Quick Build's empty method line, and the search aliases from spec 0023. Narrowing its output to five values makes the batch default a lookup, not a guess, and lets Quick Build show a translated label. `method_source` exists because the hash gate alone would let a rerun after an instructions edit silently undo an admin's correction.

The display choices all follow one principle: be honest about uncertainty without hiding the number a bartender can act on. That means a count plus an `≈` volume (shown only once it is measurable with a jigger), ranges carried through to the total instead of a hidden midpoint, and shooter shares left unscaled rather than turned into `8.3` Baileys. The dilution defaults (stir 20, shake 25, build and blend none) land on the existing preset buttons, so the panel gains a hint, not a control.

## Evidence: live catalog inventory (2026-11-14)

Read only queries against the live project, over `recipe_ingredients` rows with a null `amount_value` and a non empty `measure`:

| Pattern | Lines |
|---|---|
| All unparsed | 540 |
| Dash | 60 |
| Drop | 14 |
| Splash | 8 |
| Range with a dash (`2-3 oz`, `2-3 Wheels`) | 21 |
| Range with to or or | 1 |
| Bare number | 157 |
| Slice, wedge, twist, sprig, leaf, cube, piece | 49 |

Range examples: `1-2 shot`, `1-2 tblsp`, `1-2 tsp`, `2-3 cl`, `2-3 oz`, `3-4 oz`, `3-4 tsp`, `3/4-1 cup`, `6-8 oz`, `8-10 oz cold`, `10-12 oz`, `2 or 3`, plus non volume `1-2 whole`, `2-3 Wheels`, `3-4 crushed`, `4-5 whole green`.

Recipes: `method` is null on all 492. Instructions mention shake on 165, stir on 167, and blend on 38 (overlapping, and stir often appears in built drinks).
