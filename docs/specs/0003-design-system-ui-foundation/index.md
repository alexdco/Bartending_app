# 0003. Design system and UI foundation

**Date**: 2026-09-07
**Status**: In Progress

## Summary

This decision fixes the shared visual language and base building blocks for both the web app and the mobile app: one set of colors, type, spacing, and a small group of accessible components (button, card, chip, input, and so on). Both apps pull these from one shared place so a recipe card, a pantry chip, or a detail page looks and behaves the same whether you are on the phone or in the browser. The look is a dark, moody cocktail bar style, with a light theme included from the start.

## Requirements

**User stories**:
- As a home bartender using the web app or the mobile app, I want recipe cards, pantry chips, and detail pages to look and feel consistent, so the product feels like one coherent thing regardless of device.
- As an engineer building any later feature (recipe search, pantry, favorites), I want a small set of ready made, accessible components and a shared token set, so I am not inventing colors, spacing, or focus handling from scratch each time.
- As a user relying on assistive technology or a keyboard, I want every interactive element to have a visible focus state and a large enough touch target, so the app is usable without a mouse or with limited dexterity.

**Acceptance criteria**:
- **AC-1**: A single token source (color, spacing, type scale, radii) lives in `packages/shared` and is consumed, not duplicated, by both `apps/web` and `apps/mobile`.
- **AC-2**: Both a dark theme (the default) and a light theme are defined for every color token; switching theme changes every themed surface with no unstyled or leftover-color element.
- **AC-3**: The core component set (Button, Text, Card, Chip, Input, Spinner, EmptyState) exists on both web and mobile, each consuming the shared tokens, not hardcoded values.
- **AC-4**: Every interactive component (Button, Input, and any future interactive primitive) has a visible focus indicator on web (never `outline: none`) and meets a minimum 44x44pt (iOS) / 48x48dp (Android) touch target on mobile.
- **AC-5**: Text and background color pairs used by the core components meet WCAG AA contrast (4.5:1 for normal text, 3:1 for large text) in both themes.
- **AC-6**: `docs/design/design.md` documents the type scale, color tokens (both themes), spacing scale, and the component inventory, so a later feature builds against a written reference, not tribal knowledge.

## Decision

**Chosen option**: Option 1: Tailwind (web) + Radix Primitives, React Native StyleSheet (mobile), one shared TypeScript token module.

Both apps read the same token values from `packages/shared`; web renders them through Tailwind classes and CSS variables, mobile renders them through `StyleSheet.create`. Web's interactive components wrap Radix Primitives for accessible behavior where a native element does not already provide it (a native `<button>` needs no wrapper; Chip's toggle semantics use Radix `Toggle`); mobile's interactive components use React Native's own accessibility props, sized to the confirmed touch target minimum.

**Tailwind version and packages**: Tailwind v4 (CSS first `@theme`, no `tailwind.config.js`). Added `tailwindcss` and `@tailwindcss/postcss` to `apps/web`, plus `radix-ui` (the unified Radix package). The token module's values are generated into an `@theme` block (`apps/web/scripts/generate-theme-css.mjs`, run via `predev`/`prebuild`), not read via a JS config file, since v4 has none.

**Implementation skills**: `nextjs-app-router-patterns` (`wshobson/agents`, `.agents/skills/nextjs-app-router-patterns/`) · `react-native-best-practices` (`callstackincubator/agent-skills`, `.agents/skills/react-native-best-practices/`)

**Reasoning and options considered**: see [rationale.md](rationale.md).

## Feature design

**Data model sketch**: Not applicable. This is a presentation layer decision; no database entities or persistence are introduced.

**State transitions**: Theme resolution is a small, real state machine this spec commits to, even with no user visible toggle yet: `OS reports dark` → dark theme; `OS reports light` → light theme; `OS reports no preference` → dark (the confirmed default). On web this resolves entirely in CSS (see Key invariants), never in JavaScript, so there is no client side state transition to desynchronize from the server render. How and where a future user visible override is stored (device setting, app toggle, account sync) belongs to whichever feature introduces that toggle; this spec only guarantees both token sets exist, are complete, and resolve correctly from OS preference alone.

**API surface**: Not applicable. No network endpoints are introduced by this spec.

