"use client";

import { useEffect, useMemo, useRef } from "react";
import Link from "next/link";
import { EmptyState } from "@/components/empty-state";
import { Spinner } from "@/components/spinner";
import { Text } from "@/components/text";
import { RecipeCard } from "@/recipes/recipe-card";
import { Button } from "@/components/button";
import { useFavoriteRecipes } from "./use-favorites";

export function FavoritesPageClient() {
  const { data, error, isPending, isFetchingNextPage, hasNextPage, fetchNextPage, refetch } =
    useFavoriteRecipes();

  const recipes = useMemo(() => data?.pages.flat() ?? [], [data]);

  const sentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && hasNextPage && !isFetchingNextPage) {
          fetchNextPage();
        }
      },
      { rootMargin: "200px" },
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  return (
    <div className="flex flex-col gap-four p-six">
      <Text variant="display" as="h1">
        Favorites
      </Text>

      {error ? (
        <EmptyState
          title="Something went wrong"
          description="We couldn't load your favorites. Check your connection and try again."
          action={<Button onClick={() => refetch()}>Retry</Button>}
        />
      ) : isPending ? (
        <div className="flex justify-center py-six">
          <Spinner label="Loading favorites" />
        </div>
      ) : recipes.length === 0 ? (
        <EmptyState
          title="No favorites yet"
          description="Favorite a recipe from its card or detail page to see it here."
          action={
            <Link
              href="/"
              className="inline-flex items-center justify-center gap-two rounded-medium bg-accent px-four py-two text-label font-medium text-accent-text transition-colors hover:opacity-90"
            >
              Browse recipes
            </Link>
          }
        />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-three sm:grid-cols-3 md:grid-cols-4">
            {recipes.map((recipe) => (
              <RecipeCard key={recipe.id} recipe={recipe} />
            ))}
          </div>
          <div ref={sentinelRef} className="flex justify-center py-four">
            {isFetchingNextPage && <Spinner label="Loading more favorites" />}
          </div>
        </>
      )}
    </div>
  );
}
