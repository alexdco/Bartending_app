import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { BRAND_NAME, type Locale } from "@bartendingapp/shared";

type OpenGraph = NonNullable<Metadata["openGraph"]>;

export const OG_CARD_ID = "card";
export const OG_CARD_SIZE = { width: 1200, height: 630 };

/**
 * The locale whose tagline, font, and alt text a locale's share card uses
 * (spec 0048 AC-19). Itself, except Hindi, Japanese (spec 0050 AC-20), and
 * Korean (spec 0051 AC-19), whose cards stay English: the share image
 * renderer can't be trusted to shape Devanagari, and its bundled fonts have
 * no Devanagari, Japanese, or Hangul. Every target must have a
 * ShareImageFont (display-font.test.ts).
 */
export const SHARE_IMAGE_LOCALE: Record<Locale, Locale> = {
  en: "en",
  es: "es",
  pt: "pt",
  fr: "fr",
  ru: "ru",
  hi: "en",
  ja: "en",
  ko: "en",
  zh: "en",
};

// Next merges metadata shallowly per key, so a page that sets its own
// `openGraph` would drop the layout's `siteName`, and below the [locale]
// folder it also drops the generated card from opengraph-image.tsx. Every
// page that sets `openGraph` builds it here (spec 0037, AC-5): pass `images`
// to use the page's own image, or leave it out to get the locale's card.
export async function buildOpenGraph(
  locale: Locale,
  overrides: OpenGraph = {},
): Promise<OpenGraph> {
  const t = await getTranslations({ locale: SHARE_IMAGE_LOCALE[locale], namespace: "home" });
  const card = {
    url: `/${locale}/opengraph-image/${OG_CARD_ID}`,
    ...OG_CARD_SIZE,
    alt: t("ogTagline"),
  };
  return { siteName: BRAND_NAME, locale, images: [card], ...overrides };
}
