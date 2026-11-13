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
import { normalizeRussianTypography } from "./russianTypography";
import { normalizeHindiTypography } from "./hindiTypography";
import { normalizeJapaneseTypography } from "./japaneseTypography";
import { normalizeKoreanName, normalizeKoreanTypography } from "./koreanTypography";

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

// Russian is launched (spec 0047 AC-8, AC-19).
describe("launched Russian", () => {
  it("is launched and translated by the import job", () => {
    expect(isLaunchedLocale("ru")).toBe(true);
    expect(CATALOG_TRANSLATION_LOCALES).toContain("ru");
  });

  it("maps every Russian region to ru", () => {
    for (const header of ["ru-RU", "ru-UA", "ru-KZ", "ru-BY"]) {
      expect(parseAcceptLanguage(header)).toBe("ru");
      expect(resolveRedirectLocale(null, header)).toBe("ru");
    }
  });

  it("never picks ru for Ukrainian, Belarusian, or Kazakh", () => {
    for (const header of ["uk-UA", "be-BY", "kk-KZ"]) {
      expect(parseAcceptLanguage(header)).toBeNull();
      expect(resolveRedirectLocale(null, header)).toBe("en");
    }
  });

  it("keeps a stored ru, ahead of the header", () => {
    expect(resolveStoredLocale("ru")).toBe("ru");
    expect(resolveRedirectLocale("ru", "es")).toBe("ru");
  });

  it("searches Russian through the built in config", () => {
    expect(LOCALE_TEXT_SEARCH_CONFIG.ru).toBe("russian");
  });
});

// Hindi is launched (spec 0048 AC-8, AC-21).
describe("launched Hindi", () => {
  it("is launched and translated by the import job", () => {
    expect(isLaunchedLocale("hi")).toBe(true);
    expect(CATALOG_TRANSLATION_LOCALES).toContain("hi");
  });

  it("maps hi and hi-IN to hi", () => {
    for (const header of ["hi", "hi-IN"]) {
      expect(parseAcceptLanguage(header)).toBe("hi");
      expect(resolveRedirectLocale(null, header)).toBe("hi");
    }
  });

  it("never picks hi for Indian English, Marathi, or Nepali", () => {
    for (const header of ["en-IN", "mr-IN", "ne-NP"]) {
      expect(resolveRedirectLocale(null, header)).toBe("en");
    }
    expect(parseAcceptLanguage("mr-IN")).toBeNull();
    expect(parseAcceptLanguage("ne-NP")).toBeNull();
  });

  it("keeps a stored hi, ahead of the header", () => {
    expect(resolveStoredLocale("hi")).toBe("hi");
    expect(resolveRedirectLocale("hi", "es")).toBe("hi");
  });
});

// Japanese is launched (spec 0050 AC-9, AC-23).
describe("launched Japanese", () => {
  it("is launched and translated by the import job", () => {
    expect(isLaunchedLocale("ja")).toBe(true);
    expect(CATALOG_TRANSLATION_LOCALES).toContain("ja");
  });

  it("maps ja and ja-JP to ja", () => {
    for (const header of ["ja", "ja-JP"]) {
      expect(parseAcceptLanguage(header)).toBe("ja");
      expect(resolveRedirectLocale(null, header)).toBe("ja");
    }
  });

  it("never picks ja for English in Japan", () => {
    expect(resolveRedirectLocale(null, "en-JP")).toBe("en");
  });

  it("keeps a stored ja, ahead of the header", () => {
    expect(resolveStoredLocale("ja")).toBe("ja");
    expect(resolveRedirectLocale("ja", "es")).toBe("ja");
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
    const expected = {
      en: "/en",
      es: "/es",
      "pt-BR": "/pt",
      fr: "/fr",
      ru: "/ru",
      hi: "/hi",
      ja: "/ja",
    };
    expect(hreflangAlternates("en", (locale) => `/${locale}`)).toEqual(expected);
    expect(hreflangAlternates("pt", (locale) => `/${locale}`)).toEqual(expected);
    expect(hreflangAlternates("fr", (locale) => `/${locale}`)).toEqual(expected);
    expect(hreflangAlternates("ru", (locale) => `/${locale}`)).toEqual(expected);
    expect(hreflangAlternates("hi", (locale) => `/${locale}`)).toEqual(expected);
    expect(hreflangAlternates("ja", (locale) => `/${locale}`)).toEqual(expected);
  });
});

