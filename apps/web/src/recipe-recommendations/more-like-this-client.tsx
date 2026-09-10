"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/button";
import { EmptyState } from "@/components/empty-state";
import { Spinner } from "@/components/spinner";
import { Text } from "@/components/text";
import { RecipeCard } from "@/recipes/recipe-card";
import { RECOMMENDATIONS_PAGE_SIZE, type RecommendedRecipe } from "@bartendingapp/shared";
import { useRecipeRecommendations } from "./use-recipe-recommendations";

export function MoreLikeThisClient({ recipeId }: { recipeId: string }) {
  const [pages, setPages] = useState<RecommendedRecipe[][]>([]);
  const pageOffset = pages.length * RECOMMENDATIONS_PAGE_SIZE;
  const { data, error, isPending, isFetching, refetch } = useRecipeRecommendations(
    recipeId,
    pageOffset,
  );

  const allResults = useMemo(() => pages.flat().concat(data ?? []), [pages, data]);
  const hasMore = (data?.length ?? 0) === RECOMMENDATIONS_PAGE_SIZE;

  return (
    <main className="flex flex-col gap-four p-six">
      <Text variant="display" as="h1">
        You may also like
      </Text>

      {error ? (
        <EmptyState
          title="Something went wrong"
          description="We couldn't load recommendations. Check your connection and try again."
          action={<Button onClick={() => refetch()}>Retry</Button>}
        />
      ) : isPending && pages.length === 0 ? (
        <div className="flex justify-center py-six">
          <Spinner label="Loading recommendations" />
        </div>
      ) : allResults.length === 0 ? (
        <EmptyState
          title="No recommendations available"
          description="We couldn't find any recommendations right now."
        />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-three sm:grid-cols-3 md:grid-cols-4">
            {allResults.map((recipe) => (
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

          {hasMore && (
            <div className="flex justify-center py-four">
              <Button
                variant="secondary"
                disabled={isFetching}
                onClick={() => setPages((prev) => [...prev, data ?? []])}
              >
                {isFetching ? "Loading…" : "Load more"}
              </Button>
            </div>
          )}
        </>
      )}
    </main>
  );
}
