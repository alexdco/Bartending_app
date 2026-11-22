import { createContext, useContext, type ReactNode } from "react";

// Mocktails only mode on mobile (spec 0063). The root layout passes in whether
// the mode is on, read from the in memory age gate state, so every screen and
// hook reads it from one place. The root layout renders nothing until the gate
// read finishes, so inside the provider the mode is always known. Outside it
// (a test, a stray render) the value is "unknown" and filtered lists stay
// disabled rather than fetching without the flag (AC-19).

type MocktailsState = "unknown" | boolean;

const MocktailsContext = createContext<MocktailsState>("unknown");

export function MocktailsOnlyProvider({
  mocktailsOnly,
  children,
}: {
  readonly mocktailsOnly: boolean;
  readonly children: ReactNode;
}) {
  return <MocktailsContext.Provider value={mocktailsOnly}>{children}</MocktailsContext.Provider>;
}

/** True only when the mode is known and on. */
export function useMocktailsOnly(): boolean {
  return useContext(MocktailsContext) === true;
}

export interface MocktailsQueryFlag {
  /** Pass to the shared fetcher and put in the query key (spec 0063 AC-5). */
  readonly mocktailsOnly: boolean;
  /** False until the mode is known; AND it into `enabled` (AC-19). */
  readonly ready: boolean;
}

// The two values every filtered list query needs, from one context read, so
// no list can fetch (and paint) before the mode is known.
export function useMocktailsQuery(): MocktailsQueryFlag {
  const state = useContext(MocktailsContext);
  return { mocktailsOnly: state === true, ready: state !== "unknown" };
}
