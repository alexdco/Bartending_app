import { describe, expect, it } from "vitest";
import type { OverriddenDrink } from "./overrides";
import {
  diffLockFields,
  findLockCandidates,
  parseLockCandidatesFile,
  type StoredLockRow,
} from "./lockDiff";

const source = (overrides: Partial<OverriddenDrink["recipe"]> = {}): OverriddenDrink => ({
  recipe: {
    sourceId: "11007",
    name: "Margarita",
    instructions: "Shake with ice.",
    instructionsOverride: false,
    imageUrl: null,
    glass: "Coupe",
    alcoholicStatus: "alcoholic",
    iba: "Contemporary Classics",
    ...overrides,
  },
  ingredients: [
    {
      ingredientName: "Tequila",
      measure: "1 1/2 oz ",
      sortOrder: 1,
      amountValue: 1.5,
      amountMaxValue: null,
      amountUnit: "oz",
    },
    {
      ingredientName: "Lime  Juice",
      measure: "1 oz",
      sortOrder: 2,
      amountValue: 1,
      amountMaxValue: null,
      amountUnit: "oz",
    },
    {
      ingredientName: "Salt",
      measure: " ",
      sortOrder: 3,
      amountValue: null,
      amountMaxValue: null,
      amountUnit: null,
    },
  ],
  tags: [{ tagName: "IBA" }, { tagName: "Fruity" }],
});

// What the import stored for that source, saved once unchanged through the
// admin form: measures trimmed, blank as null, order renumbered from 0.
const stored = (overrides: Partial<StoredLockRow> = {}): StoredLockRow => ({
  sourceId: "11007",
  name: "Margarita",
  glass: "coupe",
  alcoholicStatus: "alcoholic",
  ingredients: [
    { normalizedName: "tequila", measure: "1 1/2 oz", sortOrder: 0 },
    { normalizedName: "lime juice", measure: "1 oz", sortOrder: 1 },
    { normalizedName: "salt", measure: null, sortOrder: 2 },
  ],
  catalogTags: ["iba"],
  ...overrides,
});

// "Fruity" is a taste tag, so the import links it as taste, never catalog.
const tasteTags = new Set(["fruity"]);

