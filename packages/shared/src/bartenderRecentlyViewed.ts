// Bartender Mode's own recently-viewed list (spec
// 0023-bartender-mode/0023-quick-build-mode.md, AC-5): distinct from the
// existing recentlyViewed.ts, which stores a flat list of catalog recipe
// ids consumed by the homepage/recommendations features on both apps
// (fetchRecipeRecommendations/fetchRecipesByIds assume every id is a
// catalog recipe). Mixing bar_recipe ids into that list would silently
// break those lookups, so Quick Build Mode keeps its own list that can
// hold either kind, used for its own "recently made" display and the
// search recency tier (search_bartender's recent_recipe_ids param still
// takes catalog ids only, filtered from this list, per that spec's
// value sourcing).

export const BARTENDER_RECENTLY_VIEWED_CAP = 20;

export type BartenderRecentlyViewedKind = "recipe" | "bar_recipe";

export interface BartenderRecentlyViewedEntry {
  id: string;
  kind: BartenderRecentlyViewedKind;
}

export function appendBartenderRecentlyViewed(
  list: BartenderRecentlyViewedEntry[],
  entry: BartenderRecentlyViewedEntry,
  cap: number = BARTENDER_RECENTLY_VIEWED_CAP,
): BartenderRecentlyViewedEntry[] {
  const deduped = [
    entry,
    ...list.filter((existing) => !(existing.id === entry.id && existing.kind === entry.kind)),
  ];
  return deduped.slice(0, cap);
}
