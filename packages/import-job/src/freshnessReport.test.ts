import { describe, expect, it } from "vitest";
import { formatFreshnessReport, parseImportReport } from "./freshnessReport";

describe("parseImportReport (spec 0056 AC-13)", () => {
  it("reads the lockedSkipped list the import RPCs return", () => {
    expect(
      parseImportReport({ lockedSkipped: [{ sourceId: "11007", name: "Margarita" }] }),
    ).toEqual({
      data: { lockedSkipped: [{ sourceId: "11007", name: "Margarita" }] },
      error: null,
    });
  });

  it("treats a missing list as empty", () => {
    expect(parseImportReport({})).toEqual({ data: { lockedSkipped: [] }, error: null });
  });

  it("returns an error, not a throw, for an unexpected shape", () => {
    const result = parseImportReport(null);
    expect(result.data).toBeNull();
    expect(result.error).toEqual(expect.any(String));
  });
});

describe("formatFreshnessReport (spec 0056 AC-13)", () => {
  it("prints the count and each locked recipe", () => {
    expect(
      formatFreshnessReport({
        lockedSkipped: [
          { sourceId: "11007", name: "Margarita" },
          { sourceId: "custom:clover-club", name: "Clover Club" },
        ],
      }),
    ).toEqual([
      "Freshness report:",
      "  locked recipes skipped: 2",
      "    11007  Margarita",
      "    custom:clover-club  Clover Club",
    ]);
  });

  it("prints a zero count with no entries", () => {
    expect(formatFreshnessReport({ lockedSkipped: [] })).toEqual([
      "Freshness report:",
      "  locked recipes skipped: 0",
    ]);
  });
});
