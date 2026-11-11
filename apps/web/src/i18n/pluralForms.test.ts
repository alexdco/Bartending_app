import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  isPluralElement,
  isSelectElement,
  isTagElement,
  parse,
  type MessageFormatElement,
} from "@formatjs/icu-messageformat-parser";
import { describe, expect, it } from "vitest";
import { NON_DEFAULT_LOCALES, requiredPluralForms, type Locale } from "@bartendingapp/shared";

// Spec 0047 AC-11: every ICU `plural` block in a non English message file has
// every plural form its locale reaches for whole numbers (Russian: one, few,
// many, other). Exact matches like `=0` don't count toward a form.

type Tree = { readonly [key: string]: string | Tree };

type PluralBlock = {
  readonly argument: string;
  readonly forms: readonly string[];
  readonly ordinal: boolean;
};

const read = (locale: string): Tree =>
  JSON.parse(readFileSync(join(__dirname, "../../messages", `${locale}.json`), "utf8"));

const messages = (tree: Tree, prefix = ""): readonly (readonly [string, string])[] =>
  Object.entries(tree).flatMap(([key, value]) =>
    typeof value === "string"
      ? [[prefix + key, value] as const]
      : messages(value, `${prefix}${key}.`),
  );

/** Every plural block in a message, including ones nested in a branch or a tag. */
const pluralBlocks = (elements: readonly MessageFormatElement[]): readonly PluralBlock[] =>
  elements.flatMap((element): readonly PluralBlock[] => {
    if (isPluralElement(element)) {
      const branches = Object.values(element.options).flatMap((option) =>
        pluralBlocks(option.value),
      );
      return [
        {
          argument: element.value,
          forms: Object.keys(element.options),
          ordinal: element.pluralType === "ordinal",
        },
        ...branches,
      ];
    }
    if (isSelectElement(element)) {
      return Object.values(element.options).flatMap((option) => pluralBlocks(option.value));
    }
    if (isTagElement(element)) return pluralBlocks(element.children);
    return [];
  });

/** One line per missing form, as `key: {argument} lacks form`. */
const missingPluralForms = (locale: Locale, tree: Tree): readonly string[] =>
  messages(tree).flatMap(([key, text]) =>
    pluralBlocks(parse(text)).flatMap((block) =>
      requiredPluralForms(locale, block.ordinal ? "ordinal" : "cardinal")
        .filter((form) => !block.forms.includes(form))
        .map((form) => `${key}: {${block.argument}} lacks ${form}`),
    ),
  );

describe("web plural forms", () => {
  it.each(NON_DEFAULT_LOCALES)("%s.json has every plural form its locale needs", (locale) => {
    expect(missingPluralForms(locale, read(locale))).toEqual([]);
  });

  it("catches a Russian block that drops many", () => {
    const ru = read("ru");
    const ratings = ru.ratings as Tree;
    const recipe = ru.recipe as Tree;
    const broken: Tree = {
      ratings: { summary: String(ratings.summary).replace(/ many \{[^}]*\}/, "") },
      recipe: {
        missingIngredients: String(recipe.missingIngredients).replace(/ many \{[^}]*\}[^}]*\}/, ""),
      },
    };
    expect(missingPluralForms("ru", broken)).toEqual([
      "ratings.summary: {count} lacks many",
      "recipe.missingIngredients: {remaining} lacks many",
    ]);
  });

  it("finds a plural block inside a tag and inside another branch", () => {
    const tree: Tree = {
      tagged: "<b>{count, plural, one {# a} other {# b}}</b>",
      nested: "{kind, select, a {{count, plural, one {# a} few {# b} other {# c}}} other {x}}",
    };
    expect(missingPluralForms("ru", tree)).toEqual([
      "tagged: {count} lacks few",
      "tagged: {count} lacks many",
      "nested: {count} lacks many",
    ]);
  });
});
