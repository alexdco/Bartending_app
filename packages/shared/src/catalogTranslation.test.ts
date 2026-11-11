import { describe, expect, it } from "vitest";
import {
  localeTypography,
  nameTranslationPrompt,
  needsRecipeTranslation,
  translatableMeasures,
} from "./catalogTranslation";
import { LOCALE_AI_TERMS } from "./locale";

// covers: spec 0047 AC-2. The Russian terms (address the reader, « » quotes)
// once turned whole batches of tag names into quoted sentences.
describe("nameTranslationPrompt", () => {
  const batch = [
    { id: "t1", name: "Sweet" },
    { id: "t2", name: "Aromatic" },
  ];
  const prompt = nameTranslationPrompt("Russian", LOCALE_AI_TERMS.ru, "tag", batch);

  it("asks for the bare name, with no quotes, description, or sentence", () => {
    expect(prompt).toContain(
      "return only the translated name itself, with no quotes, no description, and no sentence",
    );
  });

  it("puts the label guard before the locale terms, so it frames them", () => {
    expect(prompt.indexOf("short label")).toBeGreaterThan(-1);
    expect(prompt.indexOf("short label")).toBeLessThan(prompt.indexOf(LOCALE_AI_TERMS.ru));
  });

  it("still carries the locale terms and every name by id", () => {
    expect(prompt).toContain(LOCALE_AI_TERMS.ru);
    expect(prompt).toContain("id: t1\nname: Sweet\n---\nid: t2\nname: Aromatic");
  });
});

describe("needsRecipeTranslation", () => {
  const ingredients = [
    { measure: "2 oz", translated: true },
    { measure: null, translated: false },
  ];

  it("skips a recipe whose hash matches and whose measures are all translated", () => {
    expect(needsRecipeTranslation({ hash: "h", existingHash: "h", ingredients })).toBe(false);
  });

  it("translates a new recipe or one whose English text changed", () => {
    expect(needsRecipeTranslation({ hash: "h", existingHash: undefined, ingredients })).toBe(true);
    expect(needsRecipeTranslation({ hash: "h2", existingHash: "h", ingredients })).toBe(true);
  });

  it("translates a recipe whose measure translations were cascaded away by a reimport", () => {
    const reimported = [
      { measure: "2 oz", translated: false },
      { measure: null, translated: false },
    ];
    expect(needsRecipeTranslation({ hash: "h", existingHash: "h", ingredients: reimported })).toBe(
      true,
    );
  });
});

describe("translatableMeasures", () => {
  const source = [
    { ingredient_id: "gin", measure: "2 oz" },
    { ingredient_id: "mint", measure: null },
  ];

  it("drops a measure the English line never had", () => {
    const translated = [
      { ingredient_id: "gin", measure: "60 ml" },
      { ingredient_id: "mint", measure: "(nenhum)" },
    ];
    expect(translatableMeasures(source, translated)).toEqual([
      { ingredient_id: "gin", measure: "60 ml" },
    ]);
  });

  it("drops a null measure and an unknown ingredient", () => {
    const translated = [
      { ingredient_id: "gin", measure: null },
      { ingredient_id: "rum", measure: "1 oz" },
    ];
    expect(translatableMeasures(source, translated)).toEqual([]);
  });
});

describe("localeTypography", () => {
  it("applies French typography to fr output only", () => {
    expect(localeTypography("fr")("Santé !")).toBe("Santé\u202F!");
    expect(localeTypography("es")("¡Salud !")).toBe("¡Salud !");
    expect(localeTypography("pt")('Um "shaker"')).toBe('Um "shaker"');
  });

  // covers: spec 0047 AC-1
  it("applies Russian typography to ru output", () => {
    expect(localeTypography("ru")('Коктейль "Мохито" - классика.')).toBe(
      "Коктейль «Мохито» — классика.",
    );
  });
});
