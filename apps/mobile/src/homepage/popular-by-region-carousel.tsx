import { useRouter } from "expo-router";
import { HOMEPAGE_CAROUSEL_LIMIT } from "@bartendingapp/shared";
import { RecipeCard } from "@/recipes/recipe-card";
import { Carousel, CarouselSkeleton } from "./carousel";
import { useHomePopularByRegion } from "./use-homepage-data";

export function PopularByRegionCarousel({ region }: { region: string }) {
  const router = useRouter();
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
    <Carousel
      title={`Popular in ${region}`}
      data={recipes}
      keyExtractor={(recipe) => recipe.id}
      onSeeMore={() => router.push({ pathname: "/popular", params: { region } })}
      renderItem={(recipe) => <RecipeCard recipe={recipe} />}
    />
  );
}
