import i18n from "i18next";
import { initReactI18next, useTranslation } from "react-i18next";
import * as Localization from "expo-localization";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  DEFAULT_LOCALE,
  isLaunchedLocale,
  isSupportedLocale,
  LAUNCHED_LOCALES,
  resolveStoredLocale,
  SUPPORTED_LOCALES,
  type Locale,
} from "@bartendingapp/shared";
import en from "./locales/en.json";
import es from "./locales/es.json";
import pt from "./locales/pt.json";
import fr from "./locales/fr.json";
import ru from "./locales/ru.json";

const STORAGE_KEY = "localePreference";

/** Dev and preview builds can reach every supported locale (spec 0045 AC-8). */
const showAllLocales = __DEV__ || process.env.EXPO_PUBLIC_SHOW_ALL_LOCALES === "true";

export const selectableLocales: readonly Locale[] = showAllLocales
  ? SUPPORTED_LOCALES
  : LAUNCHED_LOCALES;

function detectDeviceLocale(): Locale {
  const [primary] = Localization.getLocales();
  // Detection never picks an unlaunched locale (spec 0045 AC-7).
  return isLaunchedLocale(primary?.languageCode) ? primary.languageCode : DEFAULT_LOCALE;
}

export async function getStoredLocale(): Promise<Locale | null> {
  try {
    const stored = await AsyncStorage.getItem(STORAGE_KEY);
    return resolveStoredLocale(stored, { allowUnlaunched: showAllLocales });
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
        pt: { translation: pt },
        fr: { translation: fr },
        // i18next ^26 picks _one/_few/_many/_other through Intl.PluralRules (spec 0047 AC-11).
        ru: { translation: ru },
      },
      lng: initialLocale,
      fallbackLng: DEFAULT_LOCALE,
      interpolation: { escapeValue: false },
    });
  }
}

export function useActiveLocale(): Locale {
  const { i18n: instance } = useTranslation();
  return isSupportedLocale(instance.language) ? instance.language : DEFAULT_LOCALE;
}

export { i18n };
