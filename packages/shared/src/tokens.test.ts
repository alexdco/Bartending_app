import { describe, expect, it } from "vitest";
import { colors, verifiedContrastPairs } from "./tokens";
import { contrastRatio } from "./contrastRatio";

describe("token contrast pairs", () => {
  for (const pair of verifiedContrastPairs) {
    it(`${pair.name} (${pair.theme}) meets ${pair.minRatio}:1`, () => {
      const theme = colors[pair.theme];
      const ratio = contrastRatio(theme[pair.foreground], theme[pair.background]);
      expect(ratio).toBeGreaterThanOrEqual(pair.minRatio);
    });
  }
});
