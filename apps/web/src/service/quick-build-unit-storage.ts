export type QuickBuildUnit = "oz" | "ml" | "parts";

const STORAGE_KEY = "quickBuildUnit";
const DEFAULT_UNIT: QuickBuildUnit = "oz";

export async function getStoredQuickBuildUnit(): Promise<QuickBuildUnit> {
  if (typeof window === "undefined") {
    return DEFAULT_UNIT;
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw === "oz" || raw === "ml" || raw === "parts" ? raw : DEFAULT_UNIT;
  } catch {
    return DEFAULT_UNIT;
  }
}

export async function setStoredQuickBuildUnit(unit: QuickBuildUnit): Promise<void> {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(STORAGE_KEY, unit);
  } catch {
    // Best effort; falling back to the default unit next open is acceptable.
  }
}
