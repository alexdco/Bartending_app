// Locale config and the TS/SQL/edge function parity check (spec 0045 AC-6).
// Pure: parses the migration files and the edge function source, no database.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  CATALOG_TRANSLATION_LOCALES,
  LAUNCHED_LOCALES,
  LOCALE_AI_TERMS,
  LOCALE_TEXT_SEARCH_CONFIG,
  SUPPORTED_LOCALES,
  hreflangAlternates,
  isLaunchedLocale,
  isNonDefaultLocale,
  parseAcceptLanguage,
  resolveRedirectLocale,
  resolveStoredLocale,
} from "./locale";

const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));
const migrationsDir = join(repoRoot, "supabase/migrations");
const drinkIdeaFunction = join(repoRoot, "supabase/functions/generate-drink-idea/index.ts");

/** Every (code, config) pair inserted into supported_locales, in migration order. */
function parseSeededLocales(sqlFiles: readonly string[]): ReadonlyMap<string, string> {
  const inserts = sqlFiles.flatMap((sql) =>
    [...sql.matchAll(/insert into public\.supported_locales[^;]*?values([^;]*);/gi)].map(
      (match) => match[1] ?? "",
    ),
  );
  return new Map(
    inserts.flatMap((values) =>
      [...values.matchAll(/\(\s*'([^']+)'\s*,\s*'([^']+)'\s*\)/g)].map(
        ([, code, config]) => [code ?? "", config ?? ""] as const,
      ),
    ),
  );
}

/** The codes in the edge function's own `const SUPPORTED_LOCALES = [...]` line. */
function parseEdgeFunctionLocales(source: string): readonly string[] {
  const list = /const SUPPORTED_LOCALES = \[([^\]]*)\]/.exec(source)?.[1];
  if (list === undefined) {
    throw new Error("No SUPPORTED_LOCALES line found in generate-drink-idea/index.ts");
  }
  return [...list.matchAll(/"([^"]+)"/g)].map(([, code]) => code ?? "");
}

/** Codes present in one list but not the other, sorted; empty when they match. */
function localeCodeDrift(a: readonly string[], b: readonly string[]): readonly string[] {
  const left = new Set(a);
  const right = new Set(b);
  return [...left, ...right].filter((code) => !(left.has(code) && right.has(code))).sort();
}

const migrationSql = readdirSync(migrationsDir)
  .filter((file) => file.endsWith(".sql"))
  .sort()
  .map((file) => readFileSync(join(migrationsDir, file), "utf8"));

describe("locale parity (AC-6)", () => {
  const seeded = parseSeededLocales(migrationSql);

  it("finds the supported_locales seed in the migrations", () => {
    expect(seeded.size).toBeGreaterThan(0);
  });

  it("SUPPORTED_LOCALES matches the supported_locales seed", () => {
    expect(localeCodeDrift(SUPPORTED_LOCALES, [...seeded.keys()])).toEqual([]);
  });

  it("LOCALE_TEXT_SEARCH_CONFIG matches each seeded text search config", () => {
    expect(Object.fromEntries(seeded)).toEqual(LOCALE_TEXT_SEARCH_CONFIG);
  });

  it("generate-drink-idea's locale list matches SUPPORTED_LOCALES", () => {
    const edgeLocales = parseEdgeFunctionLocales(readFileSync(drinkIdeaFunction, "utf8"));
    expect(localeCodeDrift(SUPPORTED_LOCALES, edgeLocales)).toEqual([]);
  });

  it("reports drift when a list gains a code the other lacks", () => {
    expect(localeCodeDrift([...SUPPORTED_LOCALES, "xx"], [...seeded.keys()])).toEqual(["xx"]);
    expect(localeCodeDrift(["en", "es"], ["en", "es", "pt"])).toEqual(["pt"]);
  });

  it("parses multi row inserts and later single row inserts", () => {
    const parsed = parseSeededLocales([
      "insert into public.supported_locales (code, text_search_config) values\n  ('en', 'english'),\n  ('es', 'spanish');",
      "INSERT INTO public.supported_locales (code, text_search_config) VALUES ('fr', 'french');",
    ]);
    expect([...parsed.keys()]).toEqual(["en", "es", "fr"]);
  });
});

describe("launch lists", () => {
  it("LAUNCHED_LOCALES is a subset of SUPPORTED_LOCALES and includes English", () => {
    expect(LAUNCHED_LOCALES.every((locale) => SUPPORTED_LOCALES.includes(locale))).toBe(true);
    expect(LAUNCHED_LOCALES).toContain("en");
  });

  it("CATALOG_TRANSLATION_LOCALES holds only launched non English locales", () => {
    expect(CATALOG_TRANSLATION_LOCALES.every(isLaunchedLocale)).toBe(true);
    expect(CATALOG_TRANSLATION_LOCALES.every(isNonDefaultLocale)).toBe(true);
  });

  it("pt is launched and translated by the import job", () => {
    expect(isLaunchedLocale("pt")).toBe(true);
    expect(CATALOG_TRANSLATION_LOCALES).toContain("pt");
  });
});

