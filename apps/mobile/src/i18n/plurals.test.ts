import { createInstance } from "i18next";
import { describe, expect, it } from "vitest";

import ru from "./locales/ru.json";
import hi from "./locales/hi.json";
import ja from "./locales/ja.json";
import ko from "./locales/ko.json";
import zh from "./locales/zh.json";

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

// Spec 0048 AC-11: Hindi counts 0 and 1 take _one, and 2 and 5 take _other.
// रेटिंग reads the same in both forms, so a probe namespace with distinct
// strings shows which form i18next picked.
const hindi = createInstance();
await hindi.init({
  resources: {
    hi: {
      translation: hi,
      probe: { form_one: "one", form_other: "other" },
    },
  },
  lng: "hi",
  fallbackLng: "en",
  interpolation: { escapeValue: false },
});

describe("Hindi plurals in i18next", () => {
  it.each([
    [0, "one"],
    [1, "one"],
    [2, "other"],
    [5, "other"],
  ] as const)("count %i uses _%s", (count, form) => {
    expect(hindi.t("form", { count, ns: "probe" })).toBe(form);
    const expected = hi.ratings[`summary_${form}`]
      .replace("{{average}}", "4.5")
      .replace("{{count}}", String(count));
    expect(hindi.t("ratings.summary", { count, average: "4.5" })).toBe(expected);
  });
});

// Spec 0050 AC-12: Japanese has only the other form, so counts 0, 1, 2, and 5
// all take _other. The probe's _one string would show if i18next picked it.
const japanese = createInstance();
await japanese.init({
  resources: {
    ja: {
      translation: ja,
      probe: { form_one: "one", form_other: "other" },
    },
  },
  lng: "ja",
  fallbackLng: "en",
  interpolation: { escapeValue: false },
});

describe("Japanese plurals in i18next", () => {
  it.each([0, 1, 2, 5])("count %i uses _other", (count) => {
    expect(japanese.t("form", { count, ns: "probe" })).toBe("other");
    const expected = ja.ratings.summary_other
      .replace("{{average}}", "4.5")
      .replace("{{count}}", String(count));
    expect(japanese.t("ratings.summary", { count, average: "4.5" })).toBe(expected);
  });
});

// Spec 0051 AC-12: Korean has only the other form too, so counts 0, 1, 2, and
// 5 all take _other.
const korean = createInstance();
await korean.init({
  resources: {
    ko: {
      translation: ko,
      probe: { form_one: "one", form_other: "other" },
    },
  },
  lng: "ko",
  fallbackLng: "en",
  interpolation: { escapeValue: false },
});

describe("Korean plurals in i18next", () => {
  it.each([0, 1, 2, 5])("count %i uses _other", (count) => {
    expect(korean.t("form", { count, ns: "probe" })).toBe("other");
    const expected = ko.ratings.summary_other
      .replace("{{average}}", "4.5")
      .replace("{{count}}", String(count));
    expect(korean.t("ratings.summary", { count, average: "4.5" })).toBe(expected);
  });
});

// Spec 0052 AC-12: all Chinese counts use _other.
const chinese = createInstance();
await chinese.init({
  resources: {
    zh: {
      translation: zh,
      probe: { form_one: "one", form_other: "other" },
    },
  },
  lng: "zh",
  fallbackLng: "en",
  interpolation: { escapeValue: false },
});

describe("Simplified Chinese plurals in i18next", () => {
  it.each([0, 1, 2, 5])("count %i uses _other", (count) => {
    expect(chinese.t("form", { count, ns: "probe" })).toBe("other");
    const expected = zh.ratings.summary_other
      .replace("{{average}}", "4.5")
      .replace("{{count}}", String(count));
    expect(chinese.t("ratings.summary", { count, average: "4.5" })).toBe(expected);
  });
});
