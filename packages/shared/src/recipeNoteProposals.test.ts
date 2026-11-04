import { describe, expect, it } from "vitest";
import { CATALOG_TRANSLATION_LOCALES, NON_DEFAULT_LOCALES, type NonDefaultLocale } from "./locale";
import {
  planLocaleNoteBackfill,
  proposalsFromLocaleReply,
  RecipeTranslationNotesResultSchema,
  toRecipeNotePayload,
  toRecipeTranslationNotePayload,
  validateRecipeNoteProposals,
  validateRecipeTranslationNoteProposals,
  type BackfillRecipe,
} from "./recipeNoteProposals";

const notesByLocale: Record<
  NonDefaultLocale,
  { drink_style_note: string; bartender_tip: string; presentation_tip: string }
> = {
  es: {
    drink_style_note: " Un sour de tequila equilibrado con limón y licor de naranja. ",
    bartender_tip: "Agita con fuerza y mucho hielo para que salga frío y algo diluido.",
    presentation_tip: "Escarcha solo medio borde con sal para que cada sorbo sea opcional.",
  },
  pt: {
    drink_style_note: " Um sour de tequila equilibrado com limão e licor de laranja. ",
    bartender_tip: "Bata com força e bastante gelo para sair bem gelado e levemente diluído.",
    presentation_tip: "Coloque sal em só metade da borda para cada gole ser uma escolha.",
  },
};

// One block per CATALOG_TRANSLATION_LOCALES code, so the fixture stays valid at launch.
const margarita = {
  id: "d6aa9b01-16e2-49e9-a02b-5386edd831a8",
  name: "Margarita",
  drink_style: "sour",
  drink_style_note: " A tequila sour balanced by lime and orange liqueur. ",
  bartender_tip: "Shake hard with plenty of ice so it comes out cold and lightly diluted.",
  presentation_tip: "Salt only half the rim so each sip is the guest's choice.",
  translations: Object.fromEntries(
    CATALOG_TRANSLATION_LOCALES.map((locale) => [locale, notesByLocale[locale]]),
  ),
};

const withEs = (es: object) => ({
  ...margarita,
  translations: { ...margarita.translations, es: { ...margarita.translations.es, ...es } },
});

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

  it("rejects a file missing a locale's block", () => {
    expect(validateRecipeNoteProposals([{ ...margarita, translations: {} }]).ok).toBe(false);
  });

  it("rejects a block for a supported locale outside CATALOG_TRANSLATION_LOCALES", () => {
    const outside = NON_DEFAULT_LOCALES.filter(
      (locale) => !(CATALOG_TRANSLATION_LOCALES as readonly string[]).includes(locale),
    );
    for (const code of outside) {
      const translations = { ...margarita.translations, [code]: notesByLocale[code] };
      expect(validateRecipeNoteProposals([{ ...margarita, translations }]).ok).toBe(false);
    }
  });

  it("rejects an English or unsupported translations key", () => {
    for (const code of ["en", "fr"]) {
      const translations = { ...margarita.translations, [code]: notesByLocale.es };
      expect(validateRecipeNoteProposals([{ ...margarita, translations }]).ok).toBe(false);
    }
  });

  it("rejects the old top level es shape", () => {
    const { translations, ...base } = margarita;
    expect(validateRecipeNoteProposals([{ ...base, es: translations.es }]).ok).toBe(false);
  });

  it("rejects a 241 code point Spanish text and accepts 240", () => {
    const tooLong = "ñ".repeat(240) + "🍋";
    const result = validateRecipeNoteProposals([withEs({ bartender_tip: tooLong })]);
    expect(result).toEqual({
      ok: false,
      errors: ["0.translations.es.bartender_tip (Margarita): is over 240 characters"],
    });
    expect(validateRecipeNoteProposals([withEs({ bartender_tip: "🍋".repeat(240) })]).ok).toBe(
      true,
    );
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
    expect(row?.translations.es.drink_style_note).toBe(
      "Un sour de tequila equilibrado con limón y licor de naranja.",
    );
  });
});

const english = {
  drink_style_note: "A tequila sour.",
  bartender_tip: "Shake hard.",
  presentation_tip: "Salt half the rim.",
};
const filled = { drink_style_note: "Um sour.", bartender_tip: "Bata.", presentation_tip: "Sal." };

const recipe = (id: string, overrides: Partial<BackfillRecipe> = {}): BackfillRecipe => ({
  id,
  name: `Recipe ${id}`,
  english,
  translation: filled,
  ...overrides,
});

