import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parse, TYPE, type MessageFormatElement } from "@formatjs/icu-messageformat-parser";
import { findBannedChineseTerms, findTraditionalCharacters } from "@bartendingapp/shared";

type Tree = { readonly [key: string]: string | Tree };
const strings = (tree: Tree, prefix = ""): readonly (readonly [string, string])[] =>
  Object.entries(tree).flatMap(([key, value]) =>
    typeof value === "string"
      ? [[prefix + key, value] as const]
      : strings(value, `${prefix}${key}.`),
  );

// Spec 0052 AC-22. Full width punctuation is intentional; digits and Latin
// letters, Japanese quotes, kana, and Hangul are not.
const FORBIDDEN =
  /[０-９Ａ-Ｚａ-ｚ　「」『』\u3041-\u30FA\u30FD-\u30FF\u1100-\u11FF\u3130-\u318F\uAC00-\uD7A3]/u;
// Number placeholders, unlike text placeholders, need spaces beside Han.
const HAN = "[\\u3400-\\u4DBF\\u4E00-\\u9FFF\\uF900-\\uFAFF]";
const NUMBER_ARGUMENT =
  "\\{\\{?(?:time|count|remaining|number|average|page|pages|max|min|score|total|parts)\\}\\}?";
const UNSPACED_NUMBER = new RegExp(
  HAN + "(?:" + NUMBER_ARGUMENT + "|#)|(?:" + NUMBER_ARGUMENT + "|#)" + HAN,
  "u",
);
const issues = (tree: Tree): readonly string[] =>
  strings(tree).flatMap(([key, text]) => [
    ...(text === text.normalize("NFC") ? [] : [`${key}: not NFC`]),
    ...(FORBIDDEN.test(text) ? [`${key}: forbidden character`] : []),
    ...(UNSPACED_NUMBER.test(text) ? [`${key}: unspaced number placeholder`] : []),
    ...findTraditionalCharacters(text).map((char) => `${key}: Traditional ${char}`),
    ...findBannedChineseTerms(text).map((term) => `${key}: banned ${term}`),
  ]);

const catalogs = [
  ["web", join(__dirname, "../../messages/zh.json")],
  ["mobile", join(__dirname, "../../../mobile/src/i18n/locales/zh.json")],
] as const;

describe("Simplified Chinese strings (web and mobile)", () => {
  it.each(catalogs)(
    "%s has NFC Simplified Chinese with no forbidden characters or terms",
    (_name, path) => {
      const tree: Tree = JSON.parse(readFileSync(path, "utf8"));
      expect(issues(tree)).toEqual([]);
    },
  );

  it.each(["麗", "の", "１", "Ａ", "「", "가", "您"])("catches planted %s", (text) => {
    expect(issues({ planted: text })).not.toEqual([]);
  });

  it.each(["请在{time}后重试。", "平均{average}分", "共{{count}}条评分", "另有#种"])(
    "catches an unspaced number in %s",
    (text) => {
      expect(issues({ planted: text })).toContain("planted: unspaced number placeholder");
    },
  );

  it("permits spaced numbers and adjacent text placeholders", () => {
    expect(
      issues({ time: "请在 {time} 后重试。", count: "共 {{count}} 条评分", name: "{name}已保存" }),
    ).toEqual([]);
  });

  it("permits mainland punctuation, brands, and units", () => {
    expect(issues({ sample: "加入 30 ml 金酒，摇匀。用 Boston 摇酒壶！" })).toEqual([]);
  });
});

// Preserve both interpolated values and rich text tags while translating.
const tokens = (elements: readonly MessageFormatElement[]): readonly string[] =>
  elements.flatMap((element): readonly string[] => {
    if (element.type === TYPE.literal || element.type === TYPE.pound) return [];
    if (element.type === TYPE.tag) return ["tag:" + element.value, ...tokens(element.children)];
    if (element.type === TYPE.select || element.type === TYPE.plural) {
      return [
        "arg:" + element.value,
        ...Object.values(element.options).flatMap((option) => tokens(option.value)),
      ];
    }
    return ["arg:" + element.value];
  });
const distinct = (values: readonly string[]): readonly string[] => [...new Set(values)].sort();

describe("Chinese interpolation", () => {
  it("preserves every web argument and rich text tag", () => {
    const en: Tree = JSON.parse(readFileSync(join(__dirname, "../../messages/en.json"), "utf8"));
    const zh: Tree = JSON.parse(readFileSync(join(__dirname, "../../messages/zh.json"), "utf8"));
    const translated = Object.fromEntries(strings(zh));
    const drift = strings(en)
      .filter(
        ([key, value]) =>
          JSON.stringify(distinct(tokens(parse(value)))) !==
          JSON.stringify(distinct(tokens(parse(translated[key])))),
      )
      .map(([key]) => key);
    expect(drift).toEqual([]);
  });

  it("preserves every mobile interpolation value", () => {
    const en: Tree = JSON.parse(
      readFileSync(join(__dirname, "../../../mobile/src/i18n/locales/en.json"), "utf8"),
    );
    const zh: Tree = JSON.parse(
      readFileSync(join(__dirname, "../../../mobile/src/i18n/locales/zh.json"), "utf8"),
    );
    const translated = Object.fromEntries(strings(zh));
    const names = (value: string): readonly string[] =>
      distinct([...value.matchAll(/{{(\w+)}}/g)].map((match) => match[1]));
    expect(
      strings(en)
        .filter(([key]) => !key.endsWith("_one"))
        .filter(
          ([key, value]) => JSON.stringify(names(value)) !== JSON.stringify(names(translated[key])),
        )
        .map(([key]) => key),
    ).toEqual([]);
  });
});
