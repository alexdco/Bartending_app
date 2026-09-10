# Verify: Green and charcoal rebrand · spec 0014 · updated 2026-09-09
_Steps derived from spec 0014 acceptance criteria. `/check verify` runs these; `/test` locks the durable ones._

## UI / manual
- [ ] Render the drink ideas screen (web and mobile), dark theme → background is near black charcoal (`#121212` / `#1C1C1C` surfaces), primary buttons and selected chips are bright green, no amber/copper visible → AC-1, AC-6
- [ ] Same screen, light theme (OS set to light) → background is off white (`#F7F7F5`), accent is the darker green (`#1C7A43`), no amber/copper visible → AC-2, AC-6
- [ ] Recipe search page/screen, both themes → same charcoal/green palette, no amber/copper → AC-1, AC-2, AC-6
- [ ] Recipe detail page/screen, both themes → same charcoal/green palette, no amber/copper → AC-1, AC-2, AC-6
- [ ] Pantry screen/page, both themes → same charcoal/green palette, no amber/copper → AC-1, AC-2, AC-6
- [ ] Any `Card` (e.g. a recipe card) on either platform → corner radius is visibly larger/rounder than before (`radius.large`, 20px) → AC-4
- [ ] Any selected `Chip` (e.g. an active pantry ingredient filter) on either platform → shows a solid green fill with white label text, not a faint tinted background → AC-4
- [ ] Recipe detail page/screen, "Add to pantry" row for an ingredient not yet in the pantry, both platforms → button renders solid green with white text (`variant="primary"`); once added, it becomes the disabled "In pantry" state in the neutral secondary style → AC-4 (post acceptance amendment, 2026-09-09)
- [ ] Keyboard focus on an interactive element (web) → focus ring renders in the new bright green focus color, clearly visible against the surface → AC-3

## Commands
- [ ] `pnpm test` → all `verifiedContrastPairs` assertions in `packages/shared/src/tokens.test.ts` pass (16/16) → AC-3
- [ ] `pnpm --filter web typecheck` → passes clean → AC-1, AC-4
- [ ] `pnpm --filter mobile typecheck` → passes clean → AC-1, AC-4
- [ ] `grep -rniE "#D98E3E|#8A4C15|#E8AC5E|#12100E|#1C1815|#2A2420|#79695A|#F5EFE7|#B8AA9A|#FBF9F6|#F2E9DE|#8C7C68" apps/ packages/ --include="*.ts" --include="*.tsx" --include="*.css"` (excluding `.next/` build cache) → no matches outside stale build artifacts → AC-1, AC-2, AC-6

## Acceptance-criteria coverage
- AC-1 (dark token values replaced, no amber/copper) — covered by the grep command, the typecheck commands, and the dark theme UI passes on all four screens
- AC-2 (light token values replaced, matched pair) — covered by the light theme UI passes and the grep command
- AC-3 (contrast pairs still pass WCAG) — covered by `pnpm test` and the keyboard focus manual check
- AC-4 (Card radius, Chip solid selected fill) — covered by the Card and Chip manual checks on both platforms, and both typecheck commands
- AC-5 (design.md updated) — covered by direct inspection; `docs/design/design.md`'s palette table, character section, and Card/Chip inventory rows were updated alongside the token change
- AC-6 (no screen shows old colors) — covered by the four screen UI passes and the grep command
