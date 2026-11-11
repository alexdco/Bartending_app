import type { Locale } from "@bartendingapp/shared";

// The heading font per locale (spec 0047 AC-10). Fraunces has no Cyrillic, so
// Russian headings use Lora. A Record, so every new locale must pick one; a new
// script adds its font here, in layout.tsx, and in DISPLAY_FONT_FILES.

export type DisplayFont = "fraunces" | "lora";

export const DISPLAY_FONT_BY_LOCALE: Record<Locale, DisplayFont> = {
  en: "fraunces",
  es: "fraunces",
  pt: "fraunces",
  fr: "fraunces",
  ru: "lora",
};

/** The share image's bundled SemiBold file and font name, under src/assets/fonts. */
export const DISPLAY_FONT_FILES: Record<
  DisplayFont,
  { readonly name: string; readonly file: string }
> = {
  fraunces: { name: "Fraunces", file: "Fraunces-SemiBold.ttf" },
  lora: { name: "Lora", file: "Lora-SemiBold.ttf" },
};
