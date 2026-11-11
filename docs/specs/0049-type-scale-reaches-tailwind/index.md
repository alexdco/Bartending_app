# 0049. Register the web type scale with Tailwind

**Date**: 2026-11-11
**Status**: In Progress

## Summary

The web app defines six text sizes and line heights (the type scale), but Tailwind never learns about them, so classes like `text-heading` and `leading-body` produce no CSS. Every heading and label on the site renders at the same plain 16px, in every language, and has since the design system shipped. This spec has the theme generator register the scale with Tailwind, pairs each size with its line height, and adds a test so it cannot quietly break again. It also unblocks Hindi (spec 0048), whose taller line heights depend on these classes working.

The decision history (context, options considered, and rationale) lives in [rationale.md](rationale.md).

## Requirements

**User stories**:
- As a reader on any locale, I want headings, body, and labels at the designed sizes so the page has a clear visual hierarchy.
- As a Hindi reader, I want the taller line heights to apply everywhere text is styled so vowel signs above and below letters never clip.
- As an engineer, I want a failing test the moment a type token stops reaching Tailwind.

**Acceptance criteria**:
- **AC-1**: For each of the six roles (`display`, `heading`, `subheading`, `body`, `body-small`, `label`), an element with `text-<role>` has a computed font size equal to `typeScale[role].size` px, on `/en`, `/ru`, and `/hi` (the other launched locales share Latin metrics with `/en`).
- **AC-2**: For each role, an element with `leading-<role>` has a computed line height equal to `typeScale[role].lineHeight` (as a multiple of its font size), on `/en` and `/ru`.
- **AC-3**: An element with `text-<role>` and no `leading-*` class gets that role's token line height. An explicit `leading-*` class on the same element still wins (for example `leading-none` in `apps/web/src/ratings/star-rating.tsx`).
- **AC-4**: On `/hi`, computed line heights equal the `:root:lang(hi)` values in `globals.css` (display 1.35, heading 1.4, subheading 1.45, body 1.75, body small 1.7, label 1.6), both through `leading-<role>` and through a bare `text-<role>`. On `/en` they equal the tokens (body 1.5). This is what spec 0048 AC-10 needs.
- **AC-5**: `theme.generated.test.ts` fails if any `typeScale` entry is missing from `@theme inline` as `--text-<role>`, `--text-<role>--line-height`, or `--leading-<role>`.
- **AC-6**: Running `pnpm --filter web run generate-theme` on a clean checkout leaves `git status` clean for `theme.generated.css`, and `prettier --check` passes on it.
- **AC-7**: A visual review finds no overflowing, clipped, or overlapping text on these eight routes under `apps/web/src/app/[locale]`: home, `search`, `recipes/[slug]` (Margarita), `pantry`, `shopping-list`, `favorites`, `account`, and `learn/[category]/[slug]` (any one article). The grid: `/en` at 360 px and 1280 px in both light and dark; `/ru` and `/hi` at 360 px in dark only (theme changes color, not layout; narrow width is where long Russian words and tall Devanagari break first). `/auth` and `/admin` are out of scope. Anything found is fixed or written down as a follow up before this ships.

## Decision

**Chosen option**: Option 1: Register the scale in the existing `@theme inline` block.

The theme generator registers every `typeScale` entry with Tailwind as a size, a paired line height, and a standalone line height, all reading the `:root` variables. It also writes Prettier clean output so regeneration stops dirtying git.

**Implementation skills**: `tailwind-4-docs` (`.agents/skills/tailwind-4-docs/`), for the `@theme` namespaces and the `--text-*--line-height` pairing syntax · `vitest` (`antfu/skills`, `.agents/skills/vitest/`)

## Rationale

Reasoning and options: see [rationale.md](rationale.md).

## Feature design

**Data model sketch**: none. No schema or persisted data changes.

**API surface**: none. The interface is the CSS classes `text-<role>` and `leading-<role>` for the six roles in `typeScale`.

**Generated `@theme inline` additions** (one group per `typeScale` entry, names through the generator's existing `kebab()`):

```css
  --text-heading: var(--text-heading);
  --text-heading--line-height: var(--leading-heading);
  --leading-heading: var(--leading-heading);
```

The generator builds these as a `typeThemeVars` template variable from `Object.entries(typeScale)`, the same way it builds `typeSizeVars` (6 roles × 3 lines = 18 lines, two space indent, no trailing blank line). It goes after the radius group and before the font group, with a blank line on each side like the other groups.

**Name collisions**: none. No `--color-display`, `--color-heading`, `--color-subheading`, `--color-body`, `--color-body-small`, or `--color-label` exists, so `text-<role>` only ever means a font size. `text-text` and `text-text-muted` stay colors (`--color-text` is in the color namespace, not `--text-*`). Tailwind has no built in `leading-<role>` with these names.

**Generator output fixes** (AC-6):
- `colorVars(theme, indent)` takes an indent string and writes `value.toLowerCase()`. The light media block (`:root:not([data-theme="dark"])` inside `@media (prefers-color-scheme: light)`) passes four spaces; the `:root`, `[data-theme="light"]`, and `[data-theme="dark"]` blocks pass two.
- Those two changes are everything Prettier rewrites today (checked by running Prettier on the current file). `prettier --check apps/web/src/app/theme.generated.css` fails now and must pass after regeneration.

**Value sourcing**:
| Action | Value produced / displayed | Source |
|---|---|---|
| `text-<role>` font size | px size | `typeScale[role].size` → `:root --text-<role>` (generated) |
| `text-<role>` line height (no `leading-*` class) | unitless multiple | `--text-<role>--line-height` → `var(--leading-<role>)` → `typeScale[role].lineHeight`, overridden on `/hi` by `globals.css` |
| `leading-<role>` line height | unitless multiple | `:root --leading-<role>` (generated), overridden by `:root:lang(hi)` |
| Role names | `display` … `label` | `Object.keys(typeScale)` through `kebab()` (`bodySmall` → `body-small`) |
| Which locales and pages to review (AC-7) | page and locale list | decided in this spec: `en` (baseline), `ru` (longest words), `hi` (tallest glyphs); other launched locales share Latin metrics with `en` |

**Key invariants**:
- `tokens.ts` stays the only place a type value is written. No hand edits to `theme.generated.css`.
- `globals.css` `:root:lang(hi)` overrides only variables, never utility classes.
- An explicit `leading-*` class always beats a size's paired line height (Tailwind's `--tw-leading` takes precedence).
- Tailwind's default `text-xs` to `text-9xl` and `leading-tight` etc. remain available (the namespace is extended, not reset). `favorite-toggle.tsx` and `star-rating.tsx` still use them.

