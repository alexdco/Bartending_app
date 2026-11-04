import type { MetadataRoute } from "next";
import {
  buildLearnArticleSlugPath,
  buildRecipeSlugPath,
  LEARN_CATEGORIES,
  listAllRecipesForSitemap,
  listPopularRegions,
  listPublishedLearnArticlesForSitemap,
  LAUNCHED_LOCALES,
  localizedPath,
  LOCALE_HREFLANG,
  slugify,
  type Locale,
} from "@bartendingapp/shared";
import { supabasePublic } from "@/lib/supabase-public";
import { siteAbsoluteUrl } from "@/lib/site-url";

/**
 * One entry per launched locale for a page, each listing every launched
 * locale's URL as an hreflang alternate. `pathFor` gives the unprefixed path in that locale,
 * since a recipe's slug differs by language.
 */
function localizedEntries(
  pathFor: (locale: Locale) => string,
  lastModified?: string,
): MetadataRoute.Sitemap {
  const urlFor = (locale: Locale) => siteAbsoluteUrl(localizedPath(locale, pathFor(locale)));
  const languages = Object.fromEntries(
    LAUNCHED_LOCALES.map((locale) => [LOCALE_HREFLANG[locale], urlFor(locale)]),
  );

  return LAUNCHED_LOCALES.map((locale) => ({
    url: urlFor(locale),
    ...(lastModified ? { lastModified } : {}),
    alternates: { languages },
  }));
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [recipes, regions, articles] = await Promise.all([
    listAllRecipesForSitemap(supabasePublic),
    listPopularRegions(supabasePublic),
    listPublishedLearnArticlesForSitemap(supabasePublic),
  ]);

  const homeEntries = localizedEntries(() => "/");

  const recipeEntries = recipes.flatMap((recipe) =>
    localizedEntries(
      (locale) => `/recipes/${buildRecipeSlugPath(recipe.id, recipe.namesByLocale[locale])}`,
    ),
  );

  const regionEntries = regions.flatMap((region) =>
    localizedEntries(() => `/popular/${slugify(region, "region")}`),
  );

  const learnEntries = [
    ...localizedEntries(() => "/learn"),
    ...LEARN_CATEGORIES.flatMap((category) => localizedEntries(() => `/learn/${category}`)),
    ...articles.flatMap((article) =>
      localizedEntries(
        () => `/learn/${article.category}/${buildLearnArticleSlugPath(article.id, article.title)}`,
        article.updatedAt,
      ),
    ),
  ];

  return [...homeEntries, ...recipeEntries, ...regionEntries, ...learnEntries];
}
