"use client";

import Link from "next/link";
import { Button } from "@/components/button";
import { EmptyState } from "@/components/empty-state";
import { Spinner } from "@/components/spinner";
import { Text } from "@/components/text";
import { buildRecipeSlugPath } from "@bartendingapp/shared";
import { RecipeCard } from "@/recipes/recipe-card";
import {
  useRecipeRecommendations,
  useRecordRecentlyViewedRecipe,
} from "./use-recipe-recommendations";

export function RecommendationsSection({
  recipeId,
  recipeName,
}: {
  recipeId: string;
  recipeName: string;
}) {
  useRecordRecentlyViewedRecipe(recipeId);
  const { data, error, isPending, refetch } = useRecipeRecommendations(recipeId);

  return (
    <section className="flex flex-col gap-three">
      <Text variant="heading" as="h2">
        You may also like
      </Text>

      {error ? (
        <EmptyState
          title="Something went wrong"
          description="We couldn't load recommendations. Check your connection and try again."
          action={<Button onClick={() => refetch()}>Retry</Button>}
        />
      ) : isPending ? (
        <div className="flex justify-center py-six">
          <Spinner label="Loading recommendations" />
        </div>
      ) : data.length === 0 ? (
        <Text variant="body" muted>
          No recommendations available right now.
        </Text>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-three sm:grid-cols-3 md:grid-cols-4">
            {data.map((recipe) => (
              <RecipeCard
                key={recipe.id}
                recipe={{
                  id: recipe.id,
                  name: recipe.name,
                  imageUrl: recipe.imageUrl,
                  alcoholicStatus: recipe.alcoholicStatus,
                }}
              />
            ))}
          </div>
          <Link
            href={`/recipes/${buildRecipeSlugPath(recipeId, recipeName)}/more-like-this`}
            className="text-label font-medium text-accent hover:underline"
          >
            See more
          </Link>
        </>
      )}
    </section>
  );
}