describe("isNonDefaultLocale", () => {
  it("accepts supported translation locales only", () => {
    expect(isNonDefaultLocale("es")).toBe(true);
    expect(isNonDefaultLocale("pt")).toBe(true);
    expect(isNonDefaultLocale("en")).toBe(false);
    expect(isNonDefaultLocale("fr")).toBe(true);
    expect(isNonDefaultLocale("de")).toBe(false);
    expect(isNonDefaultLocale(undefined)).toBe(false);
  });
});

describe("parseAcceptLanguage", () => {
  it("maps any Portuguese region to pt", () => {
    expect(parseAcceptLanguage("pt-BR,pt;q=0.9")).toBe("pt");
    expect(parseAcceptLanguage("pt-PT,en;q=0.5")).toBe("pt");
  });

  it("never picks a locale outside the allowed list", () => {
    expect(parseAcceptLanguage("pt-BR,es;q=0.8", ["en", "es"])).toBe("es");
    expect(parseAcceptLanguage("pt-BR", ["en", "es"])).toBeNull();
  });

  it("matches within an explicit allowed list", () => {
    expect(parseAcceptLanguage("pt-PT,en;q=0.5", SUPPORTED_LOCALES)).toBe("pt");
  });

  it("returns null for an empty header", () => {
    expect(parseAcceptLanguage(null)).toBeNull();
    expect(parseAcceptLanguage("")).toBeNull();
  });
});

describe("resolveStoredLocale", () => {
  it("keeps a launched stored value", () => {
    expect(resolveStoredLocale("es")).toBe("es");
    expect(resolveStoredLocale("pt")).toBe("pt");
  });

  it("rejects unsupported and missing values", () => {
    expect(resolveStoredLocale("de", { allowUnlaunched: true })).toBeNull();
    expect(resolveStoredLocale(null)).toBeNull();
  });
});

// French is launched (spec 0046 AC-8, AC-15).
describe("launched French", () => {
  it("is launched and translated by the import job", () => {
    expect(isLaunchedLocale("fr")).toBe(true);
    expect(CATALOG_TRANSLATION_LOCALES).toContain("fr");
  });

  it("maps every French region to fr", () => {
    for (const header of ["fr-FR", "fr-CA", "fr-BE", "fr-CH"]) {
      expect(parseAcceptLanguage(header)).toBe("fr");
      expect(resolveRedirectLocale(null, header)).toBe("fr");
    }
  });

  it("keeps a stored fr, ahead of the header", () => {
    expect(resolveStoredLocale("fr")).toBe("fr");
    expect(resolveRedirectLocale("fr", "es")).toBe("fr");
  });

  it("searches French through the accent insensitive config", () => {
    expect(LOCALE_TEXT_SEARCH_CONFIG.fr).toBe("public.french_unaccent");
  });
});

describe("resolveRedirectLocale", () => {
  it("prefers a launched stored locale, then the header, then English", () => {
    expect(resolveRedirectLocale("es", "en-US")).toBe("es");
    expect(resolveRedirectLocale(null, "es-MX")).toBe("es");
    expect(resolveRedirectLocale(null, null)).toBe("en");
  });

  it("lands on Portuguese from the cookie or a Portuguese header", () => {
    expect(resolveRedirectLocale("pt", "en-US")).toBe("pt");
    expect(resolveRedirectLocale(null, "pt-BR")).toBe("pt");
  });

  it("ignores an unsupported cookie", () => {
    expect(resolveRedirectLocale("de", "es")).toBe("es");
  });
});

describe("hreflangAlternates", () => {
  it("lists launched locales by hreflang code, with pt as pt-BR", () => {
    const expected = { en: "/en", es: "/es", "pt-BR": "/pt", fr: "/fr" };
    expect(hreflangAlternates("en", (locale) => `/${locale}`)).toEqual(expected);
    expect(hreflangAlternates("pt", (locale) => `/${locale}`)).toEqual(expected);
    expect(hreflangAlternates("fr", (locale) => `/${locale}`)).toEqual(expected);
  });
});

describe("LOCALE_AI_TERMS", () => {
  it("leaves the Spanish prompts unchanged", () => {
    expect(LOCALE_AI_TERMS.es).toBe("");
  });

  it("starts with a space when set, so it appends cleanly to a prompt", () => {
    expect(LOCALE_AI_TERMS.pt.startsWith(" ")).toBe(true);
  });
});
