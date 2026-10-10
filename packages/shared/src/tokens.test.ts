import { describe, expect, it } from "vitest";
import { colors, radii, spacing, typeScale, verifiedContrastPairs } from "./tokens";
import { contrastRatio } from "./contrastRatio";

// covers: AC-5
describe("token contrast pairs", () => {
  for (const pair of verifiedContrastPairs) {
    it(`${pair.name} (${pair.theme}) meets ${pair.minRatio}:1`, () => {
      const theme = colors[pair.theme];
      const ratio = contrastRatio(theme[pair.foreground], theme[pair.background]);
      expect(ratio).toBeGreaterThanOrEqual(pair.minRatio);
    });
  }

  it("verifies the same set of pairs in both themes", () => {
    const pairsFor = (theme: "dark" | "light") =>
      verifiedContrastPairs
        .filter((pair) => pair.theme === theme)
        .map((pair) => `${pair.foreground}/${pair.background}/${pair.minRatio}`)
        .sort();

    expect(pairsFor("light")).toEqual(pairsFor("dark"));
  });

  it("holds every text pair to at least the 4.5:1 AA body text minimum", () => {
    const textForegrounds = new Set(["text", "textMuted", "accentText", "dangerText"]);
    const textPairs = verifiedContrastPairs.filter((pair) => textForegrounds.has(pair.foreground));

    expect(textPairs.length).toBeGreaterThan(0);
    expect(textPairs.every((pair) => pair.minRatio >= 4.5)).toBe(true);
  });
});

// covers: AC-1, AC-2
describe("color tokens", () => {
  it("defines exactly the same token names in the dark and light themes", () => {
    expect(Object.keys(colors.light).sort()).toEqual(Object.keys(colors.dark).sort());
  });

  for (const theme of ["dark", "light"] as const) {
    it(`uses six digit hex values for every ${theme} token`, () => {
      const invalid = Object.entries(colors[theme]).filter(
        ([, value]) => !/^#[0-9a-fA-F]{6}$/.test(value),
      );
      expect(invalid).toEqual([]);
    });
  }
});

// covers: AC-1
describe("scale tokens", () => {
  it("orders spacing steps from smallest to largest", () => {
    const values = Object.values(spacing);
    expect(values).toEqual([...values].sort((a, b) => a - b));
  });

  it("orders radii from smallest to largest, ending with the pill radius", () => {
    const values = Object.values(radii);
    expect(values).toEqual([...values].sort((a, b) => a - b));
    expect(radii.full).toBe(9999);
  });

  it("orders the type scale from display down to label", () => {
    const sizes = Object.values(typeScale).map((entry) => entry.size);
    expect(sizes).toEqual([...sizes].sort((a, b) => b - a));
  });

  it("keeps every line height in a readable unitless range", () => {
    const outOfRange = Object.entries(typeScale).filter(
      ([, entry]) => entry.lineHeight < 1 || entry.lineHeight > 2,
    );
    expect(outOfRange).toEqual([]);
  });
});
