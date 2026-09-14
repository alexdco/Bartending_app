import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import * as Localization from "expo-localization";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { DEFAULT_LOCALE, isSupportedLocale, type Locale } from "@bartendingapp/shared";
import en from "./locales/en.json";
import es from "./locales/es.json";

const STORAGE_KEY = "localePreference";

function detectDeviceLocale(): Locale {
  const [primary] = Localization.getLocales();
  return isSupportedLocale(primary?.languageCode) ? primary.languageCode : DEFAULT_LOCALE;
}

export async function getStoredLocale(): Promise<Locale | null> {
  try {
    const stored = await AsyncStorage.getItem(STORAGE_KEY);
    return isSupportedLocale(stored) ? stored : null;
  } catch {
    return null;
  }
}

export async function setStoredLocale(locale: Locale): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, locale);
  } catch {
    // AsyncStorage may fail (quota, disabled); locale switch still applies in memory.
  }
}

export async function changeLocale(locale: Locale): Promise<void> {
  await setStoredLocale(locale);
  await i18n.changeLanguage(locale);
}

export async function initI18n(): Promise<void> {
  const stored = await getStoredLocale();
  const initialLocale = stored ?? detectDeviceLocale();

  if (!i18n.isInitialized) {
    await i18n.use(initReactI18next).init({
      resources: {
        en: { translation: en },
        es: { translation: es },
      },
      lng: initialLocale,
      fallbackLng: DEFAULT_LOCALE,
      interpolation: { escapeValue: false },
    });
  }
}

export { i18n };
