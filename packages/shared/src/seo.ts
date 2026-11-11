import type { Locale } from "./locale";

const TRAILING_UUID_PATTERN = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Prefixes a path with its locale segment (`/es/recipes/...`), matching
 * next-intl's `[locale]` routing. The root maps to `/es`, not `/es/`, since
 * Next redirects the trailing slash form away.
 */
export function localizedPath(locale: Locale, path: string): string {
  const suffix = path.startsWith("/") ? path : `/${path}`;
  return suffix === "/" ? `/${locale}` : `/${locale}${suffix}`;
}

/**
 * Latin spellings for non Latin letters in slugs, keyed by lowercase character
 * (not by locale), so a name gets the same slug whatever the page locale.
 * Cyrillic follows the Yandex URL style (spec 0047 AC-9), with the Ukrainian
 * and Belarusian letters so loanwords keep every letter. Changing an entry
 * changes live URLs; old ones still resolve through the trailing uuid.
 */
export const SLUG_TRANSLITERATION: Readonly<Record<string, string>> = {
  а: "a",
  б: "b",
  в: "v",
  г: "g",
  д: "d",
  е: "e",
  ё: "e",
  ж: "zh",
  з: "z",
  и: "i",
  й: "y",
  к: "k",
  л: "l",
  м: "m",
  н: "n",
  о: "o",
  п: "p",
  р: "r",
  с: "s",
  т: "t",
  у: "u",
  ф: "f",
  х: "kh",
  ц: "ts",
  ч: "ch",
  ш: "sh",
  щ: "shch",
  ъ: "",
  ы: "y",
  ь: "",
  э: "e",
  ю: "yu",
  я: "ya",
  і: "i",
  ї: "yi",
  є: "ye",
  ґ: "g",
  ў: "u",
};

/** The Cyrillic block (U+0400 to U+04FF), the only characters transliterated. */
const CYRILLIC_PATTERN = /[Ѐ-ӿ]/g;

/**
 * Replaces each Cyrillic character with its table spelling (dropping one the
 * table lacks) and leaves every other character as is, so input with no
 * Cyrillic comes back byte identical.
 */
function transliterate(input: string): string {
  return input.replace(CYRILLIC_PATTERN, (char) => SLUG_TRANSLITERATION[char.toLowerCase()] ?? "");
}

export function slugify(input: string, fallback: "recipe" | "region" | "article" | "quiz"): string {
  const slug = transliterate(input)
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/g, "");

  return slug.length > 0 ? slug : fallback;
}

export function buildRecipeSlugPath(id: string, name: string): string {
  return `${slugify(name, "recipe")}-${id}`;
}

export function extractIdFromRecipeSlug(slugParam: string): string | null {
  const match = slugParam.match(TRAILING_UUID_PATTERN);
  return match ? match[0] : null;
}

// Learn articles reuse the same "title-slug" + trailing uuid convention as
// recipes (spec 0025), so extractIdFromRecipeSlug also extracts a learn
// article's id from its slug.
export function buildLearnArticleSlugPath(id: string, title: string): string {
  return `${slugify(title, "article")}-${id}`;
}

// Quizzes reuse the same "title-slug" + trailing uuid convention as recipes
// and learn articles (spec 0026), so extractIdFromRecipeSlug also extracts a
// quiz's id from its slug.
export function buildQuizSlugPath(id: string, title: string): string {
  return `${slugify(title, "quiz")}-${id}`;
}

export function matchRegionSlug(regionSlug: string, regions: readonly string[]): string | null {
  for (const region of regions) {
    if (slugify(region, "region") === regionSlug) {
      return region;
    }
  }
  return null;
}

export function absoluteUrl(siteUrl: string, path: string): string {
  const base = siteUrl.replace(/\/+$/, "");
  const suffix = path.startsWith("/") ? path : `/${path}`;
  return `${base}${suffix}`;
}

export type SiteUrlEnv = Readonly<Record<string, string | undefined>>;

const LOCAL_SITE_URL = "http://localhost:3000";

/**
 * The absolute site origin for canonicals, Open Graph URLs, and the sitemap
 * (spec 0011). `NEXT_PUBLIC_SITE_URL` wins when set; otherwise a Vercel
 * production build uses the project's production domain and a preview build
 * its own deployment URL, so a missing variable never ships localhost.
 */
export function resolveSiteUrl(env: SiteUrlEnv): string {
  const explicit = env.NEXT_PUBLIC_SITE_URL?.trim();
  if (explicit) {
    return explicit.replace(/\/+$/, "");
  }

  const vercelHost =
    env.VERCEL_ENV === "production"
      ? (env.VERCEL_PROJECT_PRODUCTION_URL ?? env.VERCEL_URL)
      : env.VERCEL_URL;

  return vercelHost ? `https://${vercelHost}` : LOCAL_SITE_URL;
}

export const PRIVACY_POLICY_URL = absoluteUrl("http://localhost:3000", "/privacy");
