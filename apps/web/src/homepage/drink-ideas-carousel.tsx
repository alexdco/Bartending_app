"use client";

import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { HOMEPAGE_CAROUSEL_LIMIT, isSessionError } from "@bartendingapp/shared";
import { Text } from "@/components/text";
import { RecipeCard } from "@/recipes/recipe-card";
import { useDrinkIdeas } from "@/drink-ideas/use-drink-ideas";
import { Carousel, CarouselItem, CarouselSkeleton } from "./carousel";

export function DrinkIdeasCarousel({ onSessionError }: { onSessionError: () => void }) {
  const t = useTranslations("home");
  const { data, error, isPending } = useDrinkIdeas();

  if (isPending) {
    return <CarouselSkeleton title={t("drinkIdeasTitle")} />;
  }

  if (error) {
    if (isSessionError(error)) {
      onSessionError();
    }
    return null;
  }

  const matches = (data?.pages[0] ?? []).slice(0, HOMEPAGE_CAROUSEL_LIMIT);

  if (matches.length === 0) {
    return (
      <section className="flex flex-col gap-three px-six">
        <Text variant="heading" as="h2">
          {t("drinkIdeasTitle")}
        </Text>
        <div className="flex flex-col items-start gap-two rounded-large border border-border bg-surface p-four">
          <Text variant="body" muted>
            {t("drinkIdeasEmpty")}
          </Text>
          <Link
            href="/pantry"
            className="inline-flex items-center justify-center gap-two rounded-medium bg-accent px-four py-two text-label font-medium text-accent-text transition-colors hover:opacity-90"
          >
            {t("goToPantry")}
          </Link>
        </div>
      </section>
    );
  }

  return (
    <div className="px-six">
      <Carousel title={t("drinkIdeasTitle")} seeMoreHref="/drink-ideas">
        {matches.map((match) => (
          <CarouselItem key={match.id}>
            <RecipeCard
              recipe={{
                id: match.id,
                name: match.name,
                imageUrl: match.imageUrl,
                alcoholicStatus: match.alcoholicStatus,
              }}
              missingIngredientNames={match.missingIngredients.map((ingredient) => ingredient.name)}
            />
          </CarouselItem>
        ))}
      </Carousel>
    </div>
  );
}
