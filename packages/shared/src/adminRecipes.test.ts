import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";
import {
  canOpenAdminRecipe,
  isChangedUpstream,
  saveAdminRecipe,
  setRecipeTranslationNotes,
  splitNameList,
  toAdminIngredientPayload,
  toTranslationNotesByLocale,
  validateAdminRecipeForm,
  type AdminRecipeFormValues,
} from "./adminRecipes";

describe("toAdminIngredientPayload (spec 0035 AC-8)", () => {
  it("parses each measure into amount_value and amount_unit", () => {
    expect(
      toAdminIngredientPayload([
        { name: " Rum ", measure: " 1 1/2 oz " },
        { name: "Bitters", measure: "2 dashes" },
        { name: "Mint", measure: null },
      ]),
    ).toEqual([
      {
        name: "Rum",
        measure: "1 1/2 oz",
        sortOrder: 0,
        amount_value: 1.5,
        amount_max_value: null,
        amount_unit: "oz",
      },
      // Counted units parse since spec 0054 AC-1.
      {
        name: "Bitters",
        measure: "2 dashes",
        sortOrder: 1,
        amount_value: 2,
        amount_max_value: null,
        amount_unit: "dash",
      },
      {
        name: "Mint",
        measure: null,
        sortOrder: 2,
        amount_value: null,
        amount_max_value: null,
        amount_unit: null,
      },
    ]);
  });

  it("gives identical amounts when an unchanged recipe is saved again", () => {
    const form = [{ name: "Gin", measure: "3 parts" }];
    expect(toAdminIngredientPayload(form)).toEqual(toAdminIngredientPayload(form));
  });

  // Spec 0056 AC-1: admin_upsert_recipe compares nullif(btrim(measure), '')
  // with the stored row, so an untrimmed imported measure saved unchanged
  // must arrive trimmed, and a blank one as null, or the save would lock it.
  it("sends a trimmed measure and null for a blank one, so an unchanged save never locks", () => {
    expect(
      toAdminIngredientPayload([
        { name: "Lime juice", measure: " 3/4 oz \n" },
        { name: "Soda water", measure: "   " },
      ]),
    ).toEqual([
      {
        name: "Lime Juice",
        measure: "3/4 oz",
        sortOrder: 0,
        amount_value: 0.75,
        amount_max_value: null,
        amount_unit: "oz",
      },
      {
        name: "Soda Water",
        measure: null,
        sortOrder: 1,
        amount_value: null,
        amount_max_value: null,
        amount_unit: null,
      },
    ]);
  });
});

describe("splitNameList", () => {
  it("splits on new lines and commas, dropping blanks, bullets, and repeats", () => {
    expect(splitNameList("Sweet, Creamy\r\n\n- Spicy\nsweet\n")).toEqual([
      "Sweet",
      "Creamy",
      "Spicy",
    ]);
  });

  it("keeps names with other punctuation whole", () => {
    expect(splitNameList("Coffee / Tea\nSweet & Sour")).toEqual(["Coffee / Tea", "Sweet & Sour"]);
  });

  it("returns a single name for one item", () => {
    expect(splitNameList("  Herbal  ")).toEqual(["Herbal"]);
  });
});

const formValues: AdminRecipeFormValues = {
  recipeId: null,
  name: "Margarita",
  instructions: "Shake with ice and strain.",
  glass: null,
  alcoholicStatus: "alcoholic",
  region: null,
  ingredients: [{ name: "Tequila", measure: "2 oz" }],
  tags: [],
  flavorProfile: null,
  method: null,
  drinkStyle: "sour",
  drinkStyleNote: "A tequila sour.",
  bartenderTip: "  Shake hard.  ",
  presentationTip: "",
};

