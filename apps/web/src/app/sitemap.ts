import type { MetadataRoute } from "next";
import {
  buildRecipeSlugPath,
  listAllRecipesForSitemap,
  listPopularRegions,
  localizedPath,
  slugify,
  SUPPORTED_LOCALES,
} from "@bartendingapp/shared";
import { supabase } from "@/lib/supabase";
import { siteAbsoluteUrl } from "@/lib/site-url";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [recipes, regions] = await Promise.all([
    listAllRecipesForSitemap(supabase),
    listPopularRegions(supabase),
  ]);

  const homeEntries: MetadataRoute.Sitemap = SUPPORTED_LOCALES.map((locale) => ({
    url: siteAbsoluteUrl(localizedPath(locale, "/")),
    alternates: {
      languages: Object.fromEntries(
        SUPPORTED_LOCALES.map((altLocale) => [
          altLocale,
          siteAbsoluteUrl(localizedPath(altLocale, "/")),
        ]),
      ),
    },
  }));

  const recipeEntries: MetadataRoute.Sitemap = recipes.flatMap((recipe) =>
    SUPPORTED_LOCALES.map((locale) => {
      const path = `/recipes/${buildRecipeSlugPath(recipe.id, recipe.namesByLocale[locale])}`;

      return {
        url: siteAbsoluteUrl(localizedPath(locale, path)),
        alternates: {
          languages: Object.fromEntries(
            SUPPORTED_LOCALES.map((altLocale) => [
              altLocale,
              siteAbsoluteUrl(
                localizedPath(
                  altLocale,
                  `/recipes/${buildRecipeSlugPath(recipe.id, recipe.namesByLocale[altLocale])}`,
                ),
              ),
            ]),
          ),
        },
      };
    }),
  );

  const regionEntries: MetadataRoute.Sitemap = regions.flatMap((region) => {
    const regionSlug = slugify(region, "region");

    return SUPPORTED_LOCALES.map((locale) => ({
      url: siteAbsoluteUrl(localizedPath(locale, `/popular/${regionSlug}`)),
      alternates: {
        languages: Object.fromEntries(
          SUPPORTED_LOCALES.map((altLocale) => [
            altLocale,
            siteAbsoluteUrl(localizedPath(altLocale, `/popular/${regionSlug}`)),
          ]),
        ),
      },
    }));
  });

  return [...homeEntries, ...recipeEntries, ...regionEntries];
}
