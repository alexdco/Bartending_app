// Locale config and the TS/SQL/edge function parity check (spec 0045 AC-6).
// Pure: parses the migration files and the edge function source, no database.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  CATALOG_TRANSLATION_LOCALES,
  LAUNCHED_LOCALES,
  LOCALE_TEXT_SEARCH_CONFIG,
  SUPPORTED_LOCALES,
  isLaunchedLocale,
  isNonDefaultLocale,
  parseAcceptLanguage,
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

  it("pt is supported but not launched yet", () => {
    expect(SUPPORTED_LOCALES).toContain("pt");
    expect(isLaunchedLocale("pt")).toBe(false);
  });
});

describe("isNonDefaultLocale", () => {
  it("accepts supported translation locales only", () => {
    expect(isNonDefaultLocale("es")).toBe(true);
    expect(isNonDefaultLocale("pt")).toBe(true);
    expect(isNonDefaultLocale("en")).toBe(false);
    expect(isNonDefaultLocale("fr")).toBe(false);
    expect(isNonDefaultLocale(undefined)).toBe(false);
  });
});

describe("parseAcceptLanguage", () => {
  it("never picks an unlaunched locale by default", () => {
    expect(parseAcceptLanguage("pt-BR,pt;q=0.9")).toBeNull();
    expect(parseAcceptLanguage("pt-BR,es;q=0.8")).toBe("es");
  });

  it("matches within an explicit allowed list", () => {
    expect(parseAcceptLanguage("pt-PT,en;q=0.5", SUPPORTED_LOCALES)).toBe("pt");
  });

  it("returns null for an empty header", () => {
    expect(parseAcceptLanguage(null)).toBeNull();
    expect(parseAcceptLanguage("")).toBeNull();
  });
});
