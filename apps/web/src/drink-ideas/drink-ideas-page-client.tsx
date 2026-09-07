"use client";

import { useEffect, useMemo, useRef } from "react";
import Link from "next/link";
import { Button } from "@/components/button";
import { EmptyState } from "@/components/empty-state";
import { Spinner } from "@/components/spinner";
import { Text } from "@/components/text";
import { RecipeCard } from "@/recipes/recipe-card";
import { useDrinkIdeas } from "./use-drink-ideas";

export function DrinkIdeasPageClient() {
  const { data, error, isPending, isFetchingNextPage, hasNextPage, fetchNextPage, refetch } =
    useDrinkIdeas();

  const matches = useMemo(() => data?.pages.flat() ?? [], [data]);
  const canMakeNow = useMemo(() => matches.filter((match) => match.missingRatio === 0), [matches]);
  const almostThere = useMemo(() => matches.filter((match) => match.missingRatio > 0), [matches]);

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
        Drink ideas
      </Text>

      {error ? (
        <EmptyState
          title="Something went wrong"
          description="We couldn't load your drink ideas. Check your connection and try again."
          action={<Button onClick={() => refetch()}>Retry</Button>}
        />
      ) : isPending ? (
        <div className="flex justify-center py-six">
          <Spinner label="Loading drink ideas" />
        </div>
      ) : matches.length === 0 ? (
        <EmptyState
          title="No drink ideas yet"
          description="Add a few ingredients to your pantry and we'll show you what you can make."
          action={
            <Link
              href="/pantry"
              className="inline-flex items-center justify-center gap-two rounded-medium bg-accent px-four py-two text-label font-medium text-accent-text transition-colors hover:opacity-90"
            >
              Go to pantry
            </Link>
          }
        />
      ) : (
        <>
          {canMakeNow.length > 0 && (
            <section className="flex flex-col gap-three">
              <Text variant="heading" as="h2">
                You can make now
              </Text>
              <div className="grid grid-cols-2 gap-three sm:grid-cols-3 md:grid-cols-4">
                {canMakeNow.map((match) => (
                  <RecipeCard
                    key={match.id}
                    recipe={{
                      id: match.id,
                      name: match.name,
                      imageUrl: match.imageUrl,
                      alcoholicStatus: match.alcoholicStatus,
                    }}
                  />
                ))}
              </div>
            </section>
          )}

          {almostThere.length > 0 && (
            <section className="flex flex-col gap-three">
              <Text variant="heading" as="h2">
                Almost there
              </Text>
              <div className="grid grid-cols-2 gap-three sm:grid-cols-3 md:grid-cols-4">
                {almostThere.map((match) => (
                  <RecipeCard
                    key={match.id}
                    recipe={{
                      id: match.id,
                      name: match.name,
                      imageUrl: match.imageUrl,
                      alcoholicStatus: match.alcoholicStatus,
                    }}
                    missingIngredientNames={match.missingIngredients.map(
                      (ingredient) => ingredient.name,
                    )}
                  />
                ))}
              </div>
            </section>
          )}

          <div ref={sentinelRef} className="flex justify-center py-four">
            {isFetchingNextPage && <Spinner label="Loading more drink ideas" />}
          </div>
        </>
      )}
    </div>
  );
}
