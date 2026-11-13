import { describe, expect, it } from "vitest";
import { NON_DEFAULT_LOCALES, type NonDefaultLocale } from "@bartendingapp/shared";

import en from "./locales/en.json";
import es from "./locales/es.json";
import fr from "./locales/fr.json";
import pt from "./locales/pt.json";
import ru from "./locales/ru.json";
import hi from "./locales/hi.json";
import ja from "./locales/ja.json";
import ko from "./locales/ko.json";

// Spec 0046 build step 4: every locale's resource file holds the same keys as
// en.json. A plural family (`summary_one`, `summary_few`, ...) counts as one
// key, since Russian has more plural forms than English (spec 0047 AC-11).

type Tree = { readonly [key: string]: string | Tree };

// Keyed by NonDefaultLocale, so a new locale fails typecheck until it is here.
const resources: Record<NonDefaultLocale, Tree> = { es, pt, fr, ru, hi, ja, ko };

const PLURAL_SUFFIX = /_(?:zero|one|two|few|many|other)$/;

const keyPaths = (tree: Tree, prefix = ""): readonly string[] =>
  Object.entries(tree).flatMap(([key, value]) =>
    typeof value === "string" ? [prefix + key] : keyPaths(value, `${prefix}${key}.`),
  );

const keyFamilies = (tree: Tree): readonly string[] =>
  [...new Set(keyPaths(tree).map((path) => path.replace(PLURAL_SUFFIX, "")))].sort();

describe("mobile locale files", () => {
  it.each(NON_DEFAULT_LOCALES)("%s.json has the same keys as en.json", (locale) => {
    expect(keyFamilies(resources[locale])).toEqual(keyFamilies(en));
  });
});

// Spec 0051 AC-22: every string in ko.json is NFC and has no Han character
// (Hanja), full width ASCII, ideographic space, or Japanese punctuation. The
// web file has the same scan in apps/web/src/i18n/koreanStrings.test.ts.
const KOREAN_FORBIDDEN =
  /[\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF\uFF01-\uFF5E\u3000\u3002\u3001\u300C\u300D\u300E\u300F]/u;

const strings = (tree: Tree, prefix = ""): readonly (readonly [string, string])[] =>
  Object.entries(tree).flatMap(([key, value]) =>
    typeof value === "string"
      ? [[prefix + key, value] as const]
      : strings(value, `${prefix}${key}.`),
  );

/** One line per bad string, as `key: reason`. */
const koreanStringIssues = (tree: Tree): readonly string[] =>
  strings(tree).flatMap(([key, text]) => [
    ...(KOREAN_FORBIDDEN.test(text) ? [`${key}: forbidden character`] : []),
    ...(text === text.normalize("NFC") ? [] : [`${key}: not NFC`]),
  ]);

describe("ko.json strings scan", () => {
  it("has only NFC strings with no Hanja, full width ASCII, or Japanese punctuation", () => {
    expect(koreanStringIssues(ko)).toEqual([]);
  });

  it("fails a planted Han character, 。, and a decomposed syllable", () => {
    expect(koreanStringIssues({ a: "진 酒", b: "넣어요。", c: "\u110C\u1175\u11AB" })).toEqual([
      "a: forbidden character",
      "b: forbidden character",
      "c: not NFC",
    ]);
  });
});
