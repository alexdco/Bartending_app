import { describe, expect, it } from "vitest";
import { contrastRatio } from "./contrastRatio";

// covers: AC-5 (the math every WCAG contrast assertion in tokens.test.ts relies on)
describe("contrastRatio", () => {
  it("returns 21 for black on white, the WCAG maximum", () => {
    expect(contrastRatio("#000000", "#FFFFFF")).toBeCloseTo(21, 5);
  });

  it("returns 1 for a color against itself", () => {
    expect(contrastRatio("#1E763B", "#1E763B")).toBeCloseTo(1, 5);
  });

  it("gives the same ratio regardless of argument order", () => {
    expect(contrastRatio("#181818", "#F7F7F5")).toBeCloseTo(
      contrastRatio("#F7F7F5", "#181818"),
      10,
    );
  });

  it("treats upper and lower case hex as the same color", () => {
    expect(contrastRatio("#a3a3a3", "#1c1c1c")).toBeCloseTo(
      contrastRatio("#A3A3A3", "#1C1C1C"),
      10,
    );
  });

  it("accepts hex without a leading hash", () => {
    expect(contrastRatio("000000", "ffffff")).toBeCloseTo(21, 5);
  });

  it("matches the known WCAG reference value for #777777 on white (just under 4.5)", () => {
    const ratio = contrastRatio("#777777", "#FFFFFF");
    expect(ratio).toBeCloseTo(4.48, 2);
    expect(ratio).toBeLessThan(4.5);
  });

  it("matches the known reference value for #767676 on white (the lightest AA grey)", () => {
    expect(contrastRatio("#767676", "#FFFFFF")).toBeGreaterThanOrEqual(4.5);
  });

  it("uses the low luminance linear segment for very dark channels", () => {
    // #010101 sits below the 0.03928 sRGB threshold, so it must use value / 12.92.
    // The three luminance weights sum to 1, so a grey's luminance equals its channel value.
    const darkLuminance = 1 / 255 / 12.92;
    const expected = (1 + 0.05) / (darkLuminance + 0.05);
    expect(contrastRatio("#010101", "#FFFFFF")).toBeCloseTo(expected, 10);
  });
});
