import { describe, expect, it } from "vitest";

import en from "./locales/en.json";
import { REVIEWED_PLACEHOLDER_MESSAGES } from "./placeholderMessages";

// Spec 0047 AC-12: every en.json message that inserts a value other than
// `count` (i18next's plural count) must be on the reviewed list, so its Russian
// wording keeps the value standing alone as a label. A new or changed message
// fails here until the list is updated and the native reviewer checks it.

type Tree = { readonly [key: string]: string | Tree };

const PLURAL_SUFFIX = /_(?:zero|one|two|few|many|other)$/;

/** `{{name}}` or `{{name, format}}`; the capture is the name. */
const INTERPOLATION = /\{\{\s*([^,}\s]+)[^}]*\}\}/g;

const messages = (tree: Tree, prefix = ""): readonly (readonly [string, string])[] =>
  Object.entries(tree).flatMap(([key, value]) =>
    typeof value === "string"
      ? [[prefix + key, value] as const]
      : messages(value, `${prefix}${key}.`),
  );

const placeholderMessages = (tree: Tree): Readonly<Record<string, readonly string[]>> => {
  const byFamily = messages(tree).reduce<Readonly<Record<string, readonly string[]>>>(
    (acc, [key, text]) => {
      const family = key.replace(PLURAL_SUFFIX, "");
      const names = [...text.matchAll(INTERPOLATION)]
        .map((match) => match[1])
        .filter((name) => name !== "count");
      return { ...acc, [family]: [...(acc[family] ?? []), ...names] };
    },
    {},
  );
  return Object.fromEntries(
    Object.entries(byFamily)
      .filter(([, names]) => names.length > 0)
      .map(([family, names]) => [family, [...new Set(names)].sort()]),
  );
};

describe("mobile placeholder messages", () => {
  it("match the reviewed list (update placeholderMessages.ts and have it reviewed)", () => {
    expect(placeholderMessages(en)).toEqual(REVIEWED_PLACEHOLDER_MESSAGES);
  });

  it("leave out count and fold a plural family into one entry", () => {
    expect(
      placeholderMessages({
        a: { b_one: "{{count}} item for {{who}}", b_other: "{{count}} items for {{who}}" },
        c: "Just {{count}}",
        d: "{{ when, datetime }}",
      }),
    ).toEqual({ "a.b": ["who"], d: ["when"] });
  });
});
