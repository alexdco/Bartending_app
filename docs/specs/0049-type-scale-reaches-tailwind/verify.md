# Verify: Register the web type scale with Tailwind · spec 0049 · updated 2026-11-11
_Steps derived from spec 0049 acceptance criteria. `/check verify` runs these; `/test` locks the durable ones._

## Build checks already run (2026-11-11, by /develop against the local dev server)
- [x] Probe elements per role on `/en`, `/ru`, `/hi`: `text-<role>` computes to `typeScale[role].size` px → AC-1
- [x] `leading-<role>` computes to the token multiple on `/en` and `/ru` (display 1.15, heading 1.2, subheading 1.3, body 1.5, body small 1.45, label 1.3) → AC-2
- [x] A bare `text-<role>` gets the role's line height; `text-<role> leading-none` computes to 1 → AC-3
- [x] On `/hi`, both bare `text-<role>` and `leading-<role>` compute to 1.35, 1.4, 1.45, 1.75, 1.7, 1.6 → AC-4
- [x] Served CSS has `.text-heading { font-size: var(--text-heading); line-height: var(--tw-leading, var(--leading-heading)) }` and `.leading-heading` setting `--tw-leading` → AC-1, AC-2, AC-3
- [x] Regenerate, then `prettier --check apps/web/src/app/theme.generated.css` passes and the only diff is the 18 new `@theme` lines → AC-6
- [x] The AC-7 grid (8 routes, `/en` 360 and 1280 light and dark, `/ru` and `/hi` 360 dark): no sideways page scroll, no clipped text. One find fixed: the batch panel unit chips (`batch-panel.tsx`) overflowed the card on `/ru` and `/hi` and now wrap. The `/en` home carousel past the right edge is by design → AC-7

## UI / manual
- [ ] On `/en`, a `Text variant="heading"` `h2` (for example "Recommended for you") computes 24px / 28.8px; a `Button` label computes 13px with line height 1.3 → AC-1, AC-2, AC-3
- [ ] On `/hi`, the same `h2` computes line height 1.4 and a button label 1.6; the star rating stars keep line height 1 (`leading-none`) → AC-3, AC-4
- [ ] On `/ru` and `/hi` at 360 px, open the Margarita page, scroll to Batch this recipe → the unit chips wrap inside the card border → AC-7
- [ ] Recipe ingredient rows at 360 px: amount and name sit in a narrow column beside two wrapped buttons in every locale. Readable, no overflow, and roomier than before this change, but cramped. Decide whether that's a follow up → AC-7
- [ ] With a pantry and a signed in session (the review hit the anonymous sign in rate limit, so pantry, shopping list, and favorites were checked in their loading or empty states): pantry, shopping list, and favorites with items on `/hi` at 360 px dark → no clipped vowel signs or overlapping rows → AC-7

## Commands
- [ ] `pnpm --filter web exec vitest run src/app/theme.generated.test.ts` → the `@theme` type scale case passes; deleting one `--leading-*` line from `@theme inline` makes it fail → AC-5
- [ ] On a clean checkout, `pnpm --filter web run generate-theme` then `git status --short apps/web/src/app/theme.generated.css` → no output → AC-6

## Value sourcing
- [ ] Change `typeScale.label.size` to 14 in `tokens.ts`, regenerate → a `text-label` button computes 14px; revert → AC-1
- [ ] In devtools on `/hi`, set `--leading-label: 2` on `:root` → a bare `text-label` button's line height becomes 26px (13 × 2) → AC-3, AC-4
- [ ] In devtools on `/en`, `--leading-body` on `:root` reads 1.5; on `/hi` it reads 1.75 → AC-4
- [ ] `Object.keys(typeScale)` through `kebab()` gives `body-small` for `bodySmall`: an element with `text-body-small` computes 14px → AC-1

## Acceptance-criteria coverage
- AC-1 build checks, UI h2 and button, value sourcing · AC-2 build checks, UI h2 · AC-3 build checks, star rating, devtools override · AC-4 build checks, UI `/hi`, devtools · AC-5 test command · AC-6 build checks, clean checkout command · AC-7 grid run, batch chips, ingredient rows, populated owner pages
