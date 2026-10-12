import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { extractIdFromRecipeSlug, fetchRecipeDetail, type Locale } from "@bartendingapp/shared";
import { supabasePublic } from "@/lib/supabase-public";
import { MoreLikeThisClient } from "@/recipe-recommendations/more-like-this-client";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const id = extractIdFromRecipeSlug(slug);
  const recipe = id
    ? await fetchRecipeDetail(supabasePublic, id, (await getLocale()) as Locale)
    : null;

  if (!recipe) {
    return {};
  }

  const t = await getTranslations("moreLikeThis");
  return {
    title: t("metaTitle", { name: recipe.name }),
    description: t("metaDescription", { name: recipe.name }),
  };
}

export default async function MoreLikeThisPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const id = extractIdFromRecipeSlug(slug);

  if (!id) {
    notFound();
  }

  return <MoreLikeThisClient recipeId={id} />;
}
