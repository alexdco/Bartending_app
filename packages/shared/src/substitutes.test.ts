import { describe, expect, it } from "vitest";
import {
  buildSubstituteBanner,
  formatSubstituteAmount,
  hasSubstituteAvailable,
  mapBarSubstitutes,
  pickSubstitutes,
  type BarIngredientSubstitutes,
  type BarSubstituteItem,
  type PickSubstitutesInput,
} from "./substitutes";

function item(
  overrides: Partial<BarSubstituteItem> & { substituteIngredientId: string; rank: number },
): BarSubstituteItem {
  return {
    name: overrides.substituteIngredientId,
    nameTranslations: {},
    ratio: 1,
    note: null,
    noteHash: null,
    noteTranslations: {},
    category: "citrus",
    allergens: [],
    ...overrides,
  };
}

const lime: BarIngredientSubstitutes = {
  ingredientId: "lime",
  reviewed: true,
  allergens: [],
  items: [
    item({ substituteIngredientId: "lemon", rank: 1, name: "Lemon Juice" }),
    item({ substituteIngredientId: "grapefruit", rank: 2 }),
    item({ substituteIngredientId: "yuzu", rank: 3 }),
    item({ substituteIngredientId: "verjus", rank: 4 }),
  ],
};

function input(overrides: Partial<PickSubstitutesInput> = {}): PickSubstitutesInput {
  return {
    ingredientId: "lime",
    substitutes: [lime],
    stock86: [{ ingredientId: "lime", is86d: true }],
    recipeIngredientIds: ["rum", "lime", "syrup"],
    alcoholFree: false,
    locale: "en",
    ...overrides,
  };
}

describe("pickSubstitutes", () => {
  it("lists up to three swaps in rank order (AC-2)", () => {
    const result = pickSubstitutes(input());
    expect(result.outcome).toBe("shown");
    expect(result.items.map((picked) => picked.substituteIngredientId)).toEqual([
      "lemon",
      "grapefruit",
      "yuzu",
    ]);
  });

  it("skips an 86'd swap and fills from the next rank (AC-2)", () => {
    const result = pickSubstitutes(
      input({
        stock86: [
          { ingredientId: "lime", is86d: true },
          { ingredientId: "lemon", is86d: true },
        ],
      }),
    );
    expect(result.items.map((picked) => picked.substituteIngredientId)).toEqual([
      "grapefruit",
      "yuzu",
      "verjus",
    ]);
  });

  it("says none in stock when every allowed swap is 86'd (AC-5)", () => {
    const result = pickSubstitutes(
      input({
        stock86: ["lime", "lemon", "grapefruit", "yuzu", "verjus"].map((id) => ({
          ingredientId: id,
          is86d: true,
        })),
      }),
    );
    expect(result).toEqual({ outcome: "none_in_stock", items: [] });
  });

  it("separates reviewed with no swaps from not reviewed (AC-5)", () => {
    const reviewed = { ingredientId: "lime", reviewed: true, allergens: [], items: [] };
    const unreviewed = { ...reviewed, reviewed: false };
    expect(pickSubstitutes(input({ substitutes: [reviewed] })).outcome).toBe("none_known");
    expect(pickSubstitutes(input({ substitutes: [unreviewed] })).outcome).toBe("not_reviewed");
    expect(pickSubstitutes(input({ substitutes: [] })).outcome).toBe("not_reviewed");
  });

  it("drops spirits, liqueurs, and unclassified swaps in an alcohol free recipe (AC-6)", () => {
    const syrup: BarIngredientSubstitutes = {
      ingredientId: "syrup",
      reviewed: true,
      allergens: [],
      items: [
        item({ substituteIngredientId: "triple-sec", rank: 1, category: "liqueur" }),
        item({ substituteIngredientId: "mystery", rank: 2, category: null }),
        item({ substituteIngredientId: "agave", rank: 3, category: "other" }),
      ],
    };
    const result = pickSubstitutes(
      input({ ingredientId: "syrup", substitutes: [syrup], alcoholFree: true }),
    );
    expect(result.items.map((picked) => picked.substituteIngredientId)).toEqual(["agave"]);

    const onlyAlcoholic = { ...syrup, items: syrup.items.slice(0, 2) };
    expect(
      pickSubstitutes(
        input({ ingredientId: "syrup", substitutes: [onlyAlcoholic], alcoholFree: true }),
      ).outcome,
    ).toBe("none_known");
  });

  it("tags added allergens, unknown allergens, and swaps already in the drink (AC-7, AC-8)", () => {
    const syrup: BarIngredientSubstitutes = {
      ingredientId: "syrup",
      reviewed: true,
      allergens: null,
      items: [
        item({ substituteIngredientId: "orgeat", rank: 1, allergens: ["tree_nuts"] }),
        item({ substituteIngredientId: "rum", rank: 2, allergens: null }),
      ],
    };
    const [orgeat, rumSwap] = pickSubstitutes(
      input({ ingredientId: "syrup", substitutes: [syrup] }),
    ).items;
    expect(orgeat).toMatchObject({
      addedAllergens: ["tree_nuts"],
      allergensUnknown: false,
      alreadyInDrink: false,
    });
    expect(rumSwap).toMatchObject({
      addedAllergens: [],
      allergensUnknown: true,
      alreadyInDrink: true,
    });
  });

  it("localizes names and only shows a note translation made from the current note (AC-9)", () => {
    const swap = item({
      substituteIngredientId: "lemon",
      rank: 1,
      name: "Lemon Juice",
      nameTranslations: { es: "Jugo de limón amarillo" },
      note: "Less sharp",
      noteHash: "h2",
      noteTranslations: {
        es: { note: "Menos ácido", sourceNoteHash: "h2" },
        fr: { note: "Ancien", sourceNoteHash: "h1" },
      },
    });
    const substitutes = [{ ...lime, items: [swap] }];
    expect(pickSubstitutes(input({ substitutes, locale: "es" })).items[0]).toMatchObject({
      name: "Jugo de limón amarillo",
      note: "Menos ácido",
    });
    expect(pickSubstitutes(input({ substitutes, locale: "fr" })).items[0]).toMatchObject({
      name: "Lemon Juice",
      note: "Less sharp",
    });
  });
});

