import { describe, expect, it } from "vitest";
import {
  localeNameTypography,
  localeTypography,
  nameTranslationPrompt,
  needsRecipeTranslation,
  selectsRow,
  translatableMeasures,
} from "./catalogTranslation";
import { LOCALE_AI_TERMS, SUPPORTED_LOCALES } from "./locale";

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

// covers: spec 0051 AC-14. Failing rows are fixed by rerunning their ids,
// which hash gating would otherwise skip.
describe("selectsRow", () => {
  const stale = () => true;
  const current = () => false;

  it("follows the hash check when no ids are given", () => {
    expect(selectsRow("a", { reprocessAll: false, ids: undefined }, stale)).toBe(true);
    expect(selectsRow("a", { reprocessAll: false, ids: undefined }, current)).toBe(false);
    expect(selectsRow("a", { reprocessAll: true, ids: undefined }, current)).toBe(true);
  });

  it("with ids, runs a listed row even when current and skips every other row", () => {
    const ids = new Set(["a"]);
    expect(selectsRow("a", { reprocessAll: false, ids }, current)).toBe(true);
    expect(selectsRow("b", { reprocessAll: false, ids }, stale)).toBe(false);
    expect(selectsRow("b", { reprocessAll: true, ids }, stale)).toBe(false);
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

  // covers: spec 0048 AC-1, AC-23
  it("applies Hindi typography to hi output", () => {
    expect(localeTypography("hi")('"मोहितो" में 30 मि.ली. रम डालें.')).toBe(
      "“मोहितो” में 30 मिली रम डालें।",
    );
  });

  // covers: spec 0050 AC-1, AC-22
  it("applies Japanese typography to ja output", () => {
    expect(localeTypography("ja")('"ギムレット"にｼﾞﾝを１５ml入れます.')).toBe(
      "「ギムレット」にジンを15ml入れます。",
    );
  });

  // covers: spec 0051 AC-1, AC-22
  it("applies Korean typography to ko output, keeping middle dots in prose", () => {
    expect(localeTypography("ko")('"김렛"에 진을 １５ml 넣어요 。 얼음·라임')).toBe(
      "“김렛”에 진을 15ml 넣어요. 얼음·라임",
    );
  });

  // covers: spec 0051 AC-3, AC-14
  it("removes a middle dot next to Hangul from ko names only", () => {
    expect(localeNameTypography("ko")("진·토닉")).toBe("진 토닉");
    expect(localeTypography("ko")("진·토닉")).toBe("진·토닉");
  });

  it("gives every other locale its localeTypography for names", () => {
    const samples = ['"Gin" · Tonic .', "진·토닉", "ジン・トニック.", "Gin: 30 ml !", ""];
    for (const locale of SUPPORTED_LOCALES.filter((l) => l !== "ko")) {
      expect(samples.map(localeNameTypography(locale))).toEqual(
        samples.map(localeTypography(locale)),
      );
    }
  });

  // covers: spec 0047 AC-1
  it("applies Russian typography to ru output", () => {
    expect(localeTypography("ru")('Коктейль "Мохито" - классика.')).toBe(
      "Коктейль «Мохито» — классика.",
    );
  });
});
