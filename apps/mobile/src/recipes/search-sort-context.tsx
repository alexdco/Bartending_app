import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import { DEFAULT_SEARCH_SORT, type SearchSort } from "@bartendingapp/shared";

type SearchSortState = readonly [SearchSort, (next: SearchSort) => void];

const noop = () => {};

// Outside the provider (screen tests) the sort is Popular and changes are dropped.
const SearchSortContext = createContext<SearchSortState>([DEFAULT_SEARCH_SORT, noop]);

/**
 * Holds the search sort above the navigator so it survives leaving search and
 * coming back, for as long as the app process lives (spec 0061 AC-10).
 * Nothing is written to device storage; a fresh launch starts at Popular.
 */
export function SearchSortProvider({ children }: { children: ReactNode }) {
  const [sort, setSort] = useState<SearchSort>(DEFAULT_SEARCH_SORT);
  const value = useMemo<SearchSortState>(() => [sort, setSort], [sort]);
  return <SearchSortContext.Provider value={value}>{children}</SearchSortContext.Provider>;
}

export function useSearchSort(): SearchSortState {
  return useContext(SearchSortContext);
}
