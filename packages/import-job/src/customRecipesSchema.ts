import type { AlcoholicStatus } from "./transform";

export interface CustomRecipeIngredient {
  ingredientName: string;
  measure: string | null;
}

export interface CustomRecipe {
  slug: string;
  name: string;
  instructions: string;
  imageUrl: string | null;
  glass: string | null;
  alcoholicStatus: AlcoholicStatus;
  ingredients: CustomRecipeIngredient[];
  tags: string[];
}

const ALCOHOLIC_STATUSES: readonly AlcoholicStatus[] = [
  "alcoholic",
  "non_alcoholic",
  "optional",
  "unknown",
];

const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

export function parseCustomRecipes(raw: unknown): CustomRecipe[] {
  assert(Array.isArray(raw), "customRecipes.json must contain an array");

  const seenSlugs = new Set<string>();

  return (raw as unknown[]).map((entry, index) => {
    assert(
      typeof entry === "object" && entry !== null,
      `Recipe at index ${index} is not an object`,
    );
    const recipe = entry as Record<string, unknown>;
    const context = `Recipe at index ${index} (${String(recipe.slug ?? recipe.name ?? "unknown")})`;

    assert(
      typeof recipe.slug === "string" && SLUG_PATTERN.test(recipe.slug),
      `${context}: "slug" must be lowercase kebab-case`,
    );
    assert(!seenSlugs.has(recipe.slug as string), `${context}: duplicate slug "${recipe.slug}"`);
    seenSlugs.add(recipe.slug as string);

    assert(
      typeof recipe.name === "string" && recipe.name.trim().length > 0,
      `${context}: "name" is required`,
    );
    assert(
      typeof recipe.instructions === "string" && recipe.instructions.trim().length > 0,
      `${context}: "instructions" is required`,
    );
    assert(
      recipe.imageUrl === null || typeof recipe.imageUrl === "string",
      `${context}: "imageUrl" must be a string or null`,
    );
    assert(
      recipe.glass === null || typeof recipe.glass === "string",
      `${context}: "glass" must be a string or null`,
    );
    assert(
      typeof recipe.alcoholicStatus === "string" &&
        ALCOHOLIC_STATUSES.includes(recipe.alcoholicStatus as AlcoholicStatus),
      `${context}: "alcoholicStatus" must be one of ${ALCOHOLIC_STATUSES.join(", ")}`,
    );
    assert(
      Array.isArray(recipe.ingredients) && recipe.ingredients.length > 0,
      `${context}: "ingredients" must be a non-empty array`,
    );
    assert(Array.isArray(recipe.tags), `${context}: "tags" must be an array`);

    const ingredients = (recipe.ingredients as unknown[]).map((raw, ingredientIndex) => {
      assert(
        typeof raw === "object" && raw !== null,
        `${context}: ingredient at index ${ingredientIndex} is not an object`,
      );
      const ingredient = raw as Record<string, unknown>;
      assert(
        typeof ingredient.ingredientName === "string" &&
          ingredient.ingredientName.trim().length > 0,
        `${context}: ingredient at index ${ingredientIndex} is missing "ingredientName"`,
      );
      assert(
        ingredient.measure === null ||
          ingredient.measure === undefined ||
          typeof ingredient.measure === "string",
        `${context}: ingredient at index ${ingredientIndex} "measure" must be a string or null`,
      );
      return {
        ingredientName: ingredient.ingredientName as string,
        measure: (ingredient.measure as string | null | undefined) ?? null,
      };
    });

    const tags = (recipe.tags as unknown[]).map((tag, tagIndex) => {
      assert(
        typeof tag === "string" && tag.trim().length > 0,
        `${context}: tag at index ${tagIndex} must be a non-empty string`,
      );
      return tag as string;
    });

    return {
      slug: recipe.slug as string,
      name: recipe.name as string,
      instructions: recipe.instructions as string,
      imageUrl: (recipe.imageUrl as string | null | undefined) ?? null,
      glass: (recipe.glass as string | null | undefined) ?? null,
      alcoholicStatus: recipe.alcoholicStatus as AlcoholicStatus,
      ingredients,
      tags,
    };
  });
}