// Spec 0047 AC-17: generate-drink-idea (Deno) can't import packages/shared, so
// it carries hand copies of the Russian terms and typography. These tests fail
// when one copy changes without the other.
describe("generate-drink-idea's Russian hand copies", () => {
  const source = readFileSync(drinkIdeaFunction, "utf8");

  /** The decoded text of the edge function's RUSSIAN_INSTRUCTION constant. */
  const russianInstruction = (): string => {
    const body = /const RUSSIAN_INSTRUCTION =([\s\S]*?);\n/.exec(source)?.[1];
    if (body === undefined) throw new Error("No RUSSIAN_INSTRUCTION in generate-drink-idea");
    return [...body.matchAll(/"((?:[^"\\]|\\.)*)"/g)]
      .map(([, literal]) => JSON.parse(`"${literal ?? ""}"`) as string)
      .join("");
  };

  /** The edge function's normalizeRussianTypography, with its type annotations removed. */
  const edgeTypography = (): ((text: string) => string) => {
    const fn = /function normalizeRussianTypography\(text: string\): string \{[\s\S]*?\n\}\n/.exec(
      source,
    )?.[0];
    if (fn === undefined) throw new Error("No normalizeRussianTypography in generate-drink-idea");
    const plain = fn.replace("(text: string): string", "(text)").replace(/: string\)/g, ")");
    return new Function(`${plain}\nreturn normalizeRussianTypography;`)() as (
      text: string,
    ) => string;
  };

  it.each([
    "«вы»",
    "«лайм»",
    "«лимон»",
    "«сок лайма»",
    "«долька лайма»",
    "«кружок лайма»",
    "«лимонный»",
  ])("both copies pin %s", (term) => {
    expect(LOCALE_AI_TERMS.ru).toContain(term);
    expect(russianInstruction()).toContain(term);
  });

  it("types Russian exactly like the shared normalizeRussianTypography", () => {
    const typeset = edgeTypography();
    const samples = [
      'Коктейль "Мохито" со льдом.',
      "лёд - обязательно",
      "лёд – обязательно",
      "«Уже - в кавычках» - а это нет",
      "2-3 дольки лайма, https://example.com/a-b",
      'один "кавычка',
      "",
    ];
    expect(samples.map(typeset)).toEqual(samples.map(normalizeRussianTypography));
  });
});

