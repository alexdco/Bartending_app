import { describe, expect, it } from "vitest";
import { NON_DEFAULT_LOCALES, type NonDefaultLocale } from "@bartendingapp/shared";

import en from "./locales/en.json";
import es from "./locales/es.json";
import fr from "./locales/fr.json";
import pt from "./locales/pt.json";

// Spec 0046 build step 4: every locale's resource file holds the same keys as
// en.json, plural suffixes included (every supported language uses _one/_other).

type Tree = { readonly [key: string]: string | Tree };

// Keyed by NonDefaultLocale, so a new locale fails typecheck until it is here.
const resources: Record<NonDefaultLocale, Tree> = { es, pt, fr };

const keyPaths = (tree: Tree, prefix = ""): readonly string[] =>
  Object.entries(tree)
    .flatMap(([key, value]) =>
      typeof value === "string" ? [prefix + key] : keyPaths(value, `${prefix}${key}.`),
    )
    .sort();

describe("mobile locale files", () => {
  it.each(NON_DEFAULT_LOCALES)("%s.json has the same keys as en.json", (locale) => {
    expect(keyPaths(resources[locale])).toEqual(keyPaths(en));
  });
});
