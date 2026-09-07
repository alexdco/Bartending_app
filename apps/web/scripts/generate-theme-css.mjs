// Generates src/app/theme.generated.css from the shared token module.
// Tailwind v4 has no JS config file to import a TS module into, so this is
// the build step that bridges packages/shared/src/tokens.ts into CSS custom
// properties plus a Tailwind @theme block. Run before dev/build (see package.json).

import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { colors, spacing, radii, typeScale, fonts } from "../../../packages/shared/src/tokens.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const outPath = resolve(__dirname, "../src/app/theme.generated.css");

function colorVars(theme) {
  return Object.entries(theme)
    .map(([name, value]) => `  --color-${kebab(name)}: ${value};`)
    .join("\n");
}

function kebab(name) {
  return name.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();
}

const spacingVars = Object.entries(spacing)
  .map(([name, value]) => `  --spacing-${kebab(name)}: ${value}px;`)
  .join("\n");

const radiiVars = Object.entries(radii)
  .map(([name, value]) => `  --radius-${kebab(name)}: ${value === 9999 ? "9999px" : `${value}px`};`)
  .join("\n");

const typeSizeVars = Object.entries(typeScale)
  .map(([name, { size }]) => `  --text-${kebab(name)}: ${size}px;`)
  .join("\n");

const typeLineHeightVars = Object.entries(typeScale)
  .map(([name, { lineHeight }]) => `  --leading-${kebab(name)}: ${lineHeight};`)
  .join("\n");

const css = `/* GENERATED FILE. Do not edit by hand.
   Source: packages/shared/src/tokens.ts
   Regenerate: pnpm --filter web run generate-theme (runs automatically before dev/build) */

:root {
${colorVars(colors.dark)}
${spacingVars}
${radiiVars}
${typeSizeVars}
${typeLineHeightVars}
  --font-display-fallback: "${fonts.display}", ${fonts.displayFallback};
  --font-body-fallback: "${fonts.body}", ${fonts.bodyFallback};
  --font-display: var(--font-display-loaded), var(--font-display-fallback);
  --font-body: var(--font-body-loaded), var(--font-body-fallback);
}

@media (prefers-color-scheme: light) {
  :root {
${colorVars(colors.light)}
  }
}

@theme inline {
  --color-bg: var(--color-bg);
  --color-surface: var(--color-surface);
  --color-surface-selected: var(--color-surface-selected);
  --color-border: var(--color-border);
  --color-text: var(--color-text);
  --color-text-muted: var(--color-text-muted);
  --color-accent: var(--color-accent);
  --color-accent-text: var(--color-accent-text);
  --color-focus: var(--color-focus);
  --color-danger: var(--color-danger);
  --color-danger-text: var(--color-danger-text);

  --spacing-half: var(--spacing-half);
  --spacing-one: var(--spacing-one);
  --spacing-two: var(--spacing-two);
  --spacing-three: var(--spacing-three);
  --spacing-four: var(--spacing-four);
  --spacing-five: var(--spacing-five);
  --spacing-six: var(--spacing-six);

  --radius-small: var(--radius-small);
  --radius-medium: var(--radius-medium);
  --radius-large: var(--radius-large);
  --radius-full: var(--radius-full);

  --font-display: var(--font-display);
  --font-body: var(--font-body);
}
`;

writeFileSync(outPath, css, "utf8");
console.log(`Wrote ${outPath}`);
