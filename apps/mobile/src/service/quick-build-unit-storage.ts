import AsyncStorage from "@react-native-async-storage/async-storage";

export type QuickBuildUnit = "oz" | "ml" | "parts";

const STORAGE_KEY = "quickBuildUnit";
const DEFAULT_UNIT: QuickBuildUnit = "oz";

export async function getStoredQuickBuildUnit(): Promise<QuickBuildUnit> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    return raw === "oz" || raw === "ml" || raw === "parts" ? raw : DEFAULT_UNIT;
  } catch {
    return DEFAULT_UNIT;
  }
}

export async function setStoredQuickBuildUnit(unit: QuickBuildUnit): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, unit);
  } catch {
    // Best effort; falling back to the default unit next open is acceptable.
  }
}
