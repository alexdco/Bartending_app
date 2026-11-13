// Single source of truth for supported locales, read by both apps, the
// import job, and the sitemap. The database's own list is the
// supported_locales table; the locale parity test keeps the two in sync.
// Adding a language is a supported_locales row, entries here, message files,
// and a translation backfill, with no SQL function edits.
// Specs: docs/specs/0020-multi-language-support/index.md,
// docs/specs/0045-language-agnostic-locales-portuguese/index.md,
// docs/specs/0046-french-locale.md, docs/specs/0047-russian-locale.md,
// docs/specs/0048-hindi-locale/index.md, docs/specs/0050-japanese-locale/index.md,
// docs/specs/0051-korean-locale/index.md

export const SUPPORTED_LOCALES = ["en", "es", "pt", "fr", "ru", "hi", "ja", "ko"] as const;

export type Locale = (typeof SUPPORTED_LOCALES)[number];

/** A translation locale: English lives on the base rows, never as a translation. */
export type NonDefaultLocale = Exclude<Locale, "en">;

export const DEFAULT_LOCALE: Locale = "en";

export const NON_DEFAULT_LOCALES: readonly NonDefaultLocale[] = SUPPORTED_LOCALES.filter(
  (locale): locale is NonDefaultLocale => locale !== DEFAULT_LOCALE,
);

/**
 * The locales users can discover (switcher, detection, sitemap, hreflang).
 * Every supported locale still routes; only discovery is gated. A new locale
 * joins at launch, in the same commit as CATALOG_TRANSLATION_LOCALES.
 */
export const LAUNCHED_LOCALES: readonly Locale[] = ["en", "es", "pt", "fr", "ru", "hi", "ja"];

/**
 * The locales the import job translates new catalog rows into, and the
 * blocks the default recipe notes run writes. Holds only launched locales
 * outside a backfill run.
 */
export const CATALOG_TRANSLATION_LOCALES = [
  "es",
  "pt",
  "fr",
  "ru",
  "hi",
  "ja",
] as const satisfies readonly NonDefaultLocale[];

export type CatalogTranslationLocale = (typeof CATALOG_TRANSLATION_LOCALES)[number];

export const LOCALE_TEXT_SEARCH_CONFIG: Record<Locale, string> = {
  en: "english",
  es: "spanish",
  pt: "portuguese",
  // Strips accents before stemming, so "creme" finds "crème" (spec 0046 AC-3).
  fr: "public.french_unaccent",
  // Built in; it already stems "ликер" and "ликёр" alike (spec 0047 AC-3).
  ru: "russian",
  // Built in; it stems "संतरा" and "संतरे" alike (spec 0048 AC-3).
  hi: "hindi",
  // No Japanese stemmer; `simple` splits names at ・, and the locale agnostic
  // CJK contains tier in the search functions finds the rest (spec 0050 AC-3).
  ja: "simple",
  // No Korean stemmer; `simple` splits names at the spaces between words, and
  // the CJK contains tier covers Hangul too (spec 0051 AC-3).
  ko: "simple",
};

/** BCP 47 codes for hreflang, the sitemap, and <html lang>. URLs keep the bare code. */
export const LOCALE_HREFLANG: Record<Locale, string> = {
  en: "en",
  es: "es",
  pt: "pt-BR",
  fr: "fr",
  ru: "ru",
  hi: "hi",
  ja: "ja",
  ko: "ko",
};

/** The language named in AI translation and recipe notes prompts. */
export const LOCALE_AI_LANGUAGE: Record<Locale, string> = {
  en: "English",
  es: "Latin American Spanish",
  pt: "Brazilian Portuguese",
  fr: "French as written in France",
  ru: "Russian",
  hi: "Hindi",
  ja: "Japanese",
  ko: "Korean",
};

/**
 * Regional wording the AI prompts must follow, appended to them as is. Empty
 * when a language needs none, or starting with a space.
 */
