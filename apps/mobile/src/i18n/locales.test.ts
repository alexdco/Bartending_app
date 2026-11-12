import { describe, expect, it } from "vitest";
import { NON_DEFAULT_LOCALES, type NonDefaultLocale } from "@bartendingapp/shared";

import en from "./locales/en.json";
import es from "./locales/es.json";
import fr from "./locales/fr.json";
import pt from "./locales/pt.json";
import ru from "./locales/ru.json";
import hi from "./locales/hi.json";
import ja from "./locales/ja.json";

// Spec 0046 build step 4: every locale's resource file holds the same keys as
// en.json. A plural family (`summary_one`, `summary_few`, ...) counts as one
// key, since Russian has more plural forms than English (spec 0047 AC-11).

type Tree = { readonly [key: string]: string | Tree };

// Keyed by NonDefaultLocale, so a new locale fails typecheck until it is here.
const resources: Record<NonDefaultLocale, Tree> = { es, pt, fr, ru, hi, ja };

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
