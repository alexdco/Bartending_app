"use client";

import { useEffect } from "react";
import { HOMEPAGE_CAROUSEL_LIMIT } from "@bartendingapp/shared";
import { RecipeCard } from "@/recipes/recipe-card";
import { Carousel, CarouselItem, CarouselSkeleton } from "./carousel";
import { useHomeRecentlyViewed } from "./use-homepage-data";

export function RecentlyViewedCarousel() {
  const { data, error, isPending, fetchStatus } = useHomeRecentlyViewed();

  useEffect(() => {
    if (error) {
      // TODO: report to Sentry once it's installed (scope feature 14, not yet built).
      console.error("Failed to load recently viewed recipes", error);
    }
  }, [error]);

  if (fetchStatus === "idle" && !data) {
    // no recently viewed ids to look up; the carousel is omitted entirely
    return null;
  }

  if (isPending) {
    return <CarouselSkeleton title="Recently viewed" />;
  }

  if (error) {
    return null;
  }

  const recipes = (data ?? []).slice(0, HOMEPAGE_CAROUSEL_LIMIT);

  if (recipes.length === 0) {
    return null;
  }

  return (
    <div className="px-six">
      <Carousel title="Recently viewed">
        {recipes.map((recipe) => (
          <CarouselItem key={recipe.id}>
            <RecipeCard recipe={recipe} />
          </CarouselItem>
        ))}
      </Carousel>
    </div>
  );
}
