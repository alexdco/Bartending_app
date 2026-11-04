import { defineRouting } from "next-intl/routing";
import { SUPPORTED_LOCALES, DEFAULT_LOCALE } from "@bartendingapp/shared";

export const routing = defineRouting({
  locales: SUPPORTED_LOCALES,
  defaultLocale: DEFAULT_LOCALE,
  // proxy.ts picks the locale for unprefixed paths, so an unlaunched locale is
  // never detected, and page metadata owns hreflang (spec 0045 AC-7).
  localeDetection: false,
  alternateLinks: false,
});
