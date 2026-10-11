"use client";

import { useTranslations } from "next-intl";
import { HOMEPAGE_CAROUSEL_LIMIT, isSessionError } from "@bartendingapp/shared";
import { RecipeCard } from "@/recipes/recipe-card";
import { Carousel, CarouselItem, CarouselSkeleton } from "./carousel";
import { useHomeRecommendations } from "./use-homepage-data";

export function RecommendationsCarousel({ onSessionError }: { onSessionError: () => void }) {
  const t = useTranslations("home");
  const { data, error, isPending } = useHomeRecommendations();

  if (isPending) {
    return <CarouselSkeleton title={t("recommendedForYou")} />;
  }

  if (error) {
    if (isSessionError(error)) {
      onSessionError();
    }
    return null;
  }

  const recipes = (data ?? []).slice(0, HOMEPAGE_CAROUSEL_LIMIT);

  if (recipes.length === 0) {
    return null;
  }

  return (
    <div className="px-six">
      <Carousel title={t("recommendedForYou")}>
        {recipes.map((recipe) => (
          <CarouselItem key={recipe.id}>
            <RecipeCard recipe={recipe} />
          </CarouselItem>
        ))}
      </Carousel>
    </div>
  );
}
