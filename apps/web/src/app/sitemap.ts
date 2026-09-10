import type { MetadataRoute } from "next";
import {
  buildRecipeSlugPath,
  listAllRecipesForSitemap,
  listPopularRegions,
  slugify,
} from "@bartendingapp/shared";
import { supabase } from "@/lib/supabase";
import { siteAbsoluteUrl } from "@/lib/site-url";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [recipes, regions] = await Promise.all([
    listAllRecipesForSitemap(supabase),
    listPopularRegions(supabase),
  ]);

  const recipeEntries: MetadataRoute.Sitemap = recipes.map((recipe) => ({
    url: siteAbsoluteUrl(`/recipes/${buildRecipeSlugPath(recipe.id, recipe.name)}`),
  }));

  const regionEntries: MetadataRoute.Sitemap = regions.map((region) => ({
    url: siteAbsoluteUrl(`/popular/${slugify(region, "region")}`),
  }));

  return [{ url: siteAbsoluteUrl("/") }, ...recipeEntries, ...regionEntries];
}
