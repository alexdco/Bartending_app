// Single source of truth for supported locales, read by both apps, the
// import job, and the sitemap. The database's own list is the
// supported_locales table; the locale parity test keeps the two in sync.
// Adding a language is a supported_locales row, entries here, message files,
// and a translation backfill, with no SQL function edits.
// Specs: docs/specs/0020-multi-language-support/index.md,
// docs/specs/0045-language-agnostic-locales-portuguese/index.md

export const SUPPORTED_LOCALES = ["en", "es", "pt"] as const;

export type Locale = (typeof SUPPORTED_LOCALES)[number];

/** A translation locale: English lives on the base rows, never as a translation. */
export type NonDefaultLocale = Exclude<Locale, "en">;

export const DEFAULT_LOCALE: Locale = "en";

/**
 * The locales users can discover (switcher, detection, sitemap, hreflang).
 * Every supported locale still routes; only discovery is gated. Portuguese
 * joins at launch, in the same commit as CATALOG_TRANSLATION_LOCALES.
 */
export const LAUNCHED_LOCALES: readonly Locale[] = ["en", "es"];

/**
 * The locales the import job translates new catalog rows into. Holds only
 * launched locales outside a backfill run.
 */
export const CATALOG_TRANSLATION_LOCALES: readonly NonDefaultLocale[] = ["es"];

export const LOCALE_TEXT_SEARCH_CONFIG: Record<Locale, string> = {
  en: "english",
  es: "spanish",
  pt: "portuguese",
};

/** BCP 47 codes for hreflang, the sitemap, and <html lang>. URLs keep the bare code. */
export const LOCALE_HREFLANG: Record<Locale, string> = {
  en: "en",
  es: "es",
  pt: "pt-BR",
};

/** The language named in AI translation and recipe notes prompts. */
export const LOCALE_AI_LANGUAGE: Record<Locale, string> = {
  en: "English",
  es: "Latin American Spanish",
  pt: "Brazilian Portuguese",
};

/** Each language's own name, shown in the switcher whatever the active language. */
export const LOCALE_NATIVE_NAME: Record<Locale, string> = {
  en: "English",
  es: "Español",
  pt: "Português",
};

export function isSupportedLocale(value: string | null | undefined): value is Locale {
  return SUPPORTED_LOCALES.includes(value as Locale);
}

export function isNonDefaultLocale(value: string | null | undefined): value is NonDefaultLocale {
  return isSupportedLocale(value) && value !== DEFAULT_LOCALE;
}

export function isLaunchedLocale(value: string | null | undefined): value is Locale {
  return LAUNCHED_LOCALES.includes(value as Locale);
}

export function parseAcceptLanguage(
  header: string | null | undefined,
  allowed: readonly Locale[] = LAUNCHED_LOCALES,
): Locale | null {
  if (!header) {
    return null;
  }

  const candidates = header
    .split(",")
    .map((part) => part.split(";")[0]?.trim().toLowerCase())
    .filter((tag): tag is string => Boolean(tag));

  for (const tag of candidates) {
    const primary = tag.split("-")[0];

    if (isSupportedLocale(primary) && allowed.includes(primary)) {
      return primary;
    }
  }

  return null;
}
