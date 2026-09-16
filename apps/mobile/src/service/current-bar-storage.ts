import AsyncStorage from "@react-native-async-storage/async-storage";

const STORAGE_KEY = "currentBarId";

// The last bar the bartender explicitly selected, per spec
// 0023-bar-data-model.md's "current bar" value sourcing: persisted client
// side, defaulting to the earliest joined bar_members row when unset (the
// caller's responsibility, this module only remembers an explicit choice).
export async function getStoredCurrentBarId(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export async function setStoredCurrentBarId(barId: string): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, barId);
  } catch {
    // Best effort; falling back to the default bar next launch is an
    // acceptable degradation if storage is unavailable.
  }
}
