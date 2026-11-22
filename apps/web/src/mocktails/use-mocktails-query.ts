"use client";

import { useMocktailsState } from "@/age-gate/age-gate-store";

export interface MocktailsQueryFlag {
  /** Pass to the shared fetcher and put in the query key (spec 0063 AC-5). */
  readonly mocktailsOnly: boolean;
  /** False until the mode is known; AND it into `enabled` (AC-19). */
  readonly ready: boolean;
}

// The two values every filtered list query needs, from one read of the gate
// store, so no list can fetch (and paint) before the mode is known.
export function useMocktailsQuery(): MocktailsQueryFlag {
  const state = useMocktailsState();
  return { mocktailsOnly: state === true, ready: state !== "unknown" };
}
