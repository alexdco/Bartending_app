# 0014. Rebrand design system to green and charcoal palette

**Date**: 2026-09-09
**Status**: Accepted

## Summary

This decision replaces the app's current dark amber and copper "cocktail bar" color palette with a dark charcoal background and a bright green accent, matching a reference screenshot the engineer supplied. It changes only color tokens (background, surface, accent, border, text) in the one shared token file both apps read from; font, spacing, and corner radius sizes for text and most elements stay the same. Card and chip roundness grows slightly to better match the reference look. Both the dark theme (default) and the light theme get new palettes so they remain a matched pair.

Full context, options considered, and rationale: [rationale.md](rationale.md).

## Requirements

**User stories**:
- As the engineer, I want the app's look changed from the current amber and copper theme to a dark charcoal and green theme matching a reference I supplied, so the product matches the visual style I want.
- As a user relying on assistive technology or a keyboard, I want the new palette's text and UI edges to stay readable, so accessibility is not lost in the rebrand.

**Acceptance criteria**:
- **AC-1**: Every dark theme color token in `packages/shared/src/tokens.ts` is replaced with a value from the new charcoal and green palette below; no amber or copper value remains in the token file.
- **AC-2**: Every light theme color token is replaced with a coordinated light charcoal and green palette; the two themes remain a complete matched pair, as spec 0003 established.
- **AC-3**: Every color pair listed in `verifiedContrastPairs` continues to pass its required WCAG ratio (4.5:1 for text, 3:1 for a UI edge) under the new values, checked by the existing automated test (`packages/shared/src/tokens.test.ts`); the test needs no new pairs since the palette does not add or remove tokens.
- **AC-4**: The `Card` component's corner radius (both apps) increases from `radius.medium` to `radius.large`, and the `Chip` component's selected state renders a solid accent fill (the new green) rather than the current `surfaceSelected` tint, on both web and mobile.
- **AC-5**: `docs/design/design.md` is updated to describe the new palette's hex values, character, and the changed Card/Chip states, so it stays the accurate human reference per spec 0003's AC-6.
- **AC-6**: No screen in either app is left showing the old amber and copper values; since both apps consume tokens by semantic name (never a raw hex per spec 0003), this follows from AC-1 and AC-2 succeeding, verified by a visual pass over the key screens (drink ideas, recipe search, recipe detail, pantry) in both themes.

## Decision

**Chosen option**: Option 1: Full token level rebrand.

Replace the dark and light `ColorTokens` values in `packages/shared/src/tokens.ts` with the palette below, keep every semantic token name, and make the two component level style changes (Card radius, Chip selected fill) the reference screenshot calls for. This supersedes the amber and copper palette chosen in spec 0003; spec 0003's structural decisions (one shared token module, semantic naming, dark as default, light as a complete second theme, the automated contrast test) all stay in force and are not touched by this spec.

**Implementation skills**: none of the installed community skills govern color token values; `nextjs-app-router-patterns` and `react-native-best-practices` remain relevant to any component code the rebrand touches but add no new guidance for this specific change.

## Feature design

**Data model sketch**: Not applicable. This is a presentation layer decision; no database entities or persistence are introduced.

**State transitions**: Unchanged from spec 0003. Theme resolution (OS reports dark or light, no preference resolves to dark) is not touched by this spec; only the values each theme resolves to change.

**API surface**: Not applicable. No network endpoints are introduced by this spec.

**Value sourcing**:
| Action | Value produced / displayed | Source |
|---|---|---|
| Any themed render (web or mobile) | The active theme's new color values | `packages/shared/src/tokens.ts`, the `colors.dark` / `colors.light` export, unchanged lookup mechanism from spec 0003 |
| Card render (web or mobile) | Corner radius | `radii.large` (reused existing token, no new radius value needed) |
| Chip render, selected state (web or mobile) | Background fill | `color.accent` (the new green), replacing the current `color.surfaceSelected` reference in Chip's selected style |