describe("formatSubstituteAmount", () => {
  const base = { amountMaxValue: null, partsValue: null, locale: "en" as const };

  it("scales an oz amount into the toggle unit (AC-3)", () => {
    expect(
      formatSubstituteAmount({ ...base, amountValue: 1, amountUnit: "oz", ratio: 0.5, mode: "oz" }),
    ).toMatchObject({ kind: "amount", text: "1/2", unit: "oz" });
    expect(
      formatSubstituteAmount({ ...base, amountValue: 1, amountUnit: "oz", ratio: 1, mode: "ml" }),
    ).toMatchObject({ kind: "amount", text: "29.6", unit: "ml" });
  });

  it("scales both ends of a range (AC-3)", () => {
    expect(
      formatSubstituteAmount({
        ...base,
        amountValue: 1,
        amountMaxValue: 1.5,
        amountUnit: "oz",
        ratio: 0.5,
        mode: "oz",
      }),
    ).toMatchObject({ kind: "amount", text: "1/2–3/4" });
  });

  it("keeps a counted or other unit and scales its number (AC-3)", () => {
    expect(
      formatSubstituteAmount({
        ...base,
        amountValue: 2,
        amountUnit: "dash",
        ratio: 0.5,
        mode: "oz",
      }),
    ).toEqual({ kind: "amount", text: "1", unit: "dash", count: 1 });
    expect(
      formatSubstituteAmount({
        ...base,
        amountValue: 1,
        amountUnit: "tsp",
        ratio: 1.5,
        mode: "ml",
      }),
    ).toMatchObject({ text: "1.5", unit: "tsp" });
  });

  it("scales the parts value in parts mode (AC-3)", () => {
    expect(
      formatSubstituteAmount({
        ...base,
        amountValue: 0.75,
        amountUnit: "oz",
        partsValue: 1,
        ratio: 0.67,
        mode: "parts",
      }),
    ).toMatchObject({ kind: "amount", text: "0.67", unit: "part" });
  });

  it("uses a ratio phrase for an unparseable amount, and nothing at ratio 1 (AC-4)", () => {
    const unparsed = { ...base, amountValue: null, amountUnit: null, mode: "oz" as const };
    expect(formatSubstituteAmount({ ...unparsed, ratio: 0.5 })).toEqual({
      kind: "ratio_phrase",
      key: "half",
      approximate: false,
    });
    expect(formatSubstituteAmount({ ...unparsed, ratio: 0.333 })).toMatchObject({
      key: "third",
      approximate: false,
    });
    expect(formatSubstituteAmount({ ...unparsed, ratio: 1.8 })).toMatchObject({
      key: "double",
      approximate: true,
    });
    expect(formatSubstituteAmount({ ...unparsed, ratio: 1 })).toEqual({ kind: "none" });
  });
});

