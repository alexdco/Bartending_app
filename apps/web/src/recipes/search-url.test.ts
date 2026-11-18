import { describe, expect, it, vi } from "vitest";
import {
  SEARCH_SORT_STORAGE_KEY,
  buildSearchUrl,
  readStoredSearchSort,
  writeStoredSearchSort,
} from "./search-url";

describe("buildSearchUrl (spec 0061 AC-8)", () => {
  it("is bare /search for Popular with no query", () => {
    expect(buildSearchUrl("", "popular")).toBe("/search");
    expect(buildSearchUrl("   ", "popular")).toBe("/search");
  });

  it("adds sort=az only for A to Z", () => {
    expect(buildSearchUrl("", "az")).toBe("/search?sort=az");
  });

  it("keeps q and sort together, trimming and encoding q", () => {
    expect(buildSearchUrl(" lime ", "az")).toBe("/search?q=lime&sort=az");
    expect(buildSearchUrl("gin & tonic", "popular")).toBe("/search?q=gin+%26+tonic");
  });
});

describe("stored search sort (spec 0061 AC-9)", () => {
  it("reads and writes the search.sort key", () => {
    const store = new Map<string, string>();
    const storage = {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => void store.set(key, value),
    };
    writeStoredSearchSort(storage, "az");
    expect(store.get(SEARCH_SORT_STORAGE_KEY)).toBe("az");
    expect(readStoredSearchSort(storage)).toBe("az");
  });

  it("treats missing or throwing storage as nothing stored", () => {
    const throwing = {
      getItem: vi.fn(() => {
        throw new Error("SecurityError");
      }),
      setItem: vi.fn(() => {
        throw new Error("QuotaExceededError");
      }),
    };
    expect(readStoredSearchSort(undefined)).toBeNull();
    expect(readStoredSearchSort(throwing)).toBeNull();
    expect(() => writeStoredSearchSort(throwing, "az")).not.toThrow();
    expect(() => writeStoredSearchSort(undefined, "az")).not.toThrow();
  });
});