**Key invariants** (all inherited from spec 0003, restated because this spec must not violate them):
- No component in `apps/web` or `apps/mobile` hardcodes a color; every value traces to the shared token module by semantic name. This spec changes only the values, never the names, so no consuming component needs to change for the color swap itself.
- Every color pair in `verifiedContrastPairs` (`packages/shared/src/tokens.test.ts`) continues to meet its required ratio under the new values; a value that fails is corrected before merge, not shipped and fixed later.
- Theme resolution stays OS driven only (no user visible toggle); this spec does not add one.

**New palette** (hex values, computed and verified against `packages/shared/src/contrastRatio.ts`'s exact WCAG formula before being written into the spec):

| Semantic token | Dark | Light | Role |
|---|---|---|---|
| `color.bg` | `#121212` | `#F7F7F5` | Page background |
| `color.surface` | `#1C1C1C` | `#FFFFFF` | Card, input, and raised surface background |
| `color.surfaceSelected` | `#262626` | `#E4F5E9` | A selected or pressed surface (e.g. an active chip, before the AC-4 solid fill change) |
| `color.border` | `#6E6E6E` | `#8A8A85` | Default border, divider, input outline |
| `color.text` | `#F2F2F2` | `#181818` | Primary text |
| `color.textMuted` | `#A3A3A3` | `#5C5C57` | Secondary text, captions, placeholders |
| `color.accent` | `#2FBF60` | `#1C7A43` | Primary action background, active or selected accents |
| `color.accentText` | `#0A1F0F` | `#FFFFFF` | Text or icon rendered on top of `color.accent` |
| `color.focus` | `#45D67A` | `#1C7A43` | Focus ring color (the brighter, more visible accent step) |
| `color.danger` | `#F5716F` | `#C4362B` | Error text and error state borders (unchanged; not part of the rebrand, no green or amber relationship) |
| `color.dangerText` | `#2B0605` | `#FFFFFF` | Text or icon on a danger colored surface (unchanged) |

Computed contrast ratios for every `verifiedContrastPairs` entry (satisfies AC-3):

| Pair | Dark ratio | Light ratio | Required |
|---|---|---|---|
| text on bg | 16.73 | 16.55 | 4.5 |
| text on surface | 15.22 | 17.76 | 4.5 |
| textMuted on bg | 7.43 | 6.27 | 4.5 |
| textMuted on surface | 6.76 | 6.72 | 4.5 |
| accentText on accent | 7.19 | 5.37 | 4.5 |
| dangerText on danger | 6.61 | 5.37 | 4.5 |
| border on surface | 3.15 | 3.47 | 3.0 |
| focus on surface | 9.05 | 3.49 | 3.0 |

All pairs clear their required ratio. The dark theme's border and the light theme's accent needed adjustment from their first-pass reference derived values to clear 3:1 and 4.5:1 respectively; the values above are the corrected, passing ones.

**Amendment (2026-09-09, post acceptance)**: the engineer asked for `color.accentText` to render as white on every accent surface (buttons, selected chips), matching the light theme's existing `#FFFFFF` value rather than the dark theme's original near black `#0A1F0F`. White text on the original `#2FBF60` accent only reached 2.40:1, well under the 4.5:1 minimum, so `color.accent` (dark theme) was also deepened to `#1E763B` to restore contrast. Both values above already reflect this amendment; the table below is the corrected, current state:

| Semantic token | Dark (amended) | Light | Role |
|---|---|---|---|
| `color.accent` | `#1E763B` | `#1C7A43` | Primary action background, active or selected accents |
| `color.accentText` | `#FFFFFF` | `#FFFFFF` | Text or icon rendered on top of `color.accent` |

`accentText on accent` (dark) now computes to 5.66:1 (was 7.19:1 pre amendment), still clearing the 4.5:1 minimum; `pnpm test` re-verified green after the change. `apps/web/src/recipes/ingredient-list.tsx` and `apps/mobile/src/recipes/ingredient-list.tsx`'s "Add to pantry" button were switched from `variant="secondary"` to `variant="primary"` so it renders on the accent color (white on green) rather than the neutral surface; the disabled "In pantry" state stays `secondary`.

**Security model**: Not applicable. No user data, authentication, or access control is introduced by this spec.

**Configuration required**: None. No new environment variables or credentials.

**Critical test scenarios**:
- Happy path: run `pnpm test` after the token change; every existing `verifiedContrastPairs` assertion in `packages/shared/src/tokens.test.ts` passes with no test file changes needed, verifies **AC-3**.
- Visual check: render the drink ideas screen, recipe search, recipe detail, and pantry screens in both themes on both apps; confirm no amber or copper colored element remains and every Card and selected Chip shows the new radius and fill, verifies **AC-1**, **AC-2**, **AC-4**, **AC-6**.
- Regression: confirm the light theme still resolves correctly when the OS reports a light preference (unchanged mechanism from spec 0003, only values changed), verifies **AC-2**.

## Consequences

**Positive**:
- The entire app's look changes from one file edit to the token values, no per screen rework, because spec 0003's discipline (semantic tokens only, no hardcoded colors) is being honored.
- The automated contrast test catches any of the new values that would have shipped an inaccessible pairing, before merge.
- Card and Chip's small style updates (radius, solid selected fill) reuse existing tokens (`radii.large`, `color.accent`); no new design tokens are introduced.

**Negative / tradeoffs**:
- The amber and copper "cocktail bar" identity from spec 0003 is fully retired; anyone who preferred it has no way back short of reverting this spec.
- Danger (error) colors were left unchanged since they carry no brand relationship to the accent; on the new charcoal background the existing danger red should be re-eyeballed for visual harmony even though it passes contrast numerically.
- If any component has quietly hardcoded a color outside the token file (a spec 0003 violation), it will not pick up the rebrand and needs a manual find and fix during the visual check step.

**Neutral**:
- Spacing, type scale, and font choice (Fraunces and Inter) are unchanged; this is a color and shape only rebrand, not a full design system replacement.
- The exact green and charcoal hex values are a visual choice within the direction the engineer confirmed (matching the reference screenshot), the same way spec 0003's original hex values were a visual choice within its confirmed direction.

## Build plan

1. Replace the `dark` and `light` values in `packages/shared/src/tokens.ts`'s `colors` export with the palette table above, satisfies **AC-1**, **AC-2**.
2. Run `pnpm test` to confirm every `verifiedContrastPairs` entry still passes with no test file changes; fix any failing value before proceeding, satisfies **AC-3**.
3. Update the `Card` component's radius token reference from `radii.medium` to `radii.large` on both web (`apps/web/src/components/`) and mobile (`apps/mobile/src/components/`), satisfies **AC-4**.
4. Update the `Chip` component's selected state style to use `color.accent` as a solid fill (with `color.accentText` for its label) instead of `color.surfaceSelected`, on both web and mobile, satisfies **AC-4**.
5. Update `docs/design/design.md`'s color token table, character description, and Card/Chip state notes to match the new palette and component behavior, satisfies **AC-5**.
6. Visually review the drink ideas, recipe search, recipe detail, and pantry screens in both themes on both apps to confirm no leftover amber or copper element and correct Card/Chip rendering, satisfies **AC-6**.

## Migration plan

**Strategy**: no migration needed.

This is a compile time token value change with no data migration, no coordinated deployment window, and no backward compatibility surface; it ships as a single normal commit and deploy. A revert of the same commit fully restores the prior palette.

**Phases**: not applicable, single step change (Build plan above).
**Rollback**: revert the commit that changes `packages/shared/src/tokens.ts` (and the two component files, if already merged separately); both apps pick up the reverted values on next build with no other action needed.
**Risks**: the only realistic risk is a component that hardcoded a color outside the token file and so does not visually revert or update with the rest of the app; the Build plan's visual review step (task 6) is where this would surface.

## Follow-up

- [ ] The danger (error) red was kept unchanged since it has no brand relationship to the accent color; if it looks visually off against the new charcoal background once built, that is a small follow-up color tweak, not a blocker for this spec.
- [ ] A user visible theme toggle (dark/light, or a future choice between palettes) is still not designed, per spec 0003's own Follow-up; this spec does not change that status.
