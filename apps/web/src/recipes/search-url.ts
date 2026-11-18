import type { SearchSort } from "@bartendingapp/shared";

/**
 * The search page URL for a query and sort (spec 0061 AC-8): `q` when there is
 * one, `sort=az` only for A to Z, so Popular keeps today's clean URL. Both the
 * typing effect and the sort handler build URLs here, so neither drops the
 * other's param.
 */
export function buildSearchUrl(query: string, sort: SearchSort): string {
  const params = new URLSearchParams();
  const trimmed = query.trim();
  if (trimmed) {
    params.set("q", trimmed);
  }
  if (sort === "az") {
    params.set("sort", "az");
  }
  const search = params.toString();
  return search ? `/search?${search}` : "/search";
}

/** sessionStorage key for the tab's last chosen sort (spec 0061 AC-9). */
export const SEARCH_SORT_STORAGE_KEY = "search.sort";

/** The tab's sessionStorage, or undefined on the server or when even touching it throws. */
export function tabStorage(): Storage | undefined {
  try {
    return typeof window === "undefined" ? undefined : window.sessionStorage;
  } catch {
    return undefined;
  }
}

/** Reads the tab's stored sort; private mode can throw, which reads as nothing stored. */
export function readStoredSearchSort(storage: Pick<Storage, "getItem"> | undefined): string | null {
  try {
    return storage?.getItem(SEARCH_SORT_STORAGE_KEY) ?? null;
  } catch {
    return null;
  }
}

/** Remembers the user's sort for this tab; a failing write is ignored. */
export function writeStoredSearchSort(
  storage: Pick<Storage, "setItem"> | undefined,
  sort: SearchSort,
): void {
  try {
    storage?.setItem(SEARCH_SORT_STORAGE_KEY, sort);
  } catch {
    // Private mode or blocked storage: the sort still works, it just is not remembered.
  }
}
