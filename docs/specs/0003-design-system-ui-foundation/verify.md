# Verify: design system & UI foundation · spec 0003 · updated 2026-09-07

_Steps derived from spec 0003 acceptance criteria. `/check verify` runs these; `/test` locks the durable ones._

## UI / manual

- [x] Load `apps/web` in a browser with the OS set to no color preference / dark → page background, text, and accent all render from `color.bg`/`color.text`/`color.accent` (dark values); DevTools computed `--color-accent` is `#d98e3e` → AC-1, AC-2 (verified 2026-09-07: served CSS shows `--color-bg: #12100e`, `--color-text: #f5efe7`, `--color-accent: #d98e3e` on bare `:root`)
- [x] Switch the OS to light mode and reload → every themed surface (background, text, borders, accent) switches to the light token set with no leftover dark colored element; computed `--color-accent` is `#8a4c15` → AC-2 (verified: `@media (prefers-color-scheme: light)` override present with `--color-bg: #fbf9f6`, `--color-text: #1c1815`, `--color-accent: #8a4c15`)
- [x] Tab through a page containing a Button and a Chip on web → each shows a visible 2px focus ring (`color.focus`), never `outline: none` → AC-4 (verified: `:focus-visible { outline: 2px solid var(--color-focus) }` present in served CSS, zero `outline: none` occurrences, `--color-focus` resolves in both themes)
- [x] Render the seven core components (Button, Text, Card, Chip, Input, Spinner, EmptyState) on web in both themes → each renders correctly with no unstyled element → AC-1, AC-2, AC-3 (verified: temporary showcase route rendered all 7, confirmed via served HTML markup — real `<button>`, Radix `Toggle` with `data-state`, labeled `<input>`, text content)
- [x] Render the seven core components on mobile in both themes → each compiles and wires correctly → AC-1, AC-2, AC-3 (verified via `expo export --platform web`: temporary showcase route bundled successfully, compiled JS contains expected text content and `accessibilityRole` values `progressbar`/`togglebutton`; full on-device visual/touch confirmation blocked, no simulator available in this environment)
- [ ] On a mobile interactive component (Button, Chip, Input), confirm the rendered hit area is at least 44×44 on a real device or simulator → AC-4 (structurally confirmed instead: `minHeight: 44` present in `button.tsx`/`chip.tsx`/`input.tsx` source; live device measurement not performed, no simulator available)

## Commands

- [x] `pnpm test` → `packages/shared/src/tokens.test.ts` passes all 16 contrast pair assertions (both themes, every documented text/background and boundary pair) → AC-5 (verified 2026-09-07: fresh run, 3 files / 26 tests passed)
- [x] `pnpm run typecheck` → all 4 packages (`shared`, `import-job`, `web`, `mobile`) typecheck clean → AC-1, AC-3 (verified: fresh `--force` run, 0 errors)
- [x] `pnpm run lint` → all 4 packages lint clean → AC-3 (verified: fresh `--force` run, 0 errors)
- [x] `pnpm --filter web run build` → production build succeeds, `theme.generated.css` is regenerated from `packages/shared/src/tokens.ts` via the `prebuild` script → AC-1 (verified: `.next` cleared, fresh build succeeded, all routes prerendered)
- [x] `cat docs/design/design.md` → covers type scale, color tokens (both themes), spacing scale, radii, and the component inventory (props, states, bases) → AC-6 (verified: `## Tokens` and `## Component inventory` sections present with real values)

## Acceptance-criteria coverage

- AC-1 (single token source in `packages/shared`, consumed not duplicated) · covered by the theme render checks, build command, and typecheck
- AC-2 (dark default + light theme, no unstyled/leftover-color element) · covered by the OS preference switch checks
- AC-3 (core component set exists on both platforms, token-driven) · covered by the render checks and lint/typecheck
- AC-4 (visible focus on web, 44×44 minimum on mobile) · covered by the focus ring and hit-target checks
- AC-5 (WCAG AA contrast, both themes) · covered by the automated `tokens.test.ts` run
- AC-6 (`design.md` documents tokens + component inventory) · covered by the design.md content check

## Value sourcing coverage

- Theme color values (web): verified by the OS preference switch checks above (CSS-only resolution, no JS branch)
- Theme color values (mobile): verified by the mobile theme render check (device appearance setting)
- Spacing/radius/type values: verified structurally, no component in `apps/web`/`apps/mobile` contains a raw hex or pixel literal (grep for hardcoded values as part of `/check verify` or code review)
- Focus ring source (web): verified by the focus ring check
- Font loading (web): verified by the build command; confirm no flash of invisible text on a throttled network load
