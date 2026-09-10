# Design system: Bartending App

**Spec**: [0003](../specs/0003-design-system-ui-foundation/index.md), rebranded by [0014](../specs/0014-green-charcoal-rebrand/index.md)
**Source**: proposed direction (dark, moody cocktail bar), confirmed by the engineer at spec time; palette replaced by a dark charcoal and green direction matching an engineer supplied reference (spec 0014)

## Character

A dark, modern charcoal backdrop with a deep green accent carrying all emphasis, evoking a clean, confident app rather than the earlier amber lit bar look. The accent always carries a white label (`color.accentText`), so every primary button and selected chip reads as solid green with white text. Dark is the default and the primary experience; light is a complete, considered second theme, not an afterthought.

## Build mandate

- Dark is the primary experience. Every surface, component, and state is designed dark first; light is verified to hold up on its own, not just inverted math.
- One accent color (green) carries all emphasis: primary actions, focus rings, selected states. Do not introduce a second accent hue without updating this file.
- Deep, near black neutrals for dark surfaces (never pure `#000000`, which crushes shadow detail and photography); a warm off white for light surfaces (never pure `#ffffff`, which glares next to photography).
- Generous spacing and a confident type scale; this is a browsing and reading product (recipes, instructions), not a dense dashboard.
- Every token below is referenced by its semantic name in code, never a raw hex or pixel value. A missing token is called out in code as `// TODO: missing token: <what's needed>`, never invented inline.

## Tokens (values, both themes)

Token values live in code, generated from one shared source. This section is the human readable reference; the code is authoritative if the two ever drift.

**Source of truth**: `packages/shared/src/tokens.ts`
**Consumed by**: `apps/web` (as CSS custom properties + a generated Tailwind v4 `@theme` block) and `apps/mobile` (directly, via a `useTheme()` hook)

### Color

Semantic name, then its dark and light hex value. Every text/background pair listed under "Verified pairs" meets WCAG AA (4.5:1 normal text, 3:1 large text or UI boundaries); the automated test in `packages/shared/src/tokens.test.ts` (Build plan item 2) guards this on every change.

| Semantic token | Dark | Light | Role |
|---|---|---|---|
| `color.bg` | `#121212` | `#F7F7F5` | Page background |
| `color.surface` | `#1C1C1C` | `#FFFFFF` | Card, input, and raised surface background |
| `color.surfaceSelected` | `#262626` | `#E4F5E9` | A selected or pressed surface (e.g. an active chip, before the solid accent fill state) |
| `color.border` | `#6E6E6E` | `#8A8A85` | Default border, divider, input outline |
| `color.text` | `#F2F2F2` | `#181818` | Primary text |
| `color.textMuted` | `#A3A3A3` | `#5C5C57` | Secondary text, captions, placeholders |
| `color.accent` | `#1E763B` | `#1C7A43` | Primary action background, active/selected accents |
| `color.accentText` | `#FFFFFF` | `#FFFFFF` | Text/icon rendered on top of `color.accent` |
| `color.focus` | `#45D67A` | `#1C7A43` | Focus ring color (always the brighter, more visible accent step) |
| `color.danger` | `#F5716F` | `#C4362B` | Error text and error state borders |
| `color.dangerText` | `#2B0605` | `#FFFFFF` | Text/icon rendered on top of a danger colored surface |

**Verified pairs** (enforced by `packages/shared/src/tokens.test.ts`, run via `pnpm test`; values below are the actual computed ratios, not estimates):
- `color.text` on `color.bg` — both themes ≥ 4.5:1 (normal text)
- `color.text` on `color.surface` — both themes ≥ 4.5:1 (normal text)
- `color.textMuted` on `color.bg` — both themes ≥ 4.5:1 (normal text)
- `color.textMuted` on `color.surface` — both themes ≥ 4.5:1 (normal text)
- `color.accentText` on `color.accent` — both themes ≥ 4.5:1 (normal text)
- `color.dangerText` on `color.danger` — both themes ≥ 4.5:1 (normal text)
- `color.border` against `color.surface` — both themes ≥ 3:1 (UI boundary)
- `color.focus` against `color.surface` — both themes ≥ 3:1 (UI boundary)

### Typography

| Role | Typeface | Fallback stack | Notes |
|---|---|---|---|
| Display / heading | Fraunces (a warm, slightly serif display face, evokes bar signage without being a novelty font) | `Georgia, "Times New Roman", serif` | Loaded via `next/font/google` (web) and `expo-font` (mobile); `font-display: swap` |
| Body | Inter (a highly legible, widely available grotesque sans) | `ui-sans-serif, system-ui, -apple-system, sans-serif` | Loaded the same way; `font-display: swap` |

Both faces are open source (SIL Open Font License), no licensing friction on either platform.

**Type scale** (semantic name, size / line height, mobile follows the same scale in density independent pixels):