**Value sourcing**:
| Action | Value produced / displayed | Source |
|---|---|---|
| Any themed render (web) | The active theme's color values | CSS custom properties on `:root`, dark values defined on bare `:root` (the default, including "no preference"), overridden under `@media (prefers-color-scheme: light)`; no React component reads or branches on the active theme at render time (see Key invariants) |
| Any themed render (mobile) | The active theme's color values | The shared token module's `dark` or `light` export, selected by a `useTheme()` hook wrapping the `Appearance` API, dark used whenever `Appearance.getColorScheme()` returns `null`/`no-preference` |
| Any component render | Spacing, radius, and type scale values | The shared token module, referenced by name (e.g. `spacing.three`, `color.surface`), never a hardcoded pixel value or raw hex in component code |
| Button / Chip focus (web) | The visible focus ring | `:focus-visible` (native `<button>`) or Radix `Toggle`'s own focus management, styled via the shared token module's `color.focus` token |
| Any text render (web/mobile) | The rendered font, before and during load | The confirmed display/body pairing (Fraunces / Inter), loaded via `next/font` (web) / to be loaded via `expo-font` when mobile screens adopt it, with `font-display: swap` and a named system font fallback stack, so text is never invisible while loading |

**Key invariants**:
- No component in `apps/web` or `apps/mobile` hardcodes a color, spacing, or font size value; every value traces to the shared token module, using semantic names (`color.bg`, `color.surface`, `color.text`, `color.textMuted`, `color.accent`, `color.accentText`, `color.border`, `color.focus`), not raw scalar names like `color.neutral900`, so a future palette change never requires renaming call sites.
- Theme resolution on web happens only in CSS custom properties (`:root` for dark, a `light` media override); no React component branches on the active theme at render time, on the server or the client, so nothing can hydration mismatch between server and browser. A future user visible toggle (Follow-up) will need a pre hydration inline script plus a `data-theme` attribute; this spec's OS-only resolution does not.
- On mobile, the active theme is read through a `useTheme()` hook (wrapping `Appearance`), never assumed static in a module level `StyleSheet.create`; any themed style value is built from the hook's current token object inside the component, so the UI re-renders correctly if the OS theme changes while the app is open.
- Every color pair used by a core component (text on background, text on accent) meets WCAG AA contrast in both themes; a token change that breaks contrast is caught by an automated test before merge (`packages/shared/src/tokens.test.ts`), not a one time manual pass.
- Every interactive component exposes a focus state on web and a minimum 44×44 hit target on mobile (`minHeight`/`minWidth: 44` plus `hitSlop`); neither is optional per component, both are part of "the component exists" for AC-3.
- The token module has no framework dependency (no React, no React Native, no DOM import), so it stays valid shared, non UI logic per `AGENTS.md`, and is safe to import from a `react-native-web` render path if one ever occurs. Mobile's own components are not required to render correctly under `react-native-web`.

**Security model**: Not applicable. No user data, authentication, or access control is introduced by this spec.

**Configuration required**: None. No new environment variables or credentials; Tailwind, Radix Primitives, and the shared token module are all build time/compile time dependencies.

**Critical test scenarios**:
- Happy path: render each of the seven core components (Button, Text, Card, Chip, Input, Spinner, EmptyState) on both web and mobile in both themes; every one renders using only token values, verifies **AC-1**, **AC-2**, **AC-3**.
- Failure case: a vitest unit test in `packages/shared` computes the WCAG contrast ratio (a small pure function, no DOM) for every documented text/background token pair in both themes and asserts each meets 4.5:1 (normal text) or 3:1 (large text); a color token edited to an insufficient value fails this test before merge, verifies **AC-5**.
- Accessibility: tab to a Button and a Chip on web and confirm a visible focus ring appears (never `outline: none`); mobile components declare `minHeight`/`minWidth: 44`, verifies **AC-4**.

## Consequences