describe("planLocaleNoteBackfill", () => {
  const recipes = [
    recipe("a", {
      translation: { drink_style_note: null, bartender_tip: null, presentation_tip: null },
    }),
    recipe("b", { translation: { ...filled, bartender_tip: "  " } }),
    recipe("c"),
    recipe("d", { translation: null }),
    recipe("e", { english: { ...english, presentation_tip: null } }),
  ];

  it("picks only the empty fields and lists the gaps by reason", () => {
    const plan = planLocaleNoteBackfill(recipes);
    expect(plan.picked.map((p) => [p.id, p.fields])).toEqual([
      ["a", ["drink_style_note", "bartender_tip", "presentation_tip"]],
      ["b", ["bartender_tip"]],
    ]);
    expect(plan.picked[1]?.source).toEqual({ bartender_tip: "Shake hard." });
    expect(plan.missingRow.map((r) => r.id)).toEqual(["d"]);
    expect(plan.missingEnglish.map((r) => r.id)).toEqual(["e"]);
  });

  it("with all, picks every field of every eligible recipe", () => {
    const plan = planLocaleNoteBackfill(recipes, { all: true });
    expect(plan.picked.map((p) => p.id)).toEqual(["a", "b", "c"]);
    expect(plan.picked.every((p) => p.fields.length === 3)).toBe(true);
  });

  it("caps the picked recipes with limit", () => {
    expect(planLocaleNoteBackfill(recipes, { limit: 1 }).picked.map((p) => p.id)).toEqual(["a"]);
  });
});

const ptRow = {
  id: margarita.id,
  name: "Margarita",
  source: { bartender_tip: "Shake hard." },
  notes: { bartender_tip: " Bata com força. " },
};

describe("validateRecipeTranslationNoteProposals", () => {
  it("accepts a good file", () => {
    expect(validateRecipeTranslationNoteProposals([ptRow]).ok).toBe(true);
  });

  it.each([
    ["empty notes", { ...ptRow, source: {}, notes: {} }],
    ["mismatched keys", { ...ptRow, source: { presentation_tip: "Salt." } }],
    ["an unknown field", { ...ptRow, source: { glass: "x" }, notes: { glass: "y" } }],
    ["a blank note", { ...ptRow, notes: { bartender_tip: " " } }],
    ["a note over 240", { ...ptRow, notes: { bartender_tip: "a".repeat(241) } }],
    ["a blank source", { ...ptRow, source: { bartender_tip: "" } }],
  ])("rejects %s", (_, row) => {
    expect(validateRecipeTranslationNoteProposals([row]).ok).toBe(false);
  });

  it("rejects a duplicate id", () => {
    expect(validateRecipeTranslationNoteProposals([ptRow, ptRow])).toEqual({
      ok: false,
      errors: [`${ptRow.id}: appears more than once`],
    });
  });

  it("trims notes, keeps source, and drops the name in the payload", () => {
    const result = validateRecipeTranslationNoteProposals([ptRow]);
    if (!result.ok) throw new Error("expected a valid file");
    expect(toRecipeTranslationNotePayload(result.proposals)).toEqual([
      { id: ptRow.id, source: ptRow.source, notes: { bartender_tip: "Bata com força." } },
    ]);
  });
});

describe("proposalsFromLocaleReply", () => {
  const pick = {
    id: margarita.id,
    name: "Margarita",
    fields: ["bartender_tip"] as const,
    source: { bartender_tip: "Shake hard." },
  };
  const reply = (fields: Record<string, string | null>) => ({
    recipes: [
      {
        id: margarita.id,
        drink_style_note: null,
        bartender_tip: null,
        presentation_tip: null,
        ...fields,
      },
    ],
  });

  it("keeps only the requested fields", () => {
    expect(proposalsFromLocaleReply([pick], reply({ bartender_tip: "Bata." }))).toEqual({
      ok: true,
      proposals: [
        { id: pick.id, name: pick.name, source: pick.source, notes: { bartender_tip: "Bata." } },
      ],
    });
  });

  it("fails when a requested field is null or an unrequested one is filled", () => {
    expect(proposalsFromLocaleReply([pick], reply({})).ok).toBe(false);
    expect(
      proposalsFromLocaleReply([pick], reply({ bartender_tip: "Bata.", presentation_tip: "Sal." }))
        .ok,
    ).toBe(false);
  });
});

describe("RecipeTranslationNotesResultSchema", () => {
  it("parses the RPC result", () => {
    const result = {
      missing_row: [],
      stale: [{ id: margarita.id, field: "bartender_tip" }],
      gone: [margarita.id],
    };
    expect(RecipeTranslationNotesResultSchema.parse(result)).toEqual(result);
  });
});