describe("validateAdminRecipeForm notes (spec 0043 AC-10)", () => {
  it("accepts empty notes and notes at the 240 limit", () => {
    expect(validateAdminRecipeForm({ ...formValues, bartenderTip: "🍋".repeat(240) })).toEqual([]);
    expect(
      validateAdminRecipeForm({
        ...formValues,
        drinkStyle: null,
        drinkStyleNote: "",
        bartenderTip: "",
      }),
    ).toEqual([]);
  });

  it("rejects a 241 character tip, an unknown family, and a sentence with no family", () => {
    expect(validateAdminRecipeForm({ ...formValues, presentationTip: "a".repeat(241) })).toEqual([
      { field: "presentationTip", reason: "too_long" },
    ]);
    expect(
      validateAdminRecipeForm({
        ...formValues,
        drinkStyle: "martini" as AdminRecipeFormValues["drinkStyle"],
      }),
    ).toEqual([{ field: "drinkStyle", reason: "invalid" }]);
    expect(validateAdminRecipeForm({ ...formValues, drinkStyle: null })).toEqual([
      { field: "drinkStyleNote", reason: "needs_style" },
    ]);
  });
});

describe("saveAdminRecipe notes (spec 0043 AC-10)", () => {
  const recipeId = "d6aa9b01-16e2-49e9-a02b-5386edd831a8";

  function clientWith(notesError: { message: string } | null) {
    const rpc = vi.fn((name: string) =>
      Promise.resolve(
        name === "admin_upsert_recipe"
          ? { data: recipeId, error: null }
          : { data: null, error: notesError },
      ),
    );
    return { rpc, client: { rpc } as unknown as SupabaseClient<Database> };
  }

  it("saves the recipe, then its trimmed notes, with blanks as null", async () => {
    const { rpc, client } = clientWith(null);

    await expect(saveAdminRecipe(client, formValues)).resolves.toEqual({
      data: { id: recipeId },
      error: null,
    });
    expect(rpc).toHaveBeenLastCalledWith("admin_set_recipe_notes", {
      p_recipe_id: recipeId,
      p_drink_style: "sour",
      p_drink_style_note: "A tequila sour.",
      p_bartender_tip: "Shake hard.",
      p_presentation_tip: null,
    });
  });

  it("returns notes_failed with the saved id when only the notes call fails", async () => {
    const { client } = clientWith({ message: "not authorized" });

    await expect(saveAdminRecipe(client, formValues)).resolves.toEqual({
      data: null,
      error: { reason: "notes_failed", id: recipeId, message: "not authorized" },
    });
  });

  it("saves nothing when the notes are invalid", async () => {
    const { rpc, client } = clientWith(null);

    const result = await saveAdminRecipe(client, { ...formValues, bartenderTip: "a".repeat(241) });
    expect(result.error?.reason).toBe("validation");
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe("saveAdminRecipe method (spec 0054 AC-11)", () => {
  function upsertArgs(rpc: ReturnType<typeof vi.fn>) {
    const call = rpc.mock.calls.find(([name]) => name === "admin_upsert_recipe");
    return call?.[1] as Record<string, unknown>;
  }

  function client() {
    const rpc = vi.fn((name: string) =>
      Promise.resolve(
        name === "admin_upsert_recipe" ? { data: "id", error: null } : { data: null, error: null },
      ),
    );
    return { rpc, client: { rpc } as unknown as SupabaseClient<Database> };
  }

  it("always sends p_set_method with the picked method", async () => {
    const { rpc, client: c } = client();
    await saveAdminRecipe(c, { ...formValues, method: "stir" });
    expect(upsertArgs(rpc)).toMatchObject({ p_set_method: true, p_method: "stir" });
  });

  it("sends a blank pick as null, which clears the method", async () => {
    const { rpc, client: c } = client();
    await saveAdminRecipe(c, formValues);
    expect(upsertArgs(rpc)).toMatchObject({ p_set_method: true, p_method: null });
  });

  it("rejects an unknown method before the round trip", async () => {
    const { rpc, client: c } = client();
    const values = { ...formValues, method: "throw" as AdminRecipeFormValues["method"] };
    expect(validateAdminRecipeForm(values)).toEqual([{ field: "method", reason: "invalid" }]);
    expect((await saveAdminRecipe(c, values)).error?.reason).toBe("validation");
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe("toTranslationNotesByLocale (spec 0045 AC-11)", () => {
  it("gives every non English locale an entry, null where no row exists", () => {
    const notes = { drink_style_note: "Nota", bartender_tip: null, presentation_tip: null };
    expect(toTranslationNotesByLocale([{ locale: "es", ...notes }])).toEqual({
      es: notes,
      pt: null,
      fr: null,
      ru: null,
      hi: null,
      ja: null,
      ko: null,
      zh: null,
    });
  });
});

describe("setRecipeTranslationNotes (spec 0045 AC-11)", () => {
  const notes = { drink_style_note: " Nota ", bartender_tip: "  ", presentation_tip: null };
  const clientReturning = (error: { code: string; message: string } | null) => {
    const rpc = vi.fn().mockResolvedValue({ error });
    return { rpc, client: { rpc } as unknown as SupabaseClient<Database> };
  };

  it("trims the notes and stores a blank as null", async () => {
    const { client, rpc } = clientReturning(null);
    const result = await setRecipeTranslationNotes(client, "recipe", "pt", notes);
    expect(result).toEqual({ data: true, error: null });
    expect(rpc).toHaveBeenCalledWith("admin_set_recipe_translation_notes", {
      p_recipe_id: "recipe",
      p_locale: "pt",
      p_drink_style_note: "Nota",
      p_bartender_tip: null,
      p_presentation_tip: null,
    });
  });

  it("reports a missing translation row explicitly", async () => {
    const { client } = clientReturning({ code: "P0002", message: "no row" });
    expect(await setRecipeTranslationNotes(client, "recipe", "pt", notes)).toEqual({
      data: null,
      error: { reason: "no_translation_row" },
    });
  });

  it("rejects a too long note without calling the database", async () => {
    const { client, rpc } = clientReturning(null);
    const tooLong = { ...notes, bartender_tip: "x".repeat(241) };
    expect(await setRecipeTranslationNotes(client, "recipe", "pt", tooLong)).toEqual({
      data: null,
      error: { reason: "too_long" },
    });
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe("isChangedUpstream (spec 0056 AC-7)", () => {
  const locked = "2026-11-14T00:00:00Z";

  it("flags a locked recipe whose latest source version differs", () => {
    expect(
      isChangedUpstream({
        admin_locked_at: locked,
        source_hash: "v1:a",
        latest_source_hash: "v1:b",
      }),
    ).toBe(true);
  });

  it.each([
    [
      "matching hashes",
      { admin_locked_at: locked, source_hash: "v1:a", latest_source_hash: "v1:a" },
    ],
    [
      "an unlocked recipe",
      { admin_locked_at: null, source_hash: "v1:a", latest_source_hash: "v1:b" },
    ],
    ["no baseline yet", { admin_locked_at: locked, source_hash: null, latest_source_hash: "v1:b" }],
  ])("does not flag %s", (_label, row) => {
    expect(isChangedUpstream(row)).toBe(false);
  });
});

describe("canOpenAdminRecipe (spec 0056 AC-7)", () => {
  const deleted = "2026-11-14T00:00:00Z";

  it("opens every live recipe", () => {
    expect(canOpenAdminRecipe({ deleted_at: null, admin_locked_at: null, source: "admin" })).toBe(
      true,
    );
  });

  it("opens a deleted recipe only when it is a locked catalog recipe", () => {
    expect(
      canOpenAdminRecipe({ deleted_at: deleted, admin_locked_at: deleted, source: "catalog" }),
    ).toBe(true);
    expect(
      canOpenAdminRecipe({ deleted_at: deleted, admin_locked_at: null, source: "catalog" }),
    ).toBe(false);
    expect(
      canOpenAdminRecipe({ deleted_at: deleted, admin_locked_at: deleted, source: "admin" }),
    ).toBe(false);
  });
});
