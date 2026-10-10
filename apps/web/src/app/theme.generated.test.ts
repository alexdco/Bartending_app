import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { colors, radii, spacing, typeScale, type ColorTokens } from "@bartendingapp/shared";

// The web theme is generated from packages/shared/src/tokens.ts by
// scripts/generate-theme-css.mjs (runs before dev/build). If these fail after a
// token change, regenerate with `pnpm --filter web run generate-theme`.

const css = readFileSync(new URL("./theme.generated.css", import.meta.url), "utf8");

function kebab(name: string): string {
  return name.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();
}

/** Declarations of the first block whose opening line is exactly `selector {`. */
function declarationsOf(selector: string): ReadonlyMap<string, string> {
  const start = css.indexOf(`${selector} {`);
  if (start === -1) {
    throw new Error(`selector not found in theme.generated.css: ${selector}`);
  }
  const bodyStart = css.indexOf("{", start) + 1;
  const bodyEnd = css.indexOf("}", bodyStart);
  const body = css.slice(bodyStart, bodyEnd);
  return new Map(
    [...body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map(([, name, value]) => [
      name,
      value.trim().toLowerCase(),
    ]),
  );
}

function expectedColorVars(theme: ColorTokens): ReadonlyArray<[string, string]> {
  return Object.entries(theme).map(([name, value]) => [
    `--color-${kebab(name)}`,
    value.toLowerCase(),
  ]);
}

// covers: AC-1, AC-2
describe("theme.generated.css color themes", () => {
  it("uses the dark theme on bare :root, so dark is the default with no preference", () => {
    const root = declarationsOf(":root");
    for (const [name, value] of expectedColorVars(colors.dark)) {
      expect(root.get(name), name).toBe(value);
    }
  });

  it("switches to the light theme when the OS prefers light and no dark override is set", () => {
    expect(css).toMatch(
      /@media \(prefers-color-scheme: light\)\s*\{\s*:root:not\(\[data-theme="dark"\]\)/,
    );
    const light = declarationsOf(':root:not([data-theme="dark"])');
    for (const [name, value] of expectedColorVars(colors.light)) {
      expect(light.get(name), name).toBe(value);
    }
  });

  it("forces the light theme when data-theme is light", () => {
    const forced = declarationsOf(':root[data-theme="light"]');
    for (const [name, value] of expectedColorVars(colors.light)) {
      expect(forced.get(name), name).toBe(value);
    }
  });

  it("forces the dark theme when data-theme is dark", () => {
    const forced = declarationsOf(':root[data-theme="dark"]');
    for (const [name, value] of expectedColorVars(colors.dark)) {
      expect(forced.get(name), name).toBe(value);
    }
  });

  it("exposes every color token to Tailwind through the @theme block", () => {
    const themeBlock = declarationsOf("@theme inline");
    for (const name of Object.keys(colors.dark)) {
      const variable = `--color-${kebab(name)}`;
      expect(themeBlock.get(variable), variable).toBe(`var(${variable})`);
    }
  });
});

// covers: AC-1
describe("theme.generated.css scale tokens", () => {
  const root = declarationsOf(":root");

  it("emits every spacing token in px", () => {
    for (const [name, value] of Object.entries(spacing)) {
      expect(root.get(`--spacing-${kebab(name)}`), name).toBe(`${value}px`);
    }
  });

  it("emits every radius token in px", () => {
    for (const [name, value] of Object.entries(radii)) {
      expect(root.get(`--radius-${kebab(name)}`), name).toBe(`${value}px`);
    }
  });

  it("emits every type scale size and line height", () => {
    for (const [name, entry] of Object.entries(typeScale)) {
      expect(root.get(`--text-${kebab(name)}`), name).toBe(`${entry.size}px`);
      expect(root.get(`--leading-${kebab(name)}`), name).toBe(String(entry.lineHeight));
    }
  });
});
