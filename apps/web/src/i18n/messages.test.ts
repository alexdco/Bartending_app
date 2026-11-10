import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { NON_DEFAULT_LOCALES } from "@bartendingapp/shared";

// Spec 0046 build step 4: the message types come from en.json, so every
// other locale's file must hold exactly the same key paths, no more, no fewer.

type Tree = { readonly [key: string]: string | Tree };

const read = (locale: string): Tree =>
  JSON.parse(readFileSync(join(__dirname, "../../messages", `${locale}.json`), "utf8"));

const keyPaths = (tree: Tree, prefix = ""): readonly string[] =>
  Object.entries(tree)
    .flatMap(([key, value]) =>
      typeof value === "string" ? [prefix + key] : keyPaths(value, `${prefix}${key}.`),
    )
    .sort();

describe("web message files", () => {
  it.each(NON_DEFAULT_LOCALES)("%s.json has the same key paths as en.json", (locale) => {
    expect(keyPaths(read(locale))).toEqual(keyPaths(read("en")));
  });
});
