import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchAllDrinks, type TheCocktailDbDrink } from "./theCocktailDb";

const BASE_URL = "https://www.thecocktaildb.com/api/json/v1/1";

function drink(idDrink: string, strDrink: string): TheCocktailDbDrink {
  return {
    idDrink,
    strDrink,
    strInstructions: "Stir.",
    strDrinkThumb: null,
    strCategory: null,
    strGlass: null,
    strAlcoholic: null,
    strTags: null,
    strIBA: null,
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function letterOf(url: string): string {
  return new URL(url).searchParams.get("f") ?? "";
}

describe("fetchAllDrinks", () => {
  const fetchMock = vi.fn<(url: string) => Promise<Response>>();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("requests one search page per letter a through z", async () => {
    fetchMock.mockImplementation(async () => jsonResponse({ drinks: [] }));

    await fetchAllDrinks();

    const urls = fetchMock.mock.calls.map(([url]) => url);
    expect(urls).toHaveLength(26);
    expect(urls[0]).toBe(`${BASE_URL}/search.php?f=a`);
    expect(urls.map(letterOf).join("")).toBe("abcdefghijklmnopqrstuvwxyz");
  });

  // covers: AC-1 (the catalog is pulled once by the import job)
  it("flattens every letter page into one list, in letter order", async () => {
    fetchMock.mockImplementation(async (url) => {
      switch (letterOf(url)) {
        case "a":
          return jsonResponse({ drinks: [drink("1", "Americano"), drink("2", "Aviation")] });
        case "m":
          return jsonResponse({ drinks: [drink("3", "Margarita")] });
        default:
          return jsonResponse({ drinks: [] });
      }
    });

    const drinks = await fetchAllDrinks();

    expect(drinks.map((d) => d.strDrink)).toEqual(["Americano", "Aviation", "Margarita"]);
  });

  it("treats a letter with no drinks (drinks: null) as an empty page", async () => {
    fetchMock.mockImplementation(async (url) =>
      letterOf(url) === "b"
        ? jsonResponse({ drinks: [drink("4", "Bramble")] })
        : jsonResponse({ drinks: null }),
    );

    const drinks = await fetchAllDrinks();

    expect(drinks.map((d) => d.idDrink)).toEqual(["4"]);
  });

  // covers: AC-6 (a failed fetch must fail the whole run, so reconciliation
  // never marks recipes removed from a partial catalog)
  it("rejects the whole fetch when any single letter returns a non ok status", async () => {
    fetchMock.mockImplementation(async (url) =>
      letterOf(url) === "q" ? jsonResponse({}, 503) : jsonResponse({ drinks: [drink("5", "X")] }),
    );

    await expect(fetchAllDrinks()).rejects.toThrow(
      `TheCocktailDB request failed: 503 ${BASE_URL}/search.php?f=q`,
    );
  });

  // covers: AC-6
  it("rejects the whole fetch when a network error occurs on any letter", async () => {
    fetchMock.mockImplementation(async (url) => {
      if (letterOf(url) === "z") throw new TypeError("fetch failed");
      return jsonResponse({ drinks: [] });
    });

    await expect(fetchAllDrinks()).rejects.toThrow("fetch failed");
  });
});
