# 0035. Batch calculator correctness: rationale

Decision record for [index.md](index.md). `/develop` builds from `index.md`; this file holds the why.

## Context

The batch calculator (spec 0022) sits on top of the measure parser (spec 0021). Both shipped, and a review of real recipes (scope feature 42) found the output is often wrong or missing. Dilution is a percentage of the alcohol only, so any drink with juice or syrup comes out under diluted, and spec 0022 AC-6 itself requires that. Common TheCocktailDB units don't parse, so lines show "not scaled" and recipes written entirely in parts lose the batch panel. Tiny amounts in liters round to `0 l`. The batch units (oz, ml, liter) don't match the recipe toggle (oz, ml, cl).

This is an enhancement to live code in `packages/shared` (`units.ts`, `batch.ts`, `parts.ts`, `adminRecipes.ts`), the import job, a Postgres check constraint, and both apps (web and mobile batch panels, ingredient lists, Quick Build). It is repo wide inside the monorepo, but the logic lives once in `packages/shared` per `AGENTS.md`.

The forces: parsing runs once at import time and is stored (spec 0021), so any parser change does nothing for existing rows until they are reparsed. Unit sizes like "shot" are conventions, not facts, and could change. Old mobile binaries read the same columns and can't be patched after the fact. And a second write path exists that spec 0021 didn't know about: the admin recipe editor (spec 0030), which saves `measure` but never the parsed columns.

Not deciding leaves half the catalog's lines unscaled, keeps dilution wrong by design, and lets every admin save quietly break more recipes.

### Evidence: live data inventory (BartendingAppWeb, 2026-10-11)

- 1,699 ingredient lines across 436 recipes; 844 parsed, 855 not.
- 93 recipes have no parsed line at all, so no batch panel. 25 of them are written only in parts.
- Largest unparsed groups (lines): bare numbers such as `1` 126 · `shot`/`shots` 75 · `part`/`parts` 76 · dashes 57 · `oz` with something extra 34 · `Tblsp` 33 · slice 18 · twist 18 · `tsp superfine` 9 · `l` 8 · `pint`/`qt`/`gal` about 9.
- Plain `1 oz`, `3/4 oz`, `1 1/2 oz` rows exist unparsed, with clean bytes. They belong to recipes with `source = 'admin'` or catalog recipes last updated through admin. Cause: `admin_upsert_recipe` (migration `20260930200000_admin_recipe_management.sql`, line 316) inserts only `recipe_id, ingredient_id, measure, sort_order`.
- Only one recipe mixes parts with volume units.

## Options considered

### Option 1: Fix in place, store source units, reparse once

Widen the `amount_unit` check to store `shot`, `jigger`, `part`, and the metric and US units as written. Teach the shared parser the missing forms. Change the batch math for parts, dilution, units, and display. Make admin saves parse. Reparse every row once with a script.

**Pros**:
- Unit sizes stay in code; changing the shot size later needs no data change.
- Stored data stays faithful to the recipe text.
- One parser, used by every write path, as `AGENTS.md` requires.
- The reparse script covers all sources, including admin rows the import job never touches.

**Cons**:
- Old clients that don't know the new units can misbehave until updated (mobile is the real risk).
- One more migration and a manual live step (dashboard SQL, local script run).

### Option 2: Normalize at parse time into the existing six units

Parse `1 shot` as `1.5 oz`, `1 l` as `1000 ml`, and so on. No constraint change. Parts still need a new representation.

**Pros**:
- No constraint change, and old clients work unchanged for every volume unit.

**Cons**:
- The shot size is frozen into data; changing it means another reparse.
- Spec 0021 shows an oz sourced line's `measure` verbatim in oz, so `1 shot` would display as `1 shot` while the math says 1.5 oz.
- Doesn't solve parts at all, which is the biggest single gap.

### Option 3: Parse at render time on the client

Stop relying on stored columns; parse `measure` text in the browser and app each time.

**Pros**:
- Parser changes apply instantly, no reparse or migration.

**Cons**:
- Reverses spec 0021's decision to parse once at import; every client pays the cost on every render.
- Old mobile binaries keep the old parser forever, so users see different results by app version.
- Translated measures complicate it (spec 0021 AC-7 parses canonical English only).

## Rationale

Option 1 is the only one that fixes parts, which is the largest gap (76 lines, 25 recipes with no batch at all). It also keeps the conventions that matter, shot size, US pint, in code where they can change without touching data, which directly answers the "unit sizes are conventions" force. Option 2 looks cheaper because it avoids a constraint change, but it freezes those conventions and collides with spec 0021's oz display rule. Option 3 trades a one time reparse for permanent version drift on mobile.

The old client risk in Option 1 is real but bounded: it only bites once the reparse writes new units, so ordering the rollout code first, data second removes it for web, and the `toRecognizedUnit` guard removes it for every future unit addition. Mobile binaries already installed are the one residual risk, called out in the migration plan.

Dilution moves to the whole batch because ice melts into the whole drink; basing it on alcohol only made the batch stronger the more juice and syrup a recipe had. The admin save fix is folded in because without it every admin edit undoes the reparse, which would make this feature's Done when impossible to keep true.

Smaller calls (recorded in `index.md` under Decision): whole token unit matching to avoid `1 lime` as liters, bar recipes keep their six unit picker, part size rounds to whole ml or quarter oz on a family switch, and the toggle unit is lifted to the recipe page so the batch can follow it.