export const LOCALE_AI_TERMS: Record<Locale, string> = {
  en: "",
  es: "",
  pt:
    ' Use Brazilian citrus terms: lime is "limão", lemon is "limão-siciliano", limeade is ' +
    '"limonada", and lemonade is "limonada siciliana". Never write "lima" for lime, and keep ' +
    "lemon and lime distinct.",
  // Approved in the native review (spec 0046). generate-drink-idea carries a
  // hand copy of the citrus and typography sentences: change both together.
  fr:
    ' Lime is "citron vert" and lemon is "citron jaune"; never write "citron" alone for lime, ' +
    'and keep lemon and lime distinct. Bar tools: shaker is "shaker", jigger is "doseur", ' +
    'muddler is "pilon", strainer is "passoire", and bar spoon is "cuillère à mélange". Use ' +
    "French typography: a narrow no break space before ; ! ? and a no break space before :, " +
    "and « » quotes.",
  // Approved in the native review (spec 0047). generate-drink-idea
  // carries a hand copy of the address, citrus, and typography sentences:
  // change both together.
  ru:
    " Address the reader with lowercase «вы». Lime is «лайм» and lemon is «лимон»; keep lemon " +
    "and lime distinct. Lime juice is «сок лайма» and a lime wedge or wheel is «долька лайма» " +
    "or «кружок лайма»; never use «лимонный» for lime. Bar tools: shaker is «шейкер», jigger " +
    "is «джиггер», muddler is " +
    "«мадлер», strainer is «стрейнер», and bar spoon is «барная ложка». Simple syrup is " +
    "«сахарный сироп» and bitters is «биттер». Write ё where standard Russian spelling uses " +
    "it (ликёр, лёд). Use « » quotes and a spaced em dash ( — ).",
  // Drafted for the native review (spec 0048), which approves it before the
  // backfill. generate-drink-idea carries a hand copy of the register,
  // citrus, tool, and punctuation sentences: change both together.
  hi:
    " Write everyday Hindi in Devanagari, not formal Sanskrit based Hindi and not Hinglish, and " +
    "address the reader as «आप». Never mix Latin letters into a Hindi word. Lime is «हरा नींबू» " +
    "and lemon is «पीला नींबू», inflecting «हरा» and «पीला» as grammar needs (हरे, हरी, पीले, " +
    "पीली, as in «हरे नींबू का रस»); keep lemon and lime distinct, never write «नींबू» alone, " +
    "and never use the loanwords «लाइम» or «लेमन». Lemonade is «पीले नींबू का शरबत» and " +
    "lemon-lime soda is «पीले और हरे नींबू वाला सोडा», never «नींबू पानी». " +
    "Grapefruit is «चकोतरा» (चकोतरे as grammar needs, as in «चकोतरे का रस»), never " +
    "«अंगूर», which means grape, and never the loanword «ग्रेपफ्रूट». Cranberry is " +
    "«क्रैनबेरी», never «करंट». " +
    "Bar tools: shaker is «शेकर», jigger is «जिगर», muddler is «मडलर», strainer is " +
    "«स्ट्रेनर», and bar spoon is «बार स्पून». Simple syrup is «शुगर सिरप», bitters is " +
    "«बिटर्स», and ice is «बर्फ़». Write glass names as Devanagari loanwords, for example " +
    "highball glass is «हाईबॉल गिलास», cocktail glass is «कॉकटेल गिलास», and old fashioned " +
    "glass is «ओल्ड फ़ैशन्ड गिलास». Use Western " +
    "digits (0 to 9), write units without dots (मिली, सेली, ली, औंस), end sentences with " +
    "«।», and use “ ” quotes.",
  // Drafted for the native review (spec 0050), which approves it before the
  // backfill. generate-drink-idea carries a hand copy of the register,
  // citrus, name, and punctuation sentences: change both together.
  ja:
    " Write natural Japanese in the です・ます polite form. Lime is «ライム» and lemon is " +
    "«レモン»; keep lemon and lime distinct. Write cocktail names in katakana with «・» between " +
    "words (ジン・トニック), using the established Japanese name where one exists. Bar tools: " +
    "shaker is «シェーカー», jigger is «メジャーカップ», muddler is «ペストル», strainer is " +
    "«ストレーナー», and bar spoon is «バースプーン». Simple syrup is «シンプルシロップ», " +
    "bitters is «ビターズ», and ice is «氷». Write glass names in katakana, for example old " +
    "fashioned glass is «ロックグラス», cocktail glass is «カクテルグラス», collins glass is " +
    "«コリンズグラス», and highball glass is «ハイボールグラス». Use half width digits, write " +
    "units as ml, cl, L, and «オンス», punctuate with «。» and «、», use «「」» for quotes, and " +
    "put no spaces between Japanese words.",
  // Checked by the AI terms pass (spec 0051 AC-20) on 2026-11-13, before the
  // backfill; the -요 ending and lemon-lime soda sentences were added after
  // the backfill (69 of 475 recipes came back in 합니다체, and the soda as
  // 레모네이드), and the 붓다, 글라스, 셰이크, and 온스 sentence after the
  // step 4 drink ideas (붓어요, 글래스, 셔이크, and oz in 8 live ideas), and
  // the spelling sentence after the step 4 catalog sample (베르무스 next to
  // 베르무트, 데킬라 next to 테킬라, and Half-and-Half as 헤비 크림). generate-drink-idea carries a hand copy of the register,
  // citrus, name, tool, and punctuation sentences: change both together.
  ko:
    " Write natural Korean in the 해요체 polite form, ending every sentence in -요 (넣어요, " +
    "부어요) and never in 합니다체 (넣습니다, 붓습니다), with short nouns for labels, and never " +
    "use Hanja. Lime is «라임» and lemon is «레몬»; keep lemon and lime distinct. " +
    "Lemon-lime soda is «레몬 라임 소다», never «레모네이드». Write " +
    "cocktail names in Hangul as Korean bars and menus write them (마가리타, 모히토, 진토닉, " +
    "올드 패션드), using the established name where one exists and the standard loanword " +
    "spelling otherwise, and never put a middle dot between words; use a space or nothing. " +
    "Bar tools: shaker is «셰이커», jigger is «지거», muddler is «머들러», strainer is " +
    "«스트레이너», and bar spoon is «바 스푼». Simple syrup is «심플 시럽», bitters is " +
    "«비터스», and ice is «얼음». A shot is «샷», a dash is «대시», a teaspoon is «티스푼», and " +
    "a tablespoon is «테이블스푼»; use the same word in the measures and the steps. " +
    "Write glass names in Hangul, for example old fashioned glass " +
    "is «록 글라스», cocktail glass is «칵테일 글라스», collins glass is «콜린스 글라스», and " +
    "highball glass is «하이볼 글라스». Conjugate 붓다 as «부어요», never «붓어요» or «붓아요». " +
    "Spell vermouth «베르무트», tequila «테킬라», amaretto «아마레토», Southern Comfort " +
    "«서던 컴포트», champagne «샴페인», half-and-half «하프 앤 하프» (not heavy cream), and " +
    "mason jar «메이슨 자». Write glass as «글라스», never «글래스», shake as «셰이크», and ounces as «온스», never oz. " +
    "Use half width digits, write units as ml, cl, L, and «온스», use Western punctuation (. , ? !) with no space before it, and use «“ ”» for quotes.",
};

