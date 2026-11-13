import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Spec 0051 AC-22: every string in messages/ko.json is NFC and has no Han
// character (Hanja), full width ASCII, ideographic space, or Japanese
// punctuation, so the UI strings are checked automatically, not only by the
// AI second pass. The mobile file has the same scan in locales.test.ts.

type Tree = { readonly [key: string]: string | Tree };

const ko: Tree = JSON.parse(readFileSync(join(__dirname, "../../messages/ko.json"), "utf8"));

const messages = (tree: Tree, prefix = ""): readonly (readonly [string, string])[] =>
  Object.entries(tree).flatMap(([key, value]) =>
    typeof value === "string"
      ? [[prefix + key, value] as const]
      : messages(value, `${prefix}${key}.`),
  );

const FORBIDDEN =
  /[\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF\uFF01-\uFF5E\u3000\u3002\u3001\u300C\u300D\u300E\u300F]/u;

/** One line per bad string, as `key: reason`. */
const koreanStringIssues = (tree: Tree): readonly string[] =>
  messages(tree).flatMap(([key, text]) => [
    ...(FORBIDDEN.test(text) ? [`${key}: forbidden character`] : []),
    ...(text === text.normalize("NFC") ? [] : [`${key}: not NFC`]),
  ]);

describe("messages/ko.json strings scan", () => {
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
