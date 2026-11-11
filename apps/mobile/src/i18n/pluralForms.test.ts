import { describe, expect, it } from "vitest";
import {
  NON_DEFAULT_LOCALES,
  requiredPluralForms,
  type Locale,
  type NonDefaultLocale,
} from "@bartendingapp/shared";

import en from "./locales/en.json";
import es from "./locales/es.json";
import fr from "./locales/fr.json";
import pt from "./locales/pt.json";
import ru from "./locales/ru.json";

// Spec 0047 AC-11: every plural key family in en.json (`summary_one`,
// `summary_other`) has a key for every plural form the locale reaches for
// whole numbers. For Russian that is `_one`, `_few`, `_many`, `_other`.

type Tree = { readonly [key: string]: string | Tree };

const resources: Record<NonDefaultLocale, Tree> = { es, pt, fr, ru };

const PLURAL_SUFFIX = /_(?:zero|one|two|few|many|other)$/;

const keyPaths = (tree: Tree, prefix = ""): readonly string[] =>
  Object.entries(tree).flatMap(([key, value]) =>
    typeof value === "string" ? [prefix + key] : keyPaths(value, `${prefix}${key}.`),
  );

const pluralFamilies = (tree: Tree): readonly string[] => [
  ...new Set(
    keyPaths(tree)
      .filter((path) => PLURAL_SUFFIX.test(path))
      .map((path) => path.replace(PLURAL_SUFFIX, "")),
  ),
];

/** One `family_form` per key the locale lacks. */
const missingPluralKeys = (locale: Locale, tree: Tree): readonly string[] => {
  const present = new Set(keyPaths(tree));
  return pluralFamilies(en).flatMap((family) =>
    requiredPluralForms(locale)
      .map((form) => `${family}_${form}`)
      .filter((key) => !present.has(key)),
  );
};

describe("mobile plural forms", () => {
  it.each(NON_DEFAULT_LOCALES)("%s.json has every plural form its locale needs", (locale) => {
    expect(missingPluralKeys(locale, resources[locale])).toEqual([]);
  });

  it("catches a Russian family without its _few key", () => {
    const { summary_few: _dropped, ...ratings } = ru.ratings;
    expect(missingPluralKeys("ru", { ...ru, ratings })).toEqual(["ratings.summary_few"]);
  });
});