/** Each language's own name, shown in the switcher whatever the active language. */
export const LOCALE_NATIVE_NAME: Record<Locale, string> = {
  en: "English",
  es: "Español",
  pt: "Português",
  fr: "Français",
  ru: "Русский",
  hi: "हिन्दी",
  ja: "日本語",
  ko: "한국어",
};

export function isSupportedLocale(value: string | null | undefined): value is Locale {
  return SUPPORTED_LOCALES.includes(value as Locale);
}

export function isNonDefaultLocale(value: string | null | undefined): value is NonDefaultLocale {
  return isSupportedLocale(value) && value !== DEFAULT_LOCALE;
}

export function isLaunchedLocale(value: string | null | undefined): value is Locale {
  return LAUNCHED_LOCALES.includes(value as Locale);
}

/**
 * The one filter for a stored preference (web cookie, mobile AsyncStorage,
 * user_preferences.locale). An unlaunched value counts as absent but is left
 * in place, so it applies again at launch (spec 0045 AC-7).
 */
export function resolveStoredLocale(
  value: string | null | undefined,
  { allowUnlaunched = false }: { allowUnlaunched?: boolean } = {},
): Locale | null {
  if (!isSupportedLocale(value)) {
    return null;
  }
  return allowUnlaunched || isLaunchedLocale(value) ? value : null;
}

export function parseAcceptLanguage(
  header: string | null | undefined,
  allowed: readonly Locale[] = LAUNCHED_LOCALES,
): Locale | null {
  if (!header) {
    return null;
  }

  const candidates = header
    .split(",")
    .map((part) => part.split(";")[0]?.trim().toLowerCase())
    .filter((tag): tag is string => Boolean(tag));

  for (const tag of candidates) {
    const primary = tag.split("-")[0];

    if (isSupportedLocale(primary) && allowed.includes(primary)) {
      return primary;
    }
  }

  return null;
}

/** The locale a path with no locale prefix redirects to (spec 0045 AC-7). */
export function resolveRedirectLocale(
  storedLocale: string | null | undefined,
  acceptLanguage: string | null | undefined,
): Locale {
  return resolveStoredLocale(storedLocale) ?? parseAcceptLanguage(acceptLanguage) ?? DEFAULT_LOCALE;
}

/**
 * A page's hreflang alternates, keyed by hreflang code, launched locales only.
 * An unlaunched page gets none (spec 0045 AC-7).
 */
export function hreflangAlternates(
  locale: Locale,
  pathFor: (candidate: Locale) => string,
): Record<string, string> {
  return isLaunchedLocale(locale)
    ? Object.fromEntries(
        LAUNCHED_LOCALES.map((candidate) => [LOCALE_HREFLANG[candidate], pathFor(candidate)]),
      )
    : {};
}
