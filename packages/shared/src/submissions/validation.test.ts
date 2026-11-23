import { describe, expect, it } from "vitest";
import {
  submissionTextLength,
  toSubmissionIngredients,
  trimSubmissionText,
  validateRejectionReason,
  validateSubmissionForm,
  type SubmissionFormValues,
} from "./validation";

const valid: SubmissionFormValues = {
  name: "Garden Sour",
  ingredients: [
    { name: "Gin", measure: "2 oz" },
    { name: "Lime juice", measure: "" },
  ],
  instructions: "Shake with ice and strain.",
  glass: "",
  alcoholicStatus: "alcoholic",
  note: "",
  displayName: "",
};

const fields = (values: Partial<SubmissionFormValues>, requireDisplayName = false) =>
  validateSubmissionForm({ ...valid, ...values }, { requireDisplayName });

describe("validateSubmissionForm (spec 0064 AC-2, AC-3)", () => {
  it("accepts a valid submission", () => {
    expect(fields({})).toEqual([]);
  });

  it("requires a name and caps it at 100 characters after trimming", () => {
    expect(fields({ name: "   " })).toEqual([{ field: "name", reason: "required" }]);
    expect(fields({ name: `  ${"x".repeat(100)}  ` })).toEqual([]);
    expect(fields({ name: "x".repeat(101) })).toEqual([{ field: "name", reason: "too_long" }]);
  });

  it("counts characters like Postgres, so an emoji is one character", () => {
    expect(submissionTextLength("🍋".repeat(100))).toBe(100);
    expect(fields({ name: "🍋".repeat(100) })).toEqual([]);
  });

  it("requires 1 to 20 ingredients, ignoring untouched rows", () => {
    expect(fields({ ingredients: [{ name: " ", measure: " " }] })).toEqual([
      { field: "ingredients", reason: "required" },
    ]);
    const many = Array.from({ length: 21 }, (_, i) => ({ name: `Ing ${i}`, measure: "" }));
    expect(fields({ ingredients: many })).toEqual([{ field: "ingredients", reason: "too_many" }]);
    expect(fields({ ingredients: many.slice(0, 20) })).toEqual([]);
  });

  it("flags a measure with no name, and long names and measures, by row", () => {
    expect(
      fields({
        ingredients: [
          { name: "Gin", measure: "x".repeat(51) },
          { name: "", measure: "1 oz" },
          { name: "y".repeat(81), measure: "" },
        ],
      }),
    ).toEqual([
      { field: "ingredients", reason: "measure_too_long", index: 0 },
      { field: "ingredients", reason: "name_required", index: 1 },
      { field: "ingredients", reason: "name_too_long", index: 2 },
    ]);
  });

  it("requires instructions and caps them at 2,000", () => {
    expect(fields({ instructions: "\n\t " })).toEqual([
      { field: "instructions", reason: "required" },
    ]);
    expect(fields({ instructions: "x".repeat(2001) })).toEqual([
      { field: "instructions", reason: "too_long" },
    ]);
  });

  it("caps the note at 300 and the glass at 100", () => {
    expect(fields({ note: "x".repeat(300) })).toEqual([]);
    expect(fields({ note: "x".repeat(301) })).toEqual([{ field: "note", reason: "too_long" }]);
    expect(fields({ glass: "x".repeat(101) })).toEqual([{ field: "glass", reason: "too_long" }]);
  });

  it("only accepts the existing alcoholic status values", () => {
    expect(fields({ alcoholicStatus: "non_alcoholic" })).toEqual([]);
    expect(fields({ alcoholicStatus: "boozy" })).toEqual([
      { field: "alcoholicStatus", reason: "invalid" },
    ]);
  });

  it("checks the display name only when the form asks for one", () => {
    expect(fields({ displayName: "" })).toEqual([]);
    expect(fields({ displayName: " " }, true)).toEqual([
      { field: "displayName", reason: "required" },
    ]);
    expect(fields({ displayName: "x".repeat(51) }, true)).toEqual([
      { field: "displayName", reason: "too_long" },
    ]);
    expect(fields({ displayName: " Sam " }, true)).toEqual([]);
  });
});

describe("toSubmissionIngredients", () => {
  it("trims, turns a blank measure into null, and drops empty rows", () => {
    expect(
      toSubmissionIngredients([
        { name: " Gin ", measure: " 2 oz " },
        { name: "Lime", measure: "  " },
        { name: "", measure: "" },
      ]),
    ).toEqual([
      { name: "Gin", measure: "2 oz" },
      { name: "Lime", measure: null },
    ]);
  });
});

describe("trimSubmissionText", () => {
  it("trims spaces, tabs, and line breaks like the database", () => {
    expect(trimSubmissionText("\t Garden Sour \r\n")).toBe("Garden Sour");
  });
});

describe("validateRejectionReason", () => {
  it("requires a non blank reason", () => {
    expect(validateRejectionReason(" \n ")).toBe("required");
  });

  it("allows 500 characters after trimming and refuses 501", () => {
    expect(validateRejectionReason(` ${"r".repeat(500)} `)).toBeNull();
    expect(validateRejectionReason("r".repeat(501))).toBe("too_long");
  });
});
