import type { MetadataRoute } from "next";
import {
  buildLearnArticleSlugPath,
  buildRecipeSlugPath,
  LEARN_CATEGORIES,
  listAllRecipesForSitemap,
  listPopularRegions,
  listPublishedLearnArticlesForSitemap,
  localizedPath,
  slugify,
  SUPPORTED_LOCALES,
  type Locale,
} from "@bartendingapp/shared";
import { supabasePublic } from "@/lib/supabase-public";
import { siteAbsoluteUrl } from "@/lib/site-url";

/**
 * One entry per locale for a page, each listing every locale's URL as an
 * hreflang alternate. `pathFor` gives the unprefixed path in that locale,
 * since a recipe's slug differs by language.
 */
function localizedEntries(
  pathFor: (locale: Locale) => string,
  lastModified?: string,
): MetadataRoute.Sitemap {
  const languages = Object.fromEntries(
    SUPPORTED_LOCALES.map((locale) => [
      locale,
      siteAbsoluteUrl(localizedPath(locale, pathFor(locale))),
    ]),
  );

  return SUPPORTED_LOCALES.map((locale) => ({
    url: languages[locale],
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
