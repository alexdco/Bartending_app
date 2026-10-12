"use client";

import { useTranslations } from "next-intl";
import { RecipeCard } from "@/recipes/recipe-card";
import { Carousel, CarouselItem } from "./carousel";
import { useHomeClassics } from "./use-homepage-data";

// "Classics to start with": shown in place of recommendations once they
// succeeded empty (spec 0038 AC-4). Optional row, so pending, failed, or
// empty renders nothing.
export function ClassicsCarousel() {
  const t = useTranslations("home");
  const { data, isSuccess } = useHomeClassics();

  if (!isSuccess || data.length === 0) {
    return null;
  }

  return (
    <div className="px-six">
      <Carousel title={t("classicsTitle")}>
        {data.map((recipe) => (
          <CarouselItem key={recipe.id}>
            <RecipeCard recipe={recipe} />
          </CarouselItem>
        ))}
      </Carousel>
    </div>
  );
}