**Positive**:
- Slice 1 (recipe search and detail) and every feature after it build on a real, accessible, shared foundation instead of inventing styles per feature.
- One token source means a future palette or spacing change happens in one place and reaches both apps, rather than a manual two app sync.
- Radix Primitives removes an entire class of accessibility bugs where a genuinely custom widget (Chip's toggle state) is involved.

**Negative / tradeoffs**:
- Two component implementations per primitive (web and mobile) means twice the code to review and maintain per component, and a behavior fix on one platform does not automatically apply to the other.
- Radix Primitives is a real new dependency on web; its API and upgrade path is now something the team tracks, though it is a widely used, actively maintained library.
- Mobile gets no equivalent accessibility library help; correctness there depends on consistently applying React Native's accessibility props by hand across every future component, which is easy to forget without the discipline this spec calls for.

**Neutral**:
- Both themes (dark default, light) are built now rather than dark only; this is more upfront design work than a dark only v1, a deliberate choice from the engineer's own answer rather than a cost-cutting default.
- The exact color values, type pairing, and spacing scale are proposed in `docs/design/design.md` rather than fixed in this spec; they are visual decisions within the direction confirmed here (dark, moody cocktail bar aesthetic), not architectural ones.
- The pre-existing Expo starter demo screens (`index.tsx`, `explore.tsx`, `themed-text.tsx`, `themed-view.tsx`) were left running on a `LegacyColors`/`useLegacyTheme()` compatibility shim rather than rebuilt against the new components; rebuilding them is Slice 1's job (recipe search and detail replaces these placeholder screens), not this foundation's.

## Build plan

1. [x] Write `docs/design/design.md`: propose the dark and light color token sets using semantic names, a two typeface pairing (Fraunces / Inter), a spacing scale, and radii, satisfies **AC-2**, **AC-6**.
2. [x] Write the contrast check as a vitest unit test in `packages/shared` (`tokens.test.ts`, a pure WCAG ratio function over the token pairs, asserting 4.5:1 / 3:1) and run it against every documented pair, satisfies **AC-5**.
3. [x] Create the shared token module in `packages/shared` (`tokens.ts`: semantic color tokens for both themes, spacing scale, type scale, radii) as a plain TypeScript export with no framework dependency, satisfies **AC-1**.
4. [x] Add Tailwind v4 to `apps/web` (`tailwindcss`, `@tailwindcss/postcss`) and `radix-ui`; generate an `@theme` CSS block from the shared token module (`scripts/generate-theme-css.mjs`, run via `predev`/`prebuild`) and expose the color tokens as CSS custom properties on `:root` (dark) with a `@media (prefers-color-scheme: light)` override, satisfies **AC-1**, **AC-2**.
5. [x] Wire the token module into mobile: deleted the scaffold `apps/mobile/src/global.css` and its import, replaced `theme.ts`'s contents with values sourced from the shared module, added a `useTheme()` hook wrapping the `Appearance` API. A `LegacyColors`/`useLegacyTheme()` compatibility shim keeps the pre-existing Expo starter screens compiling unmodified, satisfies **AC-1**, **AC-2**.
6. [x] Build the core component set (Button, Text, Card, Chip, Input, Spinner, EmptyState) on web; native elements throughout, Radix `Toggle` for Chip (a native `<button>` needs no wrapper), every component consuming only token values, satisfies **AC-3**, **AC-4**.
7. [x] Build the same core component set on mobile using React Native `StyleSheet` fed by `useTheme()`, with explicit `accessible`/`accessibilityRole` props and a minimum 44×44 hit target on every interactive component, satisfies **AC-3**, **AC-4**.
8. [x] Document the finished component inventory (real props, states, bases) in `docs/design/design.md` alongside the tokens, satisfies **AC-6**.

## Follow-up

- [ ] Light/dark theme switching UX (a user visible toggle, versus OS-only) is not decided here; this spec only guarantees both token sets exist and are complete. When that feature is designed, it will need a pre hydration inline script plus a `data-theme` attribute on web. Decide the switching UX when a feature first needs it.
- [ ] Dialog, Toast, and Form field wrapper components were deliberately deferred; add them as a follow up spec or Build plan extension once a feature (e.g. sign in, guest pantry) first needs one.
- [ ] The pre-existing Expo starter demo screens run on a `LegacyColors`/`useLegacyTheme()` compatibility shim (see Consequences); Slice 1 (recipe search and detail) should replace these screens and retire the shim rather than extend it.