describe("diffLockFields (spec 0056 AC-8)", () => {
  it("reports nothing for a recipe that matches its source after normalization", () => {
    expect(diffLockFields(stored(), source(), tasteTags)).toEqual([]);
  });

  it("reports a changed name", () => {
    expect(diffLockFields(stored({ name: "Classic Margarita" }), source(), tasteTags)).toEqual([
      "name",
    ]);
  });

  it("reports a changed glass, ignoring case and spaces", () => {
    expect(diffLockFields(stored({ glass: " COUPE " }), source(), tasteTags)).toEqual([]);
    expect(diffLockFields(stored({ glass: null }), source(), tasteTags)).toEqual(["glass"]);
  });

  it("reports a changed alcoholic status", () => {
    expect(diffLockFields(stored({ alcoholicStatus: "optional" }), source(), tasteTags)).toEqual([
      "alcoholicStatus",
    ]);
  });

  it("reports a changed measure, reordered lines, or a removed line", () => {
    const base = stored();
    const [tequila, lime, salt] = base.ingredients;
    if (!tequila || !lime || !salt) throw new Error("fixture");

    expect(
      diffLockFields(
        stored({ ingredients: [{ ...tequila, measure: "2 oz" }, lime, salt] }),
        source(),
        tasteTags,
      ),
    ).toEqual(["ingredients"]);
    expect(
      diffLockFields(
        stored({
          ingredients: [{ ...lime, sortOrder: 0 }, { ...tequila, sortOrder: 1 }, salt],
        }),
        source(),
        tasteTags,
      ),
    ).toEqual(["ingredients"]);
    expect(diffLockFields(stored({ ingredients: [tequila, lime] }), source(), tasteTags)).toEqual([
      "ingredients",
    ]);
  });

  it("ignores parsed amounts, instructions, and IBA", () => {
    expect(
      diffLockFields(
        stored(),
        source({ instructions: "Something else", iba: null, instructionsOverride: true }),
        tasteTags,
      ),
    ).toEqual([]);
  });

  it("compares catalog tags as a set", () => {
    expect(diffLockFields(stored({ catalogTags: [] }), source(), tasteTags)).toEqual(["tags"]);
    expect(diffLockFields(stored({ catalogTags: ["iba", "iba"] }), source(), tasteTags)).toEqual(
      [],
    );
  });

  it("collapses a repeated source ingredient the way the import stores it", () => {
    // Whiskey Sour (11004): Lemon twice becomes one row at the first
    // position with the last measure.
    const whiskeySour: OverriddenDrink = {
      ...source(),
      ingredients: [
        ["Blended Whiskey", "2 oz"],
        ["Lemon", "Juice of 1/2"],
        ["Powdered Sugar", "1/2 tsp"],
        ["Cherry", "1"],
        ["Lemon", "1/2 slice"],
      ].map(([ingredientName, measure], i) => ({
        ingredientName: ingredientName ?? "",
        measure: measure ?? null,
        sortOrder: i + 1,
        amountValue: null,
        amountMaxValue: null,
        amountUnit: null,
      })),
    };
    const storedLines = [
      { normalizedName: "blended whiskey", measure: "2 oz", sortOrder: 1 },
      { normalizedName: "lemon", measure: "1/2 slice", sortOrder: 2 },
      { normalizedName: "powdered sugar", measure: "1/2 tsp", sortOrder: 3 },
      { normalizedName: "cherry", measure: "1", sortOrder: 4 },
    ];

    expect(diffLockFields(stored({ ingredients: storedLines }), whiskeySour, tasteTags)).toEqual(
      [],
    );
    expect(
      diffLockFields(
        stored({
          ingredients: storedLines.map((line) =>
            line.normalizedName === "lemon" ? { ...line, measure: "Juice of 1/2" } : line,
          ),
        }),
        whiskeySour,
        tasteTags,
      ),
    ).toEqual(["ingredients"]);
  });

  it("lists every differing field", () => {
    expect(diffLockFields(stored({ name: "X", catalogTags: [] }), source(), tasteTags)).toEqual([
      "name",
      "tags",
    ]);
  });
});

describe("findLockCandidates (spec 0056 AC-8)", () => {
  it("lists only differing recipes, with source id, name, and fields", () => {
    const other = stored({ sourceId: "11000", name: "Mojito" });
    const otherSource: OverriddenDrink = {
      ...source({ sourceId: "11000", name: "Mojito" }),
    };
    expect(
      findLockCandidates(
        [stored({ name: "My Margarita" }), other],
        [source(), otherSource],
        tasteTags,
      ),
    ).toEqual([{ sourceId: "11007", name: "My Margarita", fields: ["name"] }]);
  });

  it("skips a stored recipe with no drink in the payload", () => {
    expect(findLockCandidates([stored({ name: "Gone" })], [], tasteTags)).toEqual([]);
  });
});

describe("parseLockCandidatesFile (spec 0056 AC-8)", () => {
  it("returns the source ids left in the file, deduplicated", () => {
    expect(
      parseLockCandidatesFile([
        { sourceId: "11007", name: "Margarita", fields: ["name"] },
        { sourceId: "11000" },
        { sourceId: "11007" },
      ]),
    ).toEqual({ data: ["11007", "11000"], error: null });
  });

  it("accepts an empty list", () => {
    expect(parseLockCandidatesFile([])).toEqual({ data: [], error: null });
  });

  it("rejects a file that isn't a list of entries with a source id", () => {
    expect(parseLockCandidatesFile({ candidates: [] }).error).toEqual(expect.any(String));
    expect(parseLockCandidatesFile([{ name: "Margarita" }]).error).toEqual(expect.any(String));
    expect(parseLockCandidatesFile([{ sourceId: "" }]).error).toEqual(expect.any(String));
  });
});
