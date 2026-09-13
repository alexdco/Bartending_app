// Single source of truth for supported locales, read by both apps, the
// import job, and the sitemap. Adding a third language is a config change
// here plus a backfill run, not a schema change.
// Spec: docs/specs/0020-multi-language-support/index.md

export const SUPPORTED_LOCALES = ["en", "es"] as const;

export type Locale = (typeof SUPPORTED_LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "en";

export const LOCALE_TEXT_SEARCH_CONFIG: Record<Locale, string> = {
  en: "english",
  es: "spanish",
};

export function isSupportedLocale(value: string | null | undefined): value is Locale {
  return SUPPORTED_LOCALES.includes(value as Locale);
}

export function parseAcceptLanguage(header: string | null | undefined): Locale | null {
  if (!header) {
    return null;
  }

  const candidates = header
    .split(",")
    .map((part) => part.split(";")[0]?.trim().toLowerCase())
    .filter((tag): tag is string => Boolean(tag));

  for (const tag of candidates) {
    const primary = tag.split("-")[0];

    if (isSupportedLocale(primary)) {
      return primary;
    }
  }

  return null;
}
