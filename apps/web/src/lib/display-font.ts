import type { Locale } from "@bartendingapp/shared";

// The heading font per locale (spec 0047 AC-10). Fraunces has no Cyrillic, so
// Russian headings use Lora; it has no Devanagari either, so Hindi headings
// use Noto Serif Devanagari (spec 0048 AC-10), and Japanese headings use Noto
// Serif JP (spec 0050 AC-11). A Record, so every new locale must pick one; a
// new script adds its font here and in layout.tsx.

export type DisplayFont = "fraunces" | "lora" | "notoSerifDevanagari" | "notoSerifJp";

export const DISPLAY_FONT_BY_LOCALE: Record<Locale, DisplayFont> = {
  en: "fraunces",
  es: "fraunces",
  pt: "fraunces",
  fr: "fraunces",
  ru: "lora",
  hi: "notoSerifDevanagari",
  ja: "notoSerifJp",
};

/**
 * The body font for a script Inter lacks, layered after Inter in
 * `--font-body` (spec 0048 AC-10, spec 0050 AC-11). "none" keeps Inter alone,
 * and the font is downloaded only on pages whose locale names it.
 */
export type BodyScriptFont = "none" | "notoSansDevanagari" | "notoSansJp";

export const BODY_SCRIPT_FONT_BY_LOCALE: Record<Locale, BodyScriptFont> = {
  en: "none",
  es: "none",
  pt: "none",
  fr: "none",
  ru: "none",
  hi: "notoSansDevanagari",
  ja: "notoSansJp",
};

/**
 * The self hosted font stylesheet a locale's layout links, or null (spec 0050
 * AC-11). CJK fonts ship this way, never through next/font in the shared
 * layout, which would put their @font-face rules into every locale's CSS. Each
 * path is an entry in scripts/script-fonts.config.mjs. A Record, so Korean and
 * Chinese must each choose.
 */
export const SCRIPT_FONT_STYLESHEET_BY_LOCALE: Record<Locale, string | null> = {
  en: null,
  es: null,
  pt: null,
  fr: null,
  ru: null,
  hi: null,
  ja: "/fonts/ja/fonts.css",
};

/** The display fonts the share image bundles; a locale without one maps away in SHARE_IMAGE_LOCALE. */
export type ShareImageFont = Extract<DisplayFont, "fraunces" | "lora">;

export function isShareImageFont(font: DisplayFont): font is ShareImageFont {
  return font === "fraunces" || font === "lora";
}

/** The share image's bundled SemiBold file and font name, under src/assets/fonts. */
export const DISPLAY_FONT_FILES: Record<
  ShareImageFont,
  { readonly name: string; readonly file: string }
> = {
  fraunces: { name: "Fraunces", file: "Fraunces-SemiBold.ttf" },
  lora: { name: "Lora", file: "Lora-SemiBold.ttf" },
};
