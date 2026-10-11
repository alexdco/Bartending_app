"use client";

import { useTranslations } from "next-intl";
import { HOMEPAGE_CAROUSEL_LIMIT, slugify } from "@bartendingapp/shared";
import { RecipeCard } from "@/recipes/recipe-card";
import { Carousel, CarouselItem, CarouselSkeleton } from "./carousel";
import { useHomePopularByRegion } from "./use-homepage-data";

export function PopularByRegionCarousel({ region }: { region: string }) {
  const t = useTranslations("home");
  const { data, error, isPending } = useHomePopularByRegion(region);

  if (isPending) {
    return <CarouselSkeleton title={t("popularIn", { region })} />;
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
        title={t("popularIn", { region })}
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
