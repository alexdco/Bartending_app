import { describe, expect, it } from "vitest";
import {
  findIgnoredOverrides,
  formatFameReport,
  formatFreshnessReport,
  parseImportReport,
} from "./freshnessReport";

const margarita = { sourceId: "11007", name: "Margarita" };
const cloverClub = { sourceId: "custom:clover-club", name: "Clover Club" };
const mojito = { sourceId: "11000", name: "Mojito" };

describe("parseImportReport (spec 0056 AC-13)", () => {
  it("reads every list import_catalog returns", () => {
    expect(
      parseImportReport({
        lockedSkipped: [margarita],
        changedUpstream: [margarita],
        keptMissing: [mojito],
        lockedStillDeleted: [],
      }),
    ).toEqual({
      data: {
        lockedSkipped: [margarita],
        changedUpstream: [margarita],
        keptMissing: [mojito],
        lockedStillDeleted: [],
      },
      error: null,
    });
  });

  it("treats a missing shared list as empty and leaves the TheCocktailDB only lists out", () => {
    expect(parseImportReport({})).toEqual({
      data: { lockedSkipped: [], changedUpstream: [] },
      error: null,
    });
  });

  it("returns an error, not a throw, for an unexpected shape", () => {
    const result = parseImportReport(null);
    expect(result.data).toBeNull();
    expect(result.error).toEqual(expect.any(String));
  });
});

describe("findIgnoredOverrides (spec 0056 AC-13)", () => {
  it("lists locked recipes whose override changes content", () => {
    expect(
      findIgnoredOverrides(
        {
          "11007": { name: "Margarita (IBA)" },
          "11000": { addIngredients: [{ ingredientName: "Soda", measure: null }] },
          "11001": { instructions: "Stir." },
        },
        [margarita, mojito],
      ),
    ).toEqual([margarita, mojito]);
  });

  it("skips review only entries and unlocked recipes", () => {
    expect(
      findIgnoredOverrides(
        { "11007": { reviewed: true, note: "checked" }, "11001": { name: "X" } },
        [margarita],
      ),
    ).toEqual([]);
  });
});

describe("formatFreshnessReport (spec 0056 AC-13)", () => {
  it("prints each TheCocktailDB list with its count and entries", () => {
    expect(
      formatFreshnessReport(
        {
          lockedSkipped: [margarita, mojito],
          changedUpstream: [margarita],
          keptMissing: [],
          lockedStillDeleted: [mojito],
        },
        [margarita],
      ),
    ).toEqual([
      "Freshness report:",
      "  locked recipes skipped: 2",
      "    11007  Margarita",
      "    11000  Mojito",
      "  locked recipes changed upstream: 1",
      "    11007  Margarita",
      "  locked recipes kept though gone from source: 0",
      "  locked recipes still deleted (Reset brings them back): 1",
      "    11000  Mojito",
      "  overrides ignored because the recipe is locked: 1",
      "    11007  Margarita",
    ]);
  });

  it("prints only the shared lists for the custom import", () => {
    expect(formatFreshnessReport({ lockedSkipped: [cloverClub], changedUpstream: [] })).toEqual([
      "Freshness report:",
      "  locked recipes skipped: 1",
      "    custom:clover-club  Clover Club",
      "  locked recipes changed upstream: 0",
    ]);
  });
});

describe("formatFameReport (spec 0056 AC-9, AC-13)", () => {
  it("prints scored, still unscored, and waiting counts with the recipes", () => {
    expect(
      formatFameReport({
        data: {
          scored: [{ id: "a", name: "Mojito" }],
          unscored: [{ id: "b", name: "Zombie" }],
          waiting: [],
        },
        error: null,
      }),
    ).toEqual([
      "Fame scoring:",
      "  recipes scored: 1",
      "  recipes still unscored: 1",
      "    b  Zombie",
      "  waiting for the next run: 0",
    ]);
  });

  it("prints a warning and the unscored recipes when the step failed", () => {
    expect(
      formatFameReport({
        data: null,
        error: { message: "apply failed", unscored: [{ id: "b", name: "Zombie" }] },
      }),
    ).toEqual([
      "Fame scoring step failed; the next import run picks these up: apply failed",
      "  recipes still unscored: 1",
      "    b  Zombie",
    ]);
  });
});
