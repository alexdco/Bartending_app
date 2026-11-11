import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { SUPPORTED_LOCALES } from "@bartendingapp/shared";

import {
  BODY_SCRIPT_FONT_BY_LOCALE,
  DISPLAY_FONT_BY_LOCALE,
  DISPLAY_FONT_FILES,
  isShareImageFont,
} from "./display-font";
import { SHARE_IMAGE_LOCALE } from "./open-graph";

// Spec 0047 AC-10: Russian headings use Lora (Fraunces has no Cyrillic).
// Spec 0048 AC-10: Hindi headings use Noto Serif Devanagari and Hindi body
// text adds Noto Sans Devanagari. Every other locale keeps Fraunces and Inter
// alone, so only /ru downloads Lora and only /hi downloads the Noto fonts.

describe("DISPLAY_FONT_BY_LOCALE", () => {
  it("gives Russian headings Lora", () => {
    expect(DISPLAY_FONT_BY_LOCALE.ru).toBe("lora");
  });

  it("gives Hindi headings Noto Serif Devanagari", () => {
    expect(DISPLAY_FONT_BY_LOCALE.hi).toBe("notoSerifDevanagari");
  });

  it("keeps every other locale on Fraunces", () => {
    const others = SUPPORTED_LOCALES.filter((locale) => locale !== "ru" && locale !== "hi");
    expect(others.map((locale) => DISPLAY_FONT_BY_LOCALE[locale])).toEqual(
      others.map(() => "fraunces"),
    );
  });
});

describe("BODY_SCRIPT_FONT_BY_LOCALE", () => {
  it("adds Noto Sans Devanagari for Hindi only", () => {
    expect(BODY_SCRIPT_FONT_BY_LOCALE.hi).toBe("notoSansDevanagari");
    const others = SUPPORTED_LOCALES.filter((locale) => locale !== "hi");
    expect(others.map((locale) => BODY_SCRIPT_FONT_BY_LOCALE[locale])).toEqual(
      others.map(() => "none"),
    );
  });
});

describe("SHARE_IMAGE_LOCALE (spec 0048 AC-19)", () => {
  it("maps Hindi to the English card and every other locale to itself", () => {
    expect(SHARE_IMAGE_LOCALE.hi).toBe("en");
    const others = SUPPORTED_LOCALES.filter((locale) => locale !== "hi");
    expect(others.map((locale) => SHARE_IMAGE_LOCALE[locale])).toEqual(others);
  });

  it("resolves every locale's card to a font the share image bundles", () => {
    const unbundled = SUPPORTED_LOCALES.filter(
      (locale) => !isShareImageFont(DISPLAY_FONT_BY_LOCALE[SHARE_IMAGE_LOCALE[locale]]),
    );
    expect(unbundled).toEqual([]);
  });
});

describe("DISPLAY_FONT_FILES", () => {
  it("points every locale's share image font at a bundled file", () => {
    const fontsDir = join(__dirname, "../assets/fonts");
    const missing = SUPPORTED_LOCALES.map(
      (locale) => DISPLAY_FONT_BY_LOCALE[SHARE_IMAGE_LOCALE[locale]],
    )
      .filter(isShareImageFont)
      .map((font) => DISPLAY_FONT_FILES[font].file)
      .filter((file) => !existsSync(join(fontsDir, file)));
    expect(missing).toEqual([]);
  });

  it("uses Lora SemiBold for the Russian share image", () => {
    expect(DISPLAY_FONT_FILES.lora).toEqual({
      name: "Lora",
      file: "Lora-SemiBold.ttf",
    });
  });
});