// Spec 0048 AC-17, AC-23: the same hand copy check for Hindi.
describe("generate-drink-idea's Hindi hand copies", () => {
  const source = readFileSync(drinkIdeaFunction, "utf8");

  /** The decoded text of the edge function's HINDI_INSTRUCTION constant. */
  const hindiInstruction = (): string => {
    const body = /const HINDI_INSTRUCTION =([\s\S]*?);\n/.exec(source)?.[1];
    if (body === undefined) throw new Error("No HINDI_INSTRUCTION in generate-drink-idea");
    return [...body.matchAll(/"((?:[^"\\]|\\.)*)"/g)]
      .map(([, literal]) => JSON.parse(`"${literal ?? ""}"`) as string)
      .join("");
  };

  /** The edge function's normalizeHindiTypography, with its type annotations removed. */
  const edgeTypography = (): ((text: string) => string) => {
    const fn = /function normalizeHindiTypography\(text: string\): string \{[\s\S]*?\n\}\n/.exec(
      source,
    )?.[0];
    if (fn === undefined) throw new Error("No normalizeHindiTypography in generate-drink-idea");
    const plain = fn.replace("(text: string): string", "(text)").replace(/: string\)/g, ")");
    return new Function(`${plain}\nreturn normalizeHindiTypography;`)() as (text: string) => string;
  };

  it.each([
    "«आप»",
    "«हरा नींबू»",
    "«पीला नींबू»",
    "«नींबू»",
    "«पीले नींबू का शरबत»",
    "«पीले और हरे नींबू वाला सोडा»",
    "«चकोतरा»",
    "«क्रैनबेरी»",
    "«बर्फ़»",
    "«।»",
  ])("both copies pin %s", (term) => {
    expect(LOCALE_AI_TERMS.hi).toContain(term);
    expect(hindiInstruction()).toContain(term);
  });

  it("stores both copies in Unicode NFC", () => {
    expect(LOCALE_AI_TERMS.hi).toBe(LOCALE_AI_TERMS.hi.normalize("NFC"));
    expect(hindiInstruction()).toBe(hindiInstruction().normalize("NFC"));
  });

  it("types Hindi exactly like the shared normalizeHindiTypography", () => {
    const typeset = edgeTypography();
    const samples = [
      "बर्फ़ डालें. फिर हिलाएँ.",
      "30 मि.ली. रम, 2 सें.ली. सिरप, 1 ली. पानी",
      'यह "मोहितो" है .',
      "डॉ. शर्मा कहते हैं... क | ख 1.5",
      "Shake well. https://example.com/a.b",
      "ज़",
      'एक " बिना जोड़ी',
      "",
    ];
    expect(samples.map(typeset)).toEqual(samples.map(normalizeHindiTypography));
  });
});

// Spec 0050 AC-18, AC-22: the same hand copy check for Japanese.
describe("generate-drink-idea's Japanese hand copies", () => {
  const source = readFileSync(drinkIdeaFunction, "utf8");

  /** The decoded text of the edge function's JAPANESE_INSTRUCTION constant. */
  const japaneseInstruction = (): string => {
    const body = /const JAPANESE_INSTRUCTION =([\s\S]*?);\n/.exec(source)?.[1];
    if (body === undefined) throw new Error("No JAPANESE_INSTRUCTION in generate-drink-idea");
    return [...body.matchAll(/"((?:[^"\\]|\\.)*)"/g)]
      .map(([, literal]) => JSON.parse(`"${literal ?? ""}"`) as string)
      .join("");
  };

  /** The edge function's normalizeJapaneseTypography, with its type annotations removed. */
  const edgeTypography = (): ((text: string) => string) => {
    const fn = /function normalizeJapaneseTypography\(text: string\): string \{[\s\S]*?\n\}\n/.exec(
      source,
    )?.[0];
    if (fn === undefined) throw new Error("No normalizeJapaneseTypography in generate-drink-idea");
    const plain = fn.replace("(text: string): string", "(text)").replace(/: string\)/g, ")");
    return new Function(`${plain}\nreturn normalizeJapaneseTypography;`)() as (
      text: string,
    ) => string;
  };

  it.each(["です・ます", "«ライム»", "«レモン»", "«・»", "«。»", "«、»", "«「」»"])(
    "both copies pin %s",
    (term) => {
      expect(LOCALE_AI_TERMS.ja).toContain(term);
      expect(japaneseInstruction()).toContain(term);
    },
  );

  it("stores both copies in Unicode NFC with no half width katakana or full width digits", () => {
    for (const copy of [LOCALE_AI_TERMS.ja, japaneseInstruction()]) {
      expect(copy).toBe(copy.normalize("NFC"));
      expect(copy).not.toMatch(/[｡-ﾟ０-９]/);
    }
  });

  it("types Japanese exactly like the shared normalizeJapaneseTypography", () => {
    const typeset = edgeTypography();
    const samples = [
      "氷を入れます.シェイクします.",
      "ジンを30ml.\n氷を入れます.",
      'ジン,ライム "ギムレット" 本当に? 乾杯!',
      "入れます。 次に",
      "ｼﾞﾝ･ﾄﾆｯｸ １５ml",
      "ジン",
      "1.5 B-52 Dr. Smith https://example.com/a.b",
      "Shake well. Strain.",
      'Say "hi", then go!',
      "ジン(ドライ):30ml 本当に！？",
      "",
    ];
    expect(samples.map(typeset)).toEqual(samples.map(normalizeJapaneseTypography));
  });
});

