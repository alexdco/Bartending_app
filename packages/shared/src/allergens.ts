// Allergens (spec 0043). ALLERGENS is the display order and mirrors
// ingredients_allergens_check in 20261029120000_recipe_style_tips_allergens.sql.
// A recipe's allergens are derived from its ingredients, never stored.

export const ALLERGENS = [
  "egg",
  "milk",
  "tree_nuts",
  "peanuts",
  "gluten",
  "soy",
  "sulfites",
  "fish",
  "shellfish",
  "celery",
  "sesame",
  "mustard",
] as const;

export type Allergen = (typeof ALLERGENS)[number];

export function isAllergen(value: unknown): value is Allergen {
  return typeof value === "string" && (ALLERGENS as readonly string[]).includes(value);
}

/** Null when the value is not a list (not reviewed); unknown entries are dropped. */
export function toAllergenList(value: unknown): readonly Allergen[] | null {
  return Array.isArray(value) ? value.filter(isAllergen) : null;
}

export interface AllergenIngredient {
  readonly name: string;
  /** Null = not reviewed yet, empty = reviewed, none. */
  readonly allergens: readonly Allergen[] | null;
}

export interface RecipeAllergenEntry {
  readonly allergen: Allergen;
  /** Ingredient names in recipe order, duplicates removed. */
  readonly ingredientNames: readonly string[];
}

export interface RecipeAllergenSummary {
  readonly status: "none" | "present";
  /** False when any ingredient is not reviewed, or there are no ingredients. */
  readonly isComplete: boolean;
  /** In ALLERGENS order. */
  readonly entries: readonly RecipeAllergenEntry[];
}

/**
 * The recipe's allergens as the union of its ingredients' reviewed lists
 * (AC-6). Pass ingredients in recipe order.
 */
export function summarizeRecipeAllergens(
  ingredients: readonly AllergenIngredient[],
): RecipeAllergenSummary {
  const entries = ALLERGENS.map((allergen) => ({
    allergen,
    ingredientNames: [
      ...new Set(
        ingredients
          .filter((ingredient) => ingredient.allergens?.includes(allergen) ?? false)
          .map((ingredient) => ingredient.name),
      ),
    ],
  })).filter((entry) => entry.ingredientNames.length > 0);

  return {
    status: entries.length > 0 ? "present" : "none",
    isComplete:
      ingredients.length > 0 && ingredients.every((ingredient) => ingredient.allergens !== null),
    entries,
  };
}
