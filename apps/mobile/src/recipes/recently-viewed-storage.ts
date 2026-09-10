import AsyncStorage from "@react-native-async-storage/async-storage";
import { appendRecentlyViewed, RECENTLY_VIEWED_CAP } from "@bartendingapp/shared";

const STORAGE_KEY = "recentlyViewedRecipeIds";

export async function getRecentlyViewedRecipeIds(): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string") : [];
  } catch {
    return [];
  }
}

export async function recordRecentlyViewedRecipe(id: string): Promise<string[]> {
  const existing = await getRecentlyViewedRecipeIds();
  const updated = appendRecentlyViewed(existing, id, RECENTLY_VIEWED_CAP);

  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  } catch {
    // AsyncStorage may fail (quota, disabled); recently viewed tracking is best effort.
  }

  return updated;
}