// Spec 0051 AC-17, AC-22: the same hand copy check for Korean, over both the
// typography pass and the name pass.
describe("generate-drink-idea's Korean hand copies", () => {
  const source = readFileSync(drinkIdeaFunction, "utf8");

  /** The decoded text of the edge function's KOREAN_INSTRUCTION constant. */
  const koreanInstruction = (): string => {
    const body = /const KOREAN_INSTRUCTION =([\s\S]*?);\n/.exec(source)?.[1];
    if (body === undefined) throw new Error("No KOREAN_INSTRUCTION in generate-drink-idea");
    return [...body.matchAll(/"((?:[^"\\]|\\.)*)"/g)]
      .map(([, literal]) => JSON.parse(`"${literal ?? ""}"`) as string)
      .join("");
  };

  /** The edge function's two Korean functions, with their type annotations removed. */
  const edgeFunctions = (): {
    readonly typography: (text: string) => string;
    readonly name: (text: string) => string;
  } => {
    const extract = (fnName: string): string => {
      const fn = new RegExp(
        `function ${fnName}\\(text: string\\): string \\{[\\s\\S]*?\\n\\}\\n`,
      ).exec(source)?.[0];
      if (fn === undefined) throw new Error(`No ${fnName} in generate-drink-idea`);
      return fn.replace("(text: string): string", "(text)");
    };
    return new Function(
      `${extract("normalizeKoreanTypography")}\n${extract("normalizeKoreanName")}\n` +
        "return { typography: normalizeKoreanTypography, name: normalizeKoreanName };",
    )() as { typography: (text: string) => string; name: (text: string) => string };
  };

  it.each([
    "해요체",
    "never in 합니다체 (넣습니다, 붓습니다)",
    "Hanja",
    "«라임»",
    "«레몬»",
    "keep lemon and lime distinct",
    "Lemon-lime soda is «레몬 라임 소다», never «레모네이드»",
    "Conjugate 붓다 as «부어요», never «붓어요» or «붓아요»",
    "half-and-half «하프 앤 하프» (not heavy cream), and",
    "mason jar «메이슨 자»",
    "never «글래스», shake as «셰이크», and ounces as «온스», never oz",
    "middle dot",
    "«셰이커»",
    "«스트레이너»",
    "«머들러»",
    "«지거»",
    "«바 스푼»",
    "«“ ”»",
  ])("both copies pin %s", (term) => {
    expect(LOCALE_AI_TERMS.ko).toContain(term);
    expect(koreanInstruction()).toContain(term);
  });

  it("stores both copies in Unicode NFC with no full width ASCII or ideographic space", () => {
    for (const copy of [LOCALE_AI_TERMS.ko, koreanInstruction()]) {
      expect(copy).toBe(copy.normalize("NFC"));
      expect(copy).not.toMatch(/[\uFF01-\uFF5E\u3000\u3002\u3001\u300C\u300D\u300E\u300F]/);
    }
  });

  const samples = [
    "얼음을 넣어요 .",
    "얼음을 넣어요。라임、레몬",
    '"김렛"을 「진」 『토닉』 정말요 ? 건배 !',
    "１５ml ＧＩＮ\u3000진",
    "얼음·라임",
    "진·토닉 진 · 토닉 진･토닉 진•토닉 진·Tonic B·52 A·B",
    " 진・토닉 ",
    "\u110C\u1175\u11AB",
    "ㅋㅋ (라임): 30ml 1.5 B-52 https://example.com/a.b",
    "Shake well. Strain.",
    'Say "hi", then go! 2" 잔',
    "",
  ];

  it("types Korean exactly like the shared normalizeKoreanTypography", () => {
    expect(samples.map(edgeFunctions().typography)).toEqual(samples.map(normalizeKoreanTypography));
  });

  it("types Korean names exactly like the shared normalizeKoreanName", () => {
    expect(samples.map(edgeFunctions().name)).toEqual(samples.map(normalizeKoreanName));
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
