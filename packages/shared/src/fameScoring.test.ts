import { describe, expect, it } from "vitest";
import { chunk, splitAtCap, toFameArrivalPayload, type UnscoredRecipeRow } from "./fameScoring";
import type { RegionProposal } from "./regionProposals";

const row = (id: string, region: string | null): UnscoredRecipeRow => ({
  id,
  name: `Recipe ${id}`,
  instructions: "Stir.",
  region,
  ingredientNames: [],
});

const proposal = (id: string, region: string | null, fame: number | null): RegionProposal => ({
  id,
  name: `Recipe ${id}`,
  region,
  fame_score: fame,
  reasoning: "",
});

describe("chunk", () => {
  it("splits into consecutive batches with a short last one", () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(chunk([], 25)).toEqual([]);
  });
});

describe("splitAtCap (spec 0056 AC-9)", () => {
  it("scores up to the cap and leaves the rest waiting, in order", () => {
    expect(splitAtCap(["a", "b", "c"], 2)).toEqual({ batch: ["a", "b"], waiting: ["c"] });
    expect(splitAtCap(["a"], 200)).toEqual({ batch: ["a"], waiting: [] });
  });
});

describe("toFameArrivalPayload region rule (spec 0056 AC-9)", () => {
  it("takes the proposed region only when the recipe has none", () => {
    expect(
      toFameArrivalPayload(
        [proposal("1", "Cuban", 80), proposal("2", "Cuban", 40)],
        [row("1", null), row("2", "British")],
      ),
    ).toEqual([
      { id: "1", region: "Cuban", fame_score: 80 },
      { id: "2", region: "British", fame_score: 40 },
    ]);
  });

  it("keeps a null region when neither side has one", () => {
    expect(toFameArrivalPayload([proposal("1", null, 10)], [row("1", null)])).toEqual([
      { id: "1", region: null, fame_score: 10 },
    ]);
  });

  it("drops proposals for recipes outside the batch or without a score", () => {
    expect(
      toFameArrivalPayload(
        [proposal("9", "Cuban", 50), proposal("1", "Cuban", null)],
        [row("1", null)],
      ),
    ).toEqual([]);
  });
});
