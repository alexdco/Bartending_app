import { describe, expect, it } from "vitest";
import { validateRegionProposals, type RegionProposal } from "./regionProposals";

function proposal(overrides: Partial<RegionProposal>): RegionProposal {
  return {
    id: "r1",
    name: "Negroni",
    region: "Italian",
    fame_score: 90,
    reasoning: "",
    ...overrides,
  };
}

describe("validateRegionProposals (spec 0038 AC-1)", () => {
  it("accepts a fame score with a region", () => {
    expect(validateRegionProposals([proposal({})])).toEqual([]);
  });

  it("accepts a fame score with a null region", () => {
    expect(validateRegionProposals([proposal({ region: null, fame_score: 12 })])).toEqual([]);
  });

  it("accepts the range ends 0 and 100", () => {
    expect(
      validateRegionProposals([proposal({ fame_score: 0 }), proposal({ fame_score: 100 })]),
    ).toEqual([]);
  });

  it("rejects a missing fame score", () => {
    expect(validateRegionProposals([proposal({ region: null, fame_score: null })])).toEqual([
      "r1 (Negroni): fame_score is missing",
    ]);
  });

  it("rejects a fame score absent from the JSON entirely", () => {
    const withoutScore = Object.fromEntries(
      Object.entries(proposal({})).filter(([key]) => key !== "fame_score"),
    ) as unknown as RegionProposal;
    expect(validateRegionProposals([withoutScore])).toEqual([
      "r1 (Negroni): fame_score is missing",
    ]);
  });

  it("rejects an out of range fame score", () => {
    expect(validateRegionProposals([proposal({ fame_score: 101 })])).toEqual([
      "r1 (Negroni): fame_score 101 is out of range 0 to 100",
    ]);
  });

  it("rejects a region outside the fixed list", () => {
    expect(validateRegionProposals([proposal({ region: "Peruvian" })])).toEqual([
      'r1 (Negroni): region "Peruvian" is not in the fixed list',
    ]);
  });
});
