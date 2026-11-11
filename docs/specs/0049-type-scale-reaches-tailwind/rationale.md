# 0049. Rationale: Register the web type scale with Tailwind

## Context

`packages/shared/src/tokens.ts` is the token source of truth (spec 0003). `apps/web/scripts/generate-theme-css.mjs` turns it into `src/app/theme.generated.css`: plain CSS variables (custom properties) on `:root`, plus a Tailwind v4 `@theme inline` block. In Tailwind v4 a utility class only exists when its key is registered in a `@theme` block: `text-heading` needs `--text-heading`, `leading-body` needs `--leading-body`.

The generator writes `--text-*` and `--leading-*` to `:root` but leaves them out of `@theme inline`. The compiled CSS in `.next` confirms it: the variables exist, `.text-heading`, `.leading-body`, and `.text-label` do not, while Tailwind's built in `.text-xl` and `.leading-none` do. The forces:

- `Text` ([text.tsx](../../../apps/web/src/components/text.tsx)) styles all six variants with these classes, and about 60 other spots use `text-label` or `text-body` alone (buttons, chips, nav, inputs). All of them fall back to the inherited 16px at line height 1.5, so the scale in `design.md` has never rendered. Preflight (Tailwind's CSS reset) sets headings to `font-size: inherit`, so `h1` to `h3` look like body text.
- Spec 0048 overrides the six `--leading-*` variables under `:root:lang(hi)` so Devanagari vowel signs don't clip (its AC-10). With no utility reading those variables, the override changes nothing. 0048's `verify.md` marks AC-10 blocked on this.
- `theme.generated.test.ts` checks `:root` has every type variable, but not that `@theme inline` registers it. That gap is why this went unnoticed.
- Prettier (on commit, via lint-staged) lowercases hex colors and reindents CSS, but the generator writes hex as `tokens.ts` spells it (uppercase) and leaves the light media block under indented. Every `pnpm dev` or `pnpm build` regenerates the file and leaves it dirty in git.
- Mobile reads `typeScale` directly through `useTheme()`, so it is unaffected.

## Options considered

### Option 1: Register the scale in the existing `@theme inline` block

The generator loops over `typeScale` and adds `--text-x: var(--text-x)`, `--text-x--line-height: var(--leading-x)`, and `--leading-x: var(--leading-x)` to `@theme inline`, matching how colors are wired.

**Pros**: one pattern for every token family. Utilities read the runtime variable, so `:root:lang(hi)` (and any later locale override) flows through with no extra work.

**Cons**: the self referencing `var()` only works because of `inline`, which writes the value straight into each utility instead of emitting the variable into Tailwind's theme layer. Dropping `inline` would turn every entry into a variable that points at itself.

### Option 2: A separate plain `@theme` block with literal values

Put the sizes and line heights as literal values in a non inline `@theme` block and let Tailwind emit the variables itself.

**Pros**: the textbook Tailwind v4 setup, with no self reference.

**Cons**: the `:root` declarations become duplicates. It also creates a second wiring pattern next to colors and spacing, and locale overrides then depend on cascade layer order instead of plain specificity.

### Option 3: Hand written type classes

Skip Tailwind utilities and write `.type-heading` style classes in `globals.css`.

**Pros**: no dependence on Tailwind's theme namespaces.

**Cons**: means renaming classes across about 30 files, and moves the scale out of the generated, token driven path, so `tokens.ts` stops being the single source.

## Rationale

The bug is a missing registration, not a wrong design, so a fix in place is right. Strangler style replacement has nothing to replace. Option 1 keeps the one wiring pattern the generator already uses for colors, spacing, and radii, and it is the only option where the Hindi `:root:lang(hi)` overrides work with no further change, which is the immediate blocker.

The paired line height (`--text-x--line-height`) was chosen because about 60 places size text with `text-label` or `text-body` alone. Without the pair, those keep the inherited 1.5 and miss the Hindi values, so labels and buttons on `/hi` could still clip. Runner up: size only, which shifts layout less but leaves the Hindi fix half done.

Generating the `@theme` entries from `typeScale` (not hand listing them, as colors are today) means a new token registers itself. The test then guards the generator, not a hand copy.

