import { describe, expect, it } from "vitest";
import {
  assertTranslationIds,
  chineseMeasureUnits,
  chineseRecipeReplyProblems,
  unquotedSource,
  localeNameTypography,
  localeTypography,
  nameTranslationPrompt,
  translatedEntityName,
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

  // covers: spec 0052 AC-1, AC-22
  it("applies Chinese typography to zh output, keeping middle dots in prose", () => {
    expect(localeTypography("zh")('"金汤力"加入１５ml金酒, 摇匀. 冰块·青柠')).toBe(
      "“金汤力”加入 15ml 金酒，摇匀。冰块·青柠",
    );
  });

  // covers: spec 0052 AC-14
  it("removes a middle dot next to Han from zh names only", () => {
    expect(localeNameTypography("zh")("汤姆·柯林斯")).toBe("汤姆柯林斯");
    expect(localeTypography("zh")("汤姆·柯林斯")).toBe("汤姆·柯林斯");
  });

  // covers: spec 0052 AC-14
  it("keeps the English source name for a zh name with no Han character", () => {
    expect(translatedEntityName("zh", "jamaica kiss", "Jamaica Kiss")).toBe("Jamaica Kiss");
    expect(translatedEntityName("zh", "玛格丽特", "Margarita")).toBe("玛格丽特");
    expect(translatedEntityName("zh", "汤姆·柯林斯", "Tom Collins")).toBe("汤姆柯林斯");
  });

  it("stores every other locale's name as its localeNameTypography gives it", () => {
    for (const locale of SUPPORTED_LOCALES.filter((l) => l !== "zh")) {
      expect(translatedEntityName(locale, "Jamaica kiss", "Jamaica Kiss")).toBe("Jamaica kiss");
      expect(translatedEntityName(locale, "진·토닉", "Gin Tonic")).toBe(
        localeNameTypography(locale)("진·토닉"),
      );
    }
  });

  it("gives every other locale its localeTypography for names", () => {
    const samples = ['"Gin" · Tonic .', "진·토닉", "ジン・トニック.", "Gin: 30 ml !", ""];
    for (const locale of SUPPORTED_LOCALES.filter((l) => l !== "ko" && l !== "zh")) {
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

// The Chinese backfill exposed duplicate model ids that caused Postgres 21000.
describe("translation response ids", () => {
  const expected = [{ id: "a" }, { id: "b" }];

  it("accepts every requested id once, regardless of reply order", () => {
    expect(() => assertTranslationIds(expected, [{ id: "b" }, { id: "a" }])).not.toThrow();
  });

  it.each([
    { reason: "duplicate", translated: [{ id: "a" }, { id: "a" }] },
    { reason: "missing", translated: [{ id: "a" }] },
    { reason: "unexpected", translated: [{ id: "a" }, { id: "c" }] },
    { reason: "extra", translated: [{ id: "a" }, { id: "b" }, { id: "b" }] },
  ])("rejects a $reason response before any upsert", ({ translated }) => {
    expect(() => assertTranslationIds(expected, translated)).toThrow(
      "every requested id exactly once",
    );
  });
});

// covers: spec 0052 AC-2, AC-13. The Opus sample review found cl stored as ml,
// oz converted to ml, `0. 5`, and instructions cut off at a source quote.
describe("chineseRecipeReplyProblems", () => {
  const source = {
    instructions: "Shake with ice. If served 'On the rocks', strain into an old-fashioned glass.",
    ingredients: [
      { ingredient_id: "gin", measure: "4 cl" },
      { ingredient_id: "rum", measure: "1/2 oz" },
      { ingredient_id: "salt", measure: null },
    ],
  };
  const good = {
    instructions: "加冰摇匀。若加冰饮用，则滤入古典杯。",
    ingredient_measures: [
      { ingredient_id: "gin", measure: "4 cl" },
      { ingredient_id: "rum", measure: "0.5 盎司" },
      { ingredient_id: "salt", measure: null },
    ],
  };

  it("accepts a reply that keeps units, decimals, and the whole method", () => {
    expect(chineseRecipeReplyProblems(source, good)).toEqual([]);
  });

  it.each([
    { reason: "cl stored as ml", gin: "4 ml", rum: "0.5 盎司", problem: "gin changed its unit" },
    { reason: "oz converted to ml", gin: "4 cl", rum: "15 ml", problem: "rum changed its unit" },
    { reason: "a split decimal", gin: "4 cl", rum: "0. 5 盎司", problem: "rum splits a decimal" },
  ])("flags $reason", ({ gin, rum, problem }) => {
    const reply = {
      ...good,
      ingredient_measures: [
        { ingredient_id: "gin", measure: gin },
        { ingredient_id: "rum", measure: rum },
      ],
    };
    expect(chineseRecipeReplyProblems(source, reply).join()).toContain(problem);
  });

  it("flags instructions cut off before a quote", () => {
    expect(
      chineseRecipeReplyProblems(source, { ...good, instructions: "加冰摇匀。如果要选择" }),
    ).toEqual(['instructions end mid sentence: "…加冰摇匀。如果要选择"']);
  });

  it("accepts an unpunctuated ending when the source has none", () => {
    expect(
      chineseRecipeReplyProblems(
        { ...source, instructions: "shake well... serve cold" },
        { ...good, instructions: "充分摇匀…冰凉享用" },
      ),
    ).toEqual([]);
  });
});

// covers: spec 0052 AC-13. Haiku kept writing oz in Chinese measures.
describe("chineseMeasureUnits", () => {
  it.each([
    ["8 oz", "8 盎司"],
    ["2oz", "2盎司"],
    ["70 ml/2 fl oz", "70 ml/2 液量盎司"],
    ["4 cl", "4 cl"],
    ["1 小杯", "1 小杯"],
  ])("%s → %s", (input, expected) => {
    expect(chineseMeasureUnits(input)).toBe(expected);
  });
});

// covers: spec 0052 AC-2. A straight quote copied into a structured reply
// ended the JSON string and cut the Whiskey Sour steps short.
describe("unquotedSource", () => {
  it.each([
    ["If served 'On the rocks', strain.", "If served On the rocks, strain."],
    [
      'Heat to a "coffee temperature" (DO NOT BOIL).',
      "Heat to a coffee temperature (DO NOT BOIL).",
    ],
    ["Thanks, Kirby's bar.", "Thanks, Kirby's bar."],
    ["Called “Sun and Shade”.", "Called Sun and Shade."],
  ])("%s", (input, expected) => {
    expect(unquotedSource(input)).toBe(expected);
  });
});
