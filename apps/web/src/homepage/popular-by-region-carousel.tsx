"use client";

import { HOMEPAGE_CAROUSEL_LIMIT, slugify } from "@bartendingapp/shared";
import { RecipeCard } from "@/recipes/recipe-card";
import { Carousel, CarouselItem, CarouselSkeleton } from "./carousel";
import { useHomePopularByRegion } from "./use-homepage-data";

export function PopularByRegionCarousel({ region }: { region: string }) {
  const { data, error, isPending } = useHomePopularByRegion(region);

  if (isPending) {
    return <CarouselSkeleton title={`Popular in ${region}`} />;
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
      <Carousel
        title={`Popular in ${region}`}
        seeMoreHref={`/popular/${slugify(region, "region")}`}
      >
        {recipes.map((recipe) => (
          <CarouselItem key={recipe.id}>
            <RecipeCard recipe={recipe} />
          </CarouselItem>
        ))}
      </Carousel>
    </div>
  );
}
