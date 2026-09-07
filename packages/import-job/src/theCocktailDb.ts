export interface TheCocktailDbDrink {
  idDrink: string;
  strDrink: string;
  strInstructions: string;
  strDrinkThumb: string | null;
  strCategory: string | null;
  strGlass: string | null;
  strAlcoholic: string | null;
  strTags: string | null;
  [key: `strIngredient${number}`]: string | null | undefined;
  [key: `strMeasure${number}`]: string | null | undefined;
}

interface TheCocktailDbListResponse {
  drinks: TheCocktailDbDrink[] | null;
}

const BASE_URL = "https://www.thecocktaildb.com/api/json/v1/1";

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`TheCocktailDB request failed: ${response.status} ${url}`);
  }
  return (await response.json()) as T;
}

const LETTERS = "abcdefghijklmnopqrstuvwxyz".split("");

// TheCocktailDB has no "list all" endpoint; it exposes search by first letter.
export async function fetchAllDrinks(): Promise<TheCocktailDbDrink[]> {
  const pages = await Promise.all(
    LETTERS.map((letter) =>
      fetchJson<TheCocktailDbListResponse>(`${BASE_URL}/search.php?f=${letter}`),
    ),
  );

  return pages.flatMap((page) => page.drinks ?? []);
}
