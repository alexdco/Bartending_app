import { appendRecentlyViewed, RECENTLY_VIEWED_CAP } from "@bartendingapp/shared";

const STORAGE_KEY = "recentlyViewedRecipeIds";

export function getRecentlyViewedRecipeIds(): string[] {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string") : [];
  } catch {
    return [];
  }
}

export function recordRecentlyViewedRecipe(id: string): string[] {
  const updated = appendRecentlyViewed(getRecentlyViewedRecipeIds(), id, RECENTLY_VIEWED_CAP);

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  } catch {
    // Local storage may be unavailable (private browsing, quota); recently viewed tracking is best effort.
  }

  return updated;
}
