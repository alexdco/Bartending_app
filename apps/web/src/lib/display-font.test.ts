import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { SUPPORTED_LOCALES } from "@bartendingapp/shared";

import {
  BODY_SCRIPT_FONT_BY_LOCALE,
  DISPLAY_FONT_BY_LOCALE,
  DISPLAY_FONT_FILES,
  SCRIPT_FONT_STYLESHEET_BY_LOCALE,
  isShareImageFont,
} from "./display-font";
import { SHARE_IMAGE_LOCALE } from "./open-graph";
import { SCRIPT_FONT_STYLESHEETS } from "../../scripts/script-fonts.config.mjs";

// Spec 0047 AC-10: Russian headings use Lora (Fraunces has no Cyrillic).
// Spec 0048 AC-10: Hindi headings use Noto Serif Devanagari and Hindi body
// text adds Noto Sans Devanagari. Spec 0050 AC-11: Japanese does the same
// with Noto Serif JP and Noto Sans JP, and spec 0051 AC-10 Korean with Noto
// Serif KR and Noto Sans KR. Simplified Chinese uses Noto Serif SC and
// Noto Sans SC (spec 0052 AC-10). Every other locale keeps Fraunces and Inter
// alone, so only /ru downloads Lora and only /hi, /ja, /ko, and /zh download Noto.

describe("DISPLAY_FONT_BY_LOCALE", () => {
  it("gives Russian headings Lora", () => {
    expect(DISPLAY_FONT_BY_LOCALE.ru).toBe("lora");
  });

  it("gives Hindi headings Noto Serif Devanagari", () => {
    expect(DISPLAY_FONT_BY_LOCALE.hi).toBe("notoSerifDevanagari");
  });

  it("gives Japanese headings Noto Serif JP", () => {
    expect(DISPLAY_FONT_BY_LOCALE.ja).toBe("notoSerifJp");
  });

  it("gives Korean headings Noto Serif KR", () => {
    expect(DISPLAY_FONT_BY_LOCALE.ko).toBe("notoSerifKr");
  });

  it("gives Simplified Chinese headings Noto Serif SC", () => {
    expect(DISPLAY_FONT_BY_LOCALE.zh).toBe("notoSerifSc");
  });

  it("keeps every other locale on Fraunces", () => {
    const others = SUPPORTED_LOCALES.filter(
      (locale) =>
        locale !== "ru" && locale !== "hi" && locale !== "ja" && locale !== "ko" && locale !== "zh",
    );
    expect(others.map((locale) => DISPLAY_FONT_BY_LOCALE[locale])).toEqual(
      others.map(() => "fraunces"),
    );
  });
});

describe("BODY_SCRIPT_FONT_BY_LOCALE", () => {
  it("adds each script font only for its matching locale", () => {
    expect(BODY_SCRIPT_FONT_BY_LOCALE.hi).toBe("notoSansDevanagari");
    expect(BODY_SCRIPT_FONT_BY_LOCALE.ja).toBe("notoSansJp");
    expect(BODY_SCRIPT_FONT_BY_LOCALE.ko).toBe("notoSansKr");
    expect(BODY_SCRIPT_FONT_BY_LOCALE.zh).toBe("notoSansSc");
    const others = SUPPORTED_LOCALES.filter(
      (locale) => locale !== "hi" && locale !== "ja" && locale !== "ko" && locale !== "zh",
    );
    expect(others.map((locale) => BODY_SCRIPT_FONT_BY_LOCALE[locale])).toEqual(
      others.map(() => "none"),
    );
  });
});

describe("SCRIPT_FONT_STYLESHEET_BY_LOCALE (spec 0050 AC-11, spec 0051 AC-10)", () => {
  it("links Japanese, Korean, and Chinese stylesheets only on their respective locales", () => {
    expect(SCRIPT_FONT_STYLESHEET_BY_LOCALE.ja).toBe("/fonts/ja/fonts.css");
    expect(SCRIPT_FONT_STYLESHEET_BY_LOCALE.ko).toBe("/fonts/ko/fonts.css");
    expect(SCRIPT_FONT_STYLESHEET_BY_LOCALE.zh).toBe("/fonts/zh/fonts.css");
    const others = SUPPORTED_LOCALES.filter(
      (locale) => locale !== "ja" && locale !== "ko" && locale !== "zh",
    );
    expect(others.map((locale) => SCRIPT_FONT_STYLESHEET_BY_LOCALE[locale])).toEqual(
      others.map(() => null),
    );
  });

  it("points every stylesheet at a fetched config entry", () => {
    const fetched = SCRIPT_FONT_STYLESHEETS.map(({ dir }) => `/fonts/${dir}/fonts.css`);
    const linked = Object.values(SCRIPT_FONT_STYLESHEET_BY_LOCALE).filter((path) => path !== null);
    expect(linked.filter((path) => !fetched.includes(path))).toEqual([]);
  });
});

describe("SHARE_IMAGE_LOCALE (spec 0048 AC-19, spec 0050 AC-20, spec 0051 AC-19)", () => {
  it("maps Hindi, Japanese, Korean, and Chinese to the English card", () => {
    expect(SHARE_IMAGE_LOCALE.hi).toBe("en");
    expect(SHARE_IMAGE_LOCALE.ja).toBe("en");
    expect(SHARE_IMAGE_LOCALE.ko).toBe("en");
    expect(SHARE_IMAGE_LOCALE.zh).toBe("en");
    const others = SUPPORTED_LOCALES.filter(
      (locale) => locale !== "hi" && locale !== "ja" && locale !== "ko" && locale !== "zh",
    );
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
