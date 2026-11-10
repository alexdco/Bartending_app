import { describe, expect, it } from "vitest";
import { normalizeFrenchTypography } from "./frenchTypography";

const NNBSP = "\u202F";
const NBSP = "\u00A0";

describe("normalizeFrenchTypography", () => {
  it("puts a narrow no break space before ; ! ?", () => {
    expect(normalizeFrenchTypography("Santé !")).toBe(`Santé${NNBSP}!`);
    expect(normalizeFrenchTypography("Santé!")).toBe(`Santé${NNBSP}!`);
    expect(normalizeFrenchTypography("Prêt ? Secouez ; servez.")).toBe(
      `Prêt${NNBSP}? Secouez${NNBSP}; servez.`,
    );
    expect(normalizeFrenchTypography("Vraiment?!")).toBe(`Vraiment${NNBSP}?!`);
  });

  it("puts a no break space before a clause ending colon", () => {
    expect(normalizeFrenchTypography("Note: secouez fort.")).toBe(`Note${NBSP}: secouez fort.`);
    expect(normalizeFrenchTypography("Note : secouez fort.")).toBe(`Note${NBSP}: secouez fort.`);
    expect(normalizeFrenchTypography("Ingrédients:")).toBe(`Ingrédients${NBSP}:`);
  });

  it("turns straight and curly quote pairs into guillemets", () => {
    expect(normalizeFrenchTypography('Un "shaker" en métal.')).toBe(
      `Un «${NNBSP}shaker${NNBSP}» en métal.`,
    );
    expect(normalizeFrenchTypography("Un “shaker” en métal.")).toBe(
      `Un «${NNBSP}shaker${NNBSP}» en métal.`,
    );
    expect(normalizeFrenchTypography("Un « shaker » en métal.")).toBe(
      `Un «${NNBSP}shaker${NNBSP}» en métal.`,
    );
  });

  it("spaces a mark inside guillemets", () => {
    expect(normalizeFrenchTypography('"Santé !"')).toBe(`«${NNBSP}Santé${NNBSP}!${NNBSP}»`);
  });

  it("leaves times and URLs alone", () => {
    expect(normalizeFrenchTypography("Ouvert à 14:30.")).toBe("Ouvert à 14:30.");
    expect(normalizeFrenchTypography("Voir https://example.com/?q=gin;x=1 pour plus.")).toBe(
      "Voir https://example.com/?q=gin;x=1 pour plus.",
    );
  });

  it("never adds a space at the very start", () => {
    expect(normalizeFrenchTypography("!")).toBe("!");
  });

  it("returns already correct text unchanged, and is idempotent", () => {
    const correct = `«${NNBSP}Santé${NNBSP}!${NNBSP}» Note${NBSP}: prêt${NNBSP}?`;
    expect(normalizeFrenchTypography(correct)).toBe(correct);

    const messy = 'Note: un "shaker" ! Prêt ? Oui; 14:30.';
    const once = normalizeFrenchTypography(messy);
    expect(normalizeFrenchTypography(once)).toBe(once);
  });
});
