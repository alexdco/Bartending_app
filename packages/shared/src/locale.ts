// Single source of truth for supported locales, read by both apps, the
// import job, and the sitemap. The database's own list is the
// supported_locales table; the locale parity test keeps the two in sync.
// Adding a language is a supported_locales row, entries here, message files,
// and a translation backfill, with no SQL function edits.
// Specs: docs/specs/0020-multi-language-support/index.md,
// docs/specs/0045-language-agnostic-locales-portuguese/index.md,
// docs/specs/0046-french-locale.md

export const SUPPORTED_LOCALES = ["en", "es", "pt", "fr"] as const;

export type Locale = (typeof SUPPORTED_LOCALES)[number];

/** A translation locale: English lives on the base rows, never as a translation. */
export type NonDefaultLocale = Exclude<Locale, "en">;

export const DEFAULT_LOCALE: Locale = "en";

export const NON_DEFAULT_LOCALES: readonly NonDefaultLocale[] = SUPPORTED_LOCALES.filter(
  (locale): locale is NonDefaultLocale => locale !== DEFAULT_LOCALE,
);

/**
 * The locales users can discover (switcher, detection, sitemap, hreflang).
 * Every supported locale still routes; only discovery is gated. A new locale
 * joins at launch, in the same commit as CATALOG_TRANSLATION_LOCALES.
 */
export const LAUNCHED_LOCALES: readonly Locale[] = ["en", "es", "pt", "fr"];

/**
 * The locales the import job translates new catalog rows into, and the
 * blocks the default recipe notes run writes. Holds only launched locales
 * outside a backfill run.
 */
export const CATALOG_TRANSLATION_LOCALES = [
  "es",
  "pt",
  "fr",
] as const satisfies readonly NonDefaultLocale[];

export type CatalogTranslationLocale = (typeof CATALOG_TRANSLATION_LOCALES)[number];

export const LOCALE_TEXT_SEARCH_CONFIG: Record<Locale, string> = {
  en: "english",
  es: "spanish",
  pt: "portuguese",
  // Strips accents before stemming, so "creme" finds "crème" (spec 0046 AC-3).
  fr: "public.french_unaccent",
};

/** BCP 47 codes for hreflang, the sitemap, and <html lang>. URLs keep the bare code. */
export const LOCALE_HREFLANG: Record<Locale, string> = {
  en: "en",
  es: "es",
  pt: "pt-BR",
  fr: "fr",
};

/** The language named in AI translation and recipe notes prompts. */
export const LOCALE_AI_LANGUAGE: Record<Locale, string> = {
  en: "English",
  es: "Latin American Spanish",
  pt: "Brazilian Portuguese",
  fr: "French as written in France",
};

/**
 * Regional wording the AI prompts must follow, appended to them as is. Empty
 * when a language needs none, or starting with a space.
 */
export const LOCALE_AI_TERMS: Record<Locale, string> = {
  en: "",
  es: "",
  pt:
    ' Use Brazilian citrus terms: lime is "limão", lemon is "limão-siciliano", limeade is ' +
    '"limonada", and lemonade is "limonada siciliana". Never write "lima" for lime, and keep ' +
    "lemon and lime distinct.",
  // Approved in the native review (spec 0046). generate-drink-idea carries a
  // hand copy of the citrus and typography sentences: change both together.
  fr:
    ' Lime is "citron vert" and lemon is "citron jaune"; never write "citron" alone for lime, ' +
    'and keep lemon and lime distinct. Bar tools: shaker is "shaker", jigger is "doseur", ' +
    'muddler is "pilon", strainer is "passoire", and bar spoon is "cuillère à mélange". Use ' +
    "French typography: a narrow no break space before ; ! ? and a no break space before :, " +
    "and « » quotes.",
};

/** Each language's own name, shown in the switcher whatever the active language. */
export const LOCALE_NATIVE_NAME: Record<Locale, string> = {
  en: "English",
  es: "Español",
  pt: "Português",
  fr: "Français",
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

/**
 * The one filter for a stored preference (web cookie, mobile AsyncStorage,
 * user_preferences.locale). An unlaunched value counts as absent but is left
 * in place, so it applies again at launch (spec 0045 AC-7).
 */
export function resolveStoredLocale(
  value: string | null | undefined,
  { allowUnlaunched = false }: { allowUnlaunched?: boolean } = {},
): Locale | null {
  if (!isSupportedLocale(value)) {
    return null;
  }
  return allowUnlaunched || isLaunchedLocale(value) ? value : null;
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

/** The locale a path with no locale prefix redirects to (spec 0045 AC-7). */
export function resolveRedirectLocale(
  storedLocale: string | null | undefined,
  acceptLanguage: string | null | undefined,
): Locale {
  return resolveStoredLocale(storedLocale) ?? parseAcceptLanguage(acceptLanguage) ?? DEFAULT_LOCALE;
}

/**
 * A page's hreflang alternates, keyed by hreflang code, launched locales only.
 * An unlaunched page gets none (spec 0045 AC-7).
 */
export function hreflangAlternates(
  locale: Locale,
  pathFor: (candidate: Locale) => string,
): Record<string, string> {
  return isLaunchedLocale(locale)
    ? Object.fromEntries(
        LAUNCHED_LOCALES.map((candidate) => [LOCALE_HREFLANG[candidate], pathFor(candidate)]),
      )
    : {};
}
