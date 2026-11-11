import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { SUPPORTED_LOCALES } from "@bartendingapp/shared";

import { DISPLAY_FONT_BY_LOCALE, DISPLAY_FONT_FILES } from "./display-font";

// Spec 0047 AC-10: Russian headings use Lora (Fraunces has no Cyrillic), and
// every other locale keeps Fraunces, so only /ru downloads Lora.

describe("DISPLAY_FONT_BY_LOCALE", () => {
  it("gives Russian headings Lora", () => {
    expect(DISPLAY_FONT_BY_LOCALE.ru).toBe("lora");
  });

  it("keeps every other locale on Fraunces", () => {
    const others = SUPPORTED_LOCALES.filter((locale) => locale !== "ru");
    expect(others.map((locale) => DISPLAY_FONT_BY_LOCALE[locale])).toEqual(
      others.map(() => "fraunces"),
    );
  });
});

describe("DISPLAY_FONT_FILES", () => {
  it("points every locale's share image font at a bundled file", () => {
    const fontsDir = join(__dirname, "../assets/fonts");
    const missing = SUPPORTED_LOCALES.map(
      (locale) => DISPLAY_FONT_FILES[DISPLAY_FONT_BY_LOCALE[locale]],
    )
      .map(({ file }) => file)
      .filter((file) => !existsSync(join(fontsDir, file)));
    expect(missing).toEqual([]);
  });

  it("uses Lora SemiBold for the Russian share image", () => {
    expect(DISPLAY_FONT_FILES[DISPLAY_FONT_BY_LOCALE.ru]).toEqual({
      name: "Lora",
      file: "Lora-SemiBold.ttf",
    });
  });
});
