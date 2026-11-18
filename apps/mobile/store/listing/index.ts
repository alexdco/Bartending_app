// Every store listing locale, in App Store order (English is the primary).
// Spec 0057: grows to en, es, pt, fr, ja, zh in build task 3.
import { en } from "./en";
import type { StoreListing } from "./types";

export const STORE_LISTINGS: readonly StoreListing[] = [en];

export type { AppStoreLocale, ListingLocale, PlayLocale, StoreListing } from "./types";
export { STORE_LIMITS, findListingProblems, formatProblem, joinKeywords } from "./rules";
