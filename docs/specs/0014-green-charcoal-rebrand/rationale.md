# 0014. Rebrand design system to green and charcoal palette — Rationale

**Date**: 2026-09-09
**Status**: Accepted

## Context

The project's design system was set in spec [0003](../0003-design-system-ui-foundation/index.md): a dark, moody cocktail bar look with one amber and copper accent color, built as a single shared token file (`packages/shared/src/tokens.ts`) consumed by both the web app and the mobile app, with every color pair checked automatically for WCAG AA contrast (a minimum readability ratio for text and UI edges).

The engineer no longer likes this look and supplied a reference screenshot of a food delivery app: near black backgrounds, bright green buttons and highlights, rounded image forward cards, and pill shaped filter chips. The screenshot's flows (a promo banner, delivery and pickup toggle, an order quantity counter) belong to a food ordering app, which this product is not: it is a drinks and pantry matching app. Only the visual language, color, and shape transfers, not the ordering flows.

Because every themed surface in both apps is built from the shared token file (spec 0003's key invariant: no component hardcodes a color), a palette change made once there reaches every screen in both apps automatically, so long as no screen has drifted into a hardcoded value since.

## Options considered

### Option 1: Full token level rebrand (change the shared token values in place)

Replace the color values inside the existing `ColorTokens` shape in `packages/shared/src/tokens.ts`, keep every token's semantic name and every consuming component unchanged. Both apps inherit the new look automatically because spec 0003 already enforced that no component hardcodes a color.

**Pros**:
- One change point; both apps update together with no risk of drifting out of sync.
- No component code changes needed for the color swap itself (only Card radius and Chip's selected state style, which are genuine visual changes the reference calls for).
- Fully reuses the WCAG contrast test already in place; no new tooling.

**Cons**:
- A screen that has quietly drifted into a hardcoded color value (a violation of spec 0003, but possible if it slipped past review) would not pick up the rebrand and needs a manual find and fix.

### Option 2: Add a second theme (a selectable "green" theme alongside the current amber one)

Keep the amber and copper palette as is, add a third token set the user could switch to, wire a theme picker.

**Pros**:
- Old palette stays available if the new one is disliked in practice.

**Cons**:
- The engineer asked for the current UI to change, not for a new option to sit alongside it; this does not satisfy the actual request.
- A third token set plus a switcher UI is real new scope (a settings surface, a stored preference) spec 0003 explicitly deferred as a Follow-up, not part of this decision.
- Doubles the ongoing contrast and design maintenance burden for a palette nobody asked to keep.

## Rationale

The current palette is a deliberate, documented design system (spec 0003), not an accident, so this is an ENHANCEMENT that replaces one part of it rather than a from scratch redesign. Because spec 0003 enforced "no component hardcodes a color, every value traces to the shared token module," the cheapest and most reliable way to change the look everywhere is to change the values at their one source, not hunt through every screen. This also means the existing accessibility guarantee (the automated WCAG test) carries forward unchanged in mechanism, only the values it checks are new.

The alternative of adding a second selectable theme was rejected because the engineer's request was to replace the current look, not keep two around; introducing a theme switcher is new, unrequested scope with its own design questions (where the preference is stored, whether it syncs across devices) that spec 0003 already flagged as a deliberate Follow-up, not something to bundle into a color change.
