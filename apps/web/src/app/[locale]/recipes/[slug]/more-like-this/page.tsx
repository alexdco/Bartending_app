import { notFound } from "next/navigation";
import { extractIdFromRecipeSlug } from "@bartendingapp/shared";
import { MoreLikeThisClient } from "@/recipe-recommendations/more-like-this-client";

export default async function MoreLikeThisPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const id = extractIdFromRecipeSlug(slug);

  if (!id) {
    notFound();
  }

  return <MoreLikeThisClient recipeId={id} />;
}
