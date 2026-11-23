import { describe, expect, it } from "vitest";
import {
  DRAFT_TOOL_NAME,
  draftSourceIngredients,
  englishDraftText,
  parseEnglishDraft,
  type DraftMessage,
} from "./english-draft";

const toolMessage = (input: unknown, name = DRAFT_TOOL_NAME): DraftMessage => ({
  stop_reason: "tool_use",
  content: [{ type: "tool_use", name, input }],
});

const goodInput = {
  name: " Plum Sour ",
  instructions: "Shake with ice and strain.",
  glass: "",
  note: "Use ripe plums.",
  ingredients: [
    { name: "Plum wine", measure: "2 oz" },
    { name: "Lemon juice", measure: "" },
  ],
};

describe("parseEnglishDraft", () => {
  it("trims fields and turns empty strings into null", () => {
    expect(parseEnglishDraft(toolMessage(goodInput), 2)).toEqual({
      data: {
        name: "Plum Sour",
        instructions: "Shake with ice and strain.",
        glass: null,
        note: "Use ripe plums.",
        ingredients: [
          { name: "Plum wine", measure: "2 oz" },
          { name: "Lemon juice", measure: null },
        ],
      },
      error: null,
    });
  });

  it("fails when the ingredient count differs from the original", () => {
    expect(parseEnglishDraft(toolMessage(goodInput), 3)).toEqual({
      data: null,
      error: "ingredient_count_mismatch",
    });
  });

  it("fails a blank name, instructions, or ingredient name", () => {
    expect(parseEnglishDraft(toolMessage({ ...goodInput, name: " " }), 2).error).toBe(
      "missing_name",
    );
    expect(parseEnglishDraft(toolMessage({ ...goodInput, instructions: "" }), 2).error).toBe(
      "missing_instructions",
    );
    expect(
      parseEnglishDraft(
        toolMessage({
          ...goodInput,
          ingredients: [{ name: "", measure: "" }, goodInput.ingredients[1]],
        }),
        2,
      ).error,
    ).toBe("missing_ingredient_name");
  });

  it("fails a refusal, a missing tool call, or a non object input", () => {
    expect(parseEnglishDraft({ stop_reason: "refusal", content: [] }, 2).error).toBe(
      "stop_reason:refusal",
    );
    expect(parseEnglishDraft(toolMessage(goodInput, "other"), 2).error).toBe("no_tool_call");
    expect(parseEnglishDraft(toolMessage(null), 2).error).toBe("bad_input");
    expect(parseEnglishDraft(toolMessage({ ...goodInput, ingredients: "x" }), 2).error).toBe(
      "bad_ingredients",
    );
  });
});

describe("englishDraftText", () => {
  it("wraps the submission as JSON inside the submission tag", () => {
    const text = englishDraftText({
      locale: "ja",
      name: "梅サワー",
      instructions: "シェイクする。",
      ingredients: [{ name: "梅酒", measure: "60ml" }, { name: "レモン", measure: null }, 7],
      glass: null,
      note: null,
    });
    const json = text.slice("<submission>\n".length, text.indexOf("\n</submission>"));
    expect(JSON.parse(json)).toEqual({
      language: "ja",
      name: "梅サワー",
      ingredients: [
        { name: "梅酒", measure: "60ml" },
        { name: "レモン", measure: null },
      ],
      instructions: "シェイクする。",
      glass: "",
      note: "",
    });
  });
});

describe("draftSourceIngredients", () => {
  it("returns an empty list for anything but an array", () => {
    expect(draftSourceIngredients(null)).toEqual([]);
    expect(draftSourceIngredients({ name: "Gin" })).toEqual([]);
  });
});
