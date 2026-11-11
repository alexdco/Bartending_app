import { createInstance } from "i18next";
import { describe, expect, it } from "vitest";

import ru from "./locales/ru.json";

// Spec 0047 AC-11: i18next resolves Russian counts to the right plural form.
// Runs the real i18next with the same resource shape and options as initI18n
// (index.ts itself pulls in native modules that do not load in Node).

const instance = createInstance();
await instance.init({
  resources: { ru: { translation: ru } },
  lng: "ru",
  fallbackLng: "en",
  interpolation: { escapeValue: false },
});

describe("Russian plurals in i18next", () => {
  it.each([
    [1, "summary_one"],
    [2, "summary_few"],
    [5, "summary_many"],
    [21, "summary_one"],
  ] as const)("count %i uses %s", (count, key) => {
    const expected = ru.ratings[key]
      .replace("{{average}}", "4.5")
      .replace("{{count}}", String(count));
    expect(instance.t("ratings.summary", { count, average: "4.5" })).toBe(expected);
  });

  it("reads «2 оценки», «5 оценок», and «21 оценка»", () => {
    expect(instance.t("ratings.summary", { count: 2, average: "4" })).toBe("4 (2 оценки)");
    expect(instance.t("ratings.summary", { count: 5, average: "4" })).toBe("4 (5 оценок)");
    expect(instance.t("ratings.summary", { count: 21, average: "4" })).toBe("4 (21 оценка)");
  });
});
