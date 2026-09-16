import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  appendBartenderRecentlyViewed,
  BARTENDER_RECENTLY_VIEWED_CAP,
  type BartenderRecentlyViewedEntry,
} from "@bartendingapp/shared";

const STORAGE_KEY = "bartenderRecentlyViewed";

export async function getBartenderRecentlyViewed(): Promise<BartenderRecentlyViewedEntry[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed)
      ? parsed.filter(
          (entry): entry is BartenderRecentlyViewedEntry =>
            typeof entry === "object" &&
            entry !== null &&
            typeof entry.id === "string" &&
            (entry.kind === "recipe" || entry.kind === "bar_recipe"),
        )
      : [];
  } catch {
    return [];
  }
}

export async function recordBartenderRecentlyViewed(
  entry: BartenderRecentlyViewedEntry,
): Promise<BartenderRecentlyViewedEntry[]> {
  const existing = await getBartenderRecentlyViewed();
  const updated = appendBartenderRecentlyViewed(existing, entry, BARTENDER_RECENTLY_VIEWED_CAP);

  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  } catch {
    // AsyncStorage may fail (quota, disabled); recently viewed tracking is best effort.
  }

  return updated;
}

/** Catalog recipe ids only, for search_bartender's recent_recipe_ids param (that RPC only accepts catalog recipe ids). */
export async function getBartenderRecentlyViewedRecipeIds(): Promise<string[]> {
  const entries = await getBartenderRecentlyViewed();
  return entries.filter((entry) => entry.kind === "recipe").map((entry) => entry.id);
}
