import { describe, expect, it } from "vitest";
import { toRecipeNotePayload, validateRecipeNoteProposals } from "./recipeNoteProposals";

const margarita = {
  id: "d6aa9b01-16e2-49e9-a02b-5386edd831a8",
  name: "Margarita",
  drink_style: "sour",
  drink_style_note: " A tequila sour balanced by lime and orange liqueur. ",
  bartender_tip: "Shake hard with plenty of ice so it comes out cold and lightly diluted.",
  presentation_tip: "Salt only half the rim so each sip is the guest's choice.",
  es: {
    drink_style_note: "Un sour de tequila equilibrado con limón y licor de naranja.",
    bartender_tip: "Agita con fuerza y mucho hielo para que salga frío y algo diluido.",
    presentation_tip: "Escarcha solo medio borde con sal para que cada sorbo sea opcional.",
  },
};

describe("validateRecipeNoteProposals", () => {
  it("accepts a good file", () => {
    expect(validateRecipeNoteProposals([margarita]).ok).toBe(true);
  });

  it("rejects a family outside the fixed set", () => {
    expect(validateRecipeNoteProposals([{ ...margarita, drink_style: "martini" }]).ok).toBe(false);
  });

  it("rejects an empty or whitespace only text", () => {
    expect(validateRecipeNoteProposals([{ ...margarita, bartender_tip: "" }]).ok).toBe(false);
    expect(validateRecipeNoteProposals([{ ...margarita, presentation_tip: " \n " }]).ok).toBe(
      false,
    );
  });

  it("rejects a missing ES block", () => {
    const withoutEs = { ...margarita, es: undefined };
    expect(validateRecipeNoteProposals([withoutEs]).ok).toBe(false);
  });

  it("rejects a 241 code point Spanish text and accepts 240", () => {
    const tooLong = "ñ".repeat(240) + "🍋";
    const result = validateRecipeNoteProposals([
      { ...margarita, es: { ...margarita.es, bartender_tip: tooLong } },
    ]);
    expect(result).toEqual({
      ok: false,
      errors: ["0.es.bartender_tip (Margarita): is over 240 characters"],
    });
    expect(
      validateRecipeNoteProposals([
        { ...margarita, es: { ...margarita.es, bartender_tip: "🍋".repeat(240) } },
      ]).ok,
    ).toBe(true);
  });

  it("rejects a duplicate id", () => {
    expect(validateRecipeNoteProposals([margarita, margarita])).toEqual({
      ok: false,
      errors: [`${margarita.id}: appears more than once`],
    });
  });
});

describe("toRecipeNotePayload", () => {
  it("trims the texts and drops the name", () => {
    const result = validateRecipeNoteProposals([margarita]);
    if (!result.ok) throw new Error("expected a valid file");
    const [row] = toRecipeNotePayload(result.proposals);
    expect(row).not.toHaveProperty("name");
    expect(row?.drink_style_note).toBe("A tequila sour balanced by lime and orange liqueur.");
  });
});
