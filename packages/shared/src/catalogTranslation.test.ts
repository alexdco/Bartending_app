import { describe, expect, it } from "vitest";
import { translatableMeasures } from "./catalogTranslation";

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