**Security model**: not applicable (static styling, no data or access paths).

**Configuration required**: none.

**Critical test scenarios**:
- Unit: every `typeScale` key appears in `@theme inline` as `--text-x: var(--text-x)`, `--text-x--line-height: var(--leading-x)`, `--leading-x: var(--leading-x)`, verifies **AC-5**.
- Unit: the existing `:root` and color theme tests keep passing after the hex lowercasing (they already compare lowercased), verifies **AC-6**.
- Browser: on `/en`, an `h2` from `Text variant="heading"` computes 24px / 28.8px; a `Button` label computes 13px with line height 1.3, verifies **AC-1**, **AC-2**, **AC-3**.
- Browser: on `/hi`, the same `h2` computes line height 1.4 and a button label 1.6; the star rating keeps `leading-none`, verifies **AC-3**, **AC-4**.
- Compiled CSS: after `pnpm build` (or a dev page load), the `.next` CSS contains `.text-heading` with `font-size:var(--text-heading)` and `line-height:var(--tw-leading,var(--leading-heading))`, and `.leading-heading` reading `var(--leading-heading)`. This proves the pairing reaches Tailwind and that an explicit `leading-*` wins, verifies **AC-1**, **AC-2**, **AC-3**.
- Manual: regenerate, then `git status` and `prettier --check apps/web/src/app/theme.generated.css`, verifies **AC-6**.
- Manual: the AC-7 page, locale, theme, and width review, verifies **AC-7**.

## Build plan

Tracer Bullet: one thin slice proves the whole path (token → generator → `@theme` → utility → computed style on `/en` and `/hi`), then the wide visual pass thickens it.

1. In `generate-theme-css.mjs`, add `typeThemeVars` (size, paired line height, standalone line height per `typeScale` entry) to `@theme inline` between radii and fonts; give `colorVars` an indent argument and lowercase its values, passing four spaces for the light media block. Regenerate `theme.generated.css`, satisfies **AC-1**, **AC-2**, **AC-3**, **AC-4**, **AC-6**
2. Extend `theme.generated.test.ts` with a `typeScale` case in the `@theme` describe block, mirroring the color exposure test. (`declarationsOf`'s `--[\w-]+` already matches `--text-heading--line-height`.) Satisfies **AC-5**
3. Search the compiled `.next` CSS for `.text-heading` and `.leading-heading` and confirm the declarations in the compiled CSS test scenario. Then run `pnpm web` and check computed font size and line height for one element per role on `/en` and `/hi`, including a bare `text-label` button and the star rating's `leading-none`. Confirm the regenerated file leaves `git status` clean and passes `prettier --check`, satisfies **AC-1**, **AC-2**, **AC-3**, **AC-4**, **AC-6**
4. Visual review: the AC-7 routes and grid. Fix any layout the larger headings break (overflow, cramped cards, wrapping nav labels) in the owning component, satisfies **AC-7**
5. Commit as its own milestone on `feat/multilingual-integration`, before the Hindi thin thread closes, satisfies **AC-1** to **AC-7**

## Consequences

**Positive**:
- The type scale from `design.md` renders for the first time: real heading hierarchy on every page and locale.
- Spec 0048 AC-10 becomes checkable, and any future locale override of `--text-*` or `--leading-*` works with no extra wiring.
- Regenerating the theme no longer dirties git.

**Negative / tradeoffs**:
- A site wide visual change in every locale: headings grow from 16px to 32, 24, and 18px, and buttons, chips, and nav labels shrink from line height 1.5 to 1.3 (slightly shorter controls). Screens that were laid out against the broken 16px may need touch ups, and earlier specs' visual verifies were done against the unscaled look.
- The self referencing `var()` entries depend on the `inline` keyword. Dropping it would make every token (colors included) resolve to itself and silently break the theme.
- The reduced review grid (AC-7) skips `/ru` and `/hi` at desktop width and in light mode, so a layout bug that only shows there could slip past.

**Neutral**:
- Mobile is unchanged (no file under `apps/mobile` changes).
- `design.md` already describes the scale and the generated `@theme` block, so it needs no edit.

## Follow-up

- [ ] Spec 0048: once this ships, untick the "blocked" note in `0048-hindi-locale/verify.md` and run its AC-10 checks.
- [ ] `tailwind-4-docs` is installed (`.agents/skills/tailwind-4-docs/`) but not listed in root `AGENTS.md` `## Agent skills`. Styling applies project wide, so it belongs at root.
- [ ] Consider listing the hand written `@theme` groups (colors, spacing, radii) from their token objects the same way, so every family registers itself. Out of scope here.
