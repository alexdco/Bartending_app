import type { TheCocktailDbDrink } from "./theCocktailDb";

export type AlcoholicStatus = "alcoholic" | "non_alcoholic" | "optional" | "unknown";

export interface RecipeInput {
  sourceId: string;
  name: string;
  instructions: string;
  imageUrl: string | null;
  glass: string | null;
  alcoholicStatus: AlcoholicStatus;
}

export interface RecipeIngredientInput {
  ingredientName: string;
  measure: string | null;
  sortOrder: number;
}

export interface RecipeTagInput {
  tagName: string;
}

export interface TransformedDrink {
  recipe: RecipeInput;
  ingredients: RecipeIngredientInput[];
  tags: RecipeTagInput[];
}

const ALCOHOLIC_STATUS_MAP: Record<string, AlcoholicStatus> = {
  Alcoholic: "alcoholic",
  "Non alcoholic": "non_alcoholic",
  Non_Alcoholic: "non_alcoholic",
  Optional: "optional",
};

function toAlcoholicStatus(raw: string | null): AlcoholicStatus {
  if (!raw) return "unknown";
  return ALCOHOLIC_STATUS_MAP[raw] ?? "unknown";
}

function extractIngredients(drink: TheCocktailDbDrink): RecipeIngredientInput[] {
  const ingredients: RecipeIngredientInput[] = [];

  for (let position = 1; position <= 15; position += 1) {
    const name = drink[`strIngredient${position}`]?.trim();
    if (!name) continue;

    const measure = drink[`strMeasure${position}`]?.trim() || null;
    ingredients.push({ ingredientName: name, measure, sortOrder: position });
  }

  return ingredients;
}

function extractTags(drink: TheCocktailDbDrink): RecipeTagInput[] {
  const fromTags = (drink.strTags ?? "")
    .split(",")
    .map((tag) => tag.trim())
    .filter((tag) => tag.length > 0);

  const category = drink.strCategory?.trim();
  const names = category ? [...fromTags, category] : fromTags;

  return [...new Set(names)].map((tagName) => ({ tagName }));
}

export function transformDrink(drink: TheCocktailDbDrink): TransformedDrink {
  return {
    recipe: {
      sourceId: drink.idDrink,
      name: drink.strDrink,
      instructions: drink.strInstructions,
      imageUrl: drink.strDrinkThumb || null,
      glass: drink.strGlass?.trim() || null,
      alcoholicStatus: toAlcoholicStatus(drink.strAlcoholic),
    },
    ingredients: extractIngredients(drink),
    tags: extractTags(drink),
  };
}
