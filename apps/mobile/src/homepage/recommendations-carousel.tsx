import { HOMEPAGE_CAROUSEL_LIMIT, isSessionError } from "@bartendingapp/shared";
import { RecipeCard } from "@/recipes/recipe-card";
import { Carousel, CarouselSkeleton } from "./carousel";
import { ClassicsCarousel } from "./classics-carousel";
import { useHomeRecommendations } from "./use-homepage-data";

export function RecommendationsCarousel({ onSessionError }: { onSessionError: () => void }) {
  const { data, error, isPending } = useHomeRecommendations();

  if (isPending) {
    return <CarouselSkeleton title="Recommended for you" />;
  }

  if (error) {
    if (isSessionError(error)) {
      onSessionError();
    }
    return null;
  }

  const recipes = (data ?? []).slice(0, HOMEPAGE_CAROUSEL_LIMIT);

  // Spec 0038 AC-4: succeeded with zero results, so offer classics instead.
  if (recipes.length === 0) {
    return <ClassicsCarousel />;
  }

  return (
    <Carousel
      title="Recommended for you"
      data={recipes}
      keyExtractor={(recipe) => recipe.id}
      renderItem={(recipe) => <RecipeCard recipe={recipe} />}
    />
  );
}
