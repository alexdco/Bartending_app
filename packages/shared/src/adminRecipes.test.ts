import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";
import {
  saveAdminRecipe,
  splitNameList,
  toAdminIngredientPayload,
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
      { name: "Rum", measure: "1 1/2 oz", sortOrder: 0, amount_value: 1.5, amount_unit: "oz" },
      { name: "Bitters", measure: "2 dashes", sortOrder: 1, amount_value: null, amount_unit: null },
      { name: "Mint", measure: null, sortOrder: 2, amount_value: null, amount_unit: null },
    ]);
  });

  it("gives identical amounts when an unchanged recipe is saved again", () => {
    const form = [{ name: "Gin", measure: "3 parts" }];
    expect(toAdminIngredientPayload(form)).toEqual(toAdminIngredientPayload(form));
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