describe("mapBarSubstitutes", () => {
  it("maps the RPC shape and tolerates junk", () => {
    expect(mapBarSubstitutes(null)).toEqual([]);
    const [entry] = mapBarSubstitutes([
      {
        ingredient_id: "lime",
        reviewed: true,
        allergens: null,
        items: [
          {
            substitute_ingredient_id: "lemon",
            name: "Lemon Juice",
            name_translations: { es: "Limón" },
            rank: 1,
            ratio: 0.75,
            note: "Less sharp",
            note_hash: "h",
            note_translations: { es: { note: "Menos", source_note_hash: "h" }, fr: "bad" },
            category: "citrus",
            allergens: ["tree_nuts", "nonsense"],
          },
        ],
      },
    ]);
    expect(entry).toEqual({
      ingredientId: "lime",
      reviewed: true,
      allergens: null,
      items: [
        {
          substituteIngredientId: "lemon",
          name: "Lemon Juice",
          nameTranslations: { es: "Limón" },
          rank: 1,
          ratio: 0.75,
          note: "Less sharp",
          noteHash: "h",
          noteTranslations: { es: { note: "Menos", sourceNoteHash: "h" } },
          category: "citrus",
          allergens: ["tree_nuts"],
        },
      ],
    });
  });
});

describe("buildSubstituteBanner", () => {
  const ingredients = [
    { ingredientId: "rum", name: "Rum", isStaple: false },
    { ingredientId: "lime", name: "Lime Juice", isStaple: false },
    { ingredientId: "ice", name: "Ice", isStaple: true },
    { ingredientId: "lime", name: "Lime Juice", isStaple: false },
  ];
  const serviceData = {
    stock86: ["lime", "ice", "rum"].map((id) => ({ ingredientId: id, is86d: true })),
    substitutes: [lime],
  };

  it("shows one block per distinct non staple 86'd ingredient in recipe order (AC-1)", () => {
    const blocks = buildSubstituteBanner({
      ingredients,
      serviceData,
      alcoholFree: false,
      locale: "en",
    });
    expect(
      blocks.map((block) => [block.ingredientId, block.lineIndex, block.picked.outcome]),
    ).toEqual([
      ["rum", 0, "not_reviewed"],
      ["lime", 1, "shown"],
    ]);
  });

  it("is empty when nothing is 86'd (AC-1)", () => {
    expect(
      buildSubstituteBanner({
        ingredients,
        serviceData: { stock86: [], substitutes: [] },
        alcoholFree: false,
        locale: "en",
      }),
    ).toEqual([]);
  });

  it("flags a swap available only when a block would list one (AC-11)", () => {
    expect(hasSubstituteAvailable({ ingredients, serviceData, alcoholFree: false })).toBe(true);
    expect(
      hasSubstituteAvailable({
        ingredients: ingredients.slice(0, 1),
        serviceData,
        alcoholFree: false,
      }),
    ).toBe(false);
  });
});