| Token | Size | Line height | Use |
|---|---|---|---|
| `type.display` | 32px | 1.15 | Page hero / screen title |
| `type.heading` | 24px | 1.2 | Section heading |
| `type.subheading` | 18px | 1.3 | Card title, subsection heading |
| `type.body` | 16px | 1.5 | Default body text |
| `type.bodySmall` | 14px | 1.45 | Secondary text, captions |
| `type.label` | 13px | 1.3 | Button label, chip label, form label (uppercase tracking optional per component) |

### Spacing

A 4px base scale (matches the existing mobile scaffold's step sizes, kept and renamed to semantic tokens):

| Token | Value |
|---|---|
| `spacing.half` | 2px |
| `spacing.one` | 4px |
| `spacing.two` | 8px |
| `spacing.three` | 16px |
| `spacing.four` | 24px |
| `spacing.five` | 32px |
| `spacing.six` | 64px |

### Radii

| Token | Value | Use |
|---|---|---|
| `radius.small` | 6px | Chip, input, small control |
| `radius.medium` | 12px | Card, button |
| `radius.large` | 20px | Modal, sheet (future) |
| `radius.full` | 9999px | Pill / avatar |

### Avatar / badge

Introduced by spec 0018 (user profile and nav badge): a circular initials badge, `radius.full`, `color.accent` background with `color.accentText` label at `type.label` weight 600, used in the web nav's top right corner and the mobile header bar above the tab bar. A guest sees the same shape on a neutral (`color.surfaceSelected`) background with a person icon instead of initials, so guest and signed in states are visually distinct, not just textually.

| Token | Value |
|---|---|
| `avatarSize.web` | 32px |
| `avatarSize.mobile` | 28px (44×44 minimum tap target) |

## Component inventory

Built in this feature (Build plan items 6 and 7), each on both web (`apps/web/src/components/`) and mobile (`apps/mobile/src/components/`), each consuming only the tokens above. Radix Primitives is used where it adds real accessible behavior beyond a native element (Chip's toggle semantics); a plain native `<button>` is already fully accessible on its own, so Button does not wrap a Radix primitive, per Radix's own guidance.

| Component | Props | Web base | Mobile base | States |
|---|---|---|---|---|
| Button | `children`, `variant?: "primary" \| "secondary"`, native button/pressable props | Native `<button>`, focus ring via `:focus-visible` | `Pressable` + `StyleSheet`, `accessibilityRole="button"`, 44×44 minimum | default, hover (web only), pressed, focused, disabled |
| Text | `children`, `variant?`, `as?`, `muted?` (web) / `variant?`, `muted?` (mobile) | Semantic element per variant (`h1`–`h3`, `p`, `span`) styled from `type.*` tokens | `Text` styled from `type.*` tokens | variants matching the type scale roles, muted color option |
| Card | `children`, `selected?` | `<div>` with `color.surface`/`radius.large`/`color.border` | `View` with the same tokens | default, selected (`color.surfaceSelected`) |
| Chip | `children`, `selected?`, `onSelectedChange?`, `disabled?` | Radix `Toggle.Root`, `radius.full` | `Pressable`, `accessibilityRole="togglebutton"`, `radius.full`, 44 minimum height | default, selected (`data-state=on`, solid `color.accent` fill with `color.accentText` label), disabled |
| Input | `label`, `error?`, native input props | Native `<input>`, visible `<label>`, `color.border`/`color.focus`/`color.danger` | `TextInput`, visible `<Text>` label, same tokens, 44 minimum height | default, focused, invalid (`color.danger`), disabled |
| Spinner | `label?` (web) / `label?`, `size?` (mobile) | CSS `animate-spin` border using `color.accent`, `role="status"` | `ActivityIndicator` with `color.accent`, `accessibilityRole="progressbar"` | indeterminate only |
| EmptyState | `icon?`, `title`, `description?`, `action?` | Composed from `Text`, icon hidden from assistive tech | Same composition, native primitives | one variant, content driven |

## Theme mechanism

- **Web**: CSS custom properties on `:root` (dark values, the default including "no preference") overridden under `@media (prefers-color-scheme: light)`. No React component reads or branches on the active theme; see spec 0003's Key invariants.
- **Mobile**: a `useTheme()` hook wraps React Native's `Appearance` API, resolving to the shared module's `dark` or `light` token export; dark is used whenever `Appearance.getColorScheme()` reports `null` (no preference).

## Accessibility mandate

- Every interactive component has a visible focus indicator on web (`color.focus`, never `outline: none`) and a minimum 44×44pt (iOS) / 48×48dp (Android) touch target on mobile (`minHeight`/`minWidth: 44` plus `hitSlop` where the visual size is smaller).
- Every token pair listed under "Verified pairs" above is enforced by an automated test (`packages/shared/src/tokens.test.ts`); a future palette edit that breaks a pair fails that test before merge.
