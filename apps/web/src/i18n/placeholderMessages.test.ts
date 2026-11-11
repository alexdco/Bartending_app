import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  isArgumentElement,
  isDateElement,
  isNumberElement,
  isPluralElement,
  isSelectElement,
  isTagElement,
  isTimeElement,
  parse,
  type MessageFormatElement,
} from "@formatjs/icu-messageformat-parser";
import { describe, expect, it } from "vitest";

import { REVIEWED_PLACEHOLDER_MESSAGES } from "./placeholderMessages";

// Spec 0047 AC-12: every en.json message that inserts a value other than a
// count must be on the reviewed list, so its Russian (and later locales')
// wording keeps the value standing alone as a label. A new or changed message
// fails here until the list is updated and the native reviewer checks it.

type Tree = { readonly [key: string]: string | Tree };

const en: Tree = JSON.parse(readFileSync(join(__dirname, "../../messages/en.json"), "utf8"));

const messages = (tree: Tree, prefix = ""): readonly (readonly [string, string])[] =>
  Object.entries(tree).flatMap(([key, value]) =>
    typeof value === "string"
      ? [[prefix + key, value] as const]
      : messages(value, `${prefix}${key}.`),
  );

const branches = (element: MessageFormatElement): readonly MessageFormatElement[] =>
  isPluralElement(element) || isSelectElement(element)
    ? Object.values(element.options).flatMap((option) => option.value)
    : isTagElement(element)
      ? element.children
      : [];

/** Names of every inserted value, anywhere in the message. */
const insertedNames = (elements: readonly MessageFormatElement[]): readonly string[] =>
  elements.flatMap((element) =>
    isArgumentElement(element) ||
    isNumberElement(element) ||
    isDateElement(element) ||
    isTimeElement(element)
      ? [element.value]
      : insertedNames(branches(element)),
  );

/** Names a plural block counts with, anywhere in the message. */
const countNames = (elements: readonly MessageFormatElement[]): readonly string[] =>
  elements.flatMap((element) => [
    ...(isPluralElement(element) ? [element.value] : []),
    ...countNames(branches(element)),
  ]);

const placeholderMessages = (tree: Tree): Readonly<Record<string, readonly string[]>> =>
  Object.fromEntries(
    messages(tree).flatMap(([key, text]) => {
      const elements = parse(text);
      const counts = new Set(countNames(elements));
      const names = [...new Set(insertedNames(elements))]
        .filter((name) => !counts.has(name))
        .sort();
      return names.length > 0 ? [[key, names] as const] : [];
    }),
  );

describe("web placeholder messages", () => {
  it("match the reviewed list (update placeholderMessages.ts and have it reviewed)", () => {
    expect(placeholderMessages(en)).toEqual(REVIEWED_PLACEHOLDER_MESSAGES);
  });

  it("leave out counts and keep names inside plural branches", () => {
    expect(
      placeholderMessages({
        a: "{count, plural, one {# item} other {# items}}",
        b: "{remaining, plural, =0 {Missing: {names}} other {Missing: {names} +# more}}",
        c: "<link>{name}</link> and {total}",
      }),
    ).toEqual({ b: ["names"], c: ["name", "total"] });
  });
});
