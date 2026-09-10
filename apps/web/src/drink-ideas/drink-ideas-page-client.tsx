"use client";

import { useEffect, useMemo, useRef } from "react";
import Link from "next/link";
import { Button } from "@/components/button";
import { EmptyState } from "@/components/empty-state";
import { Spinner } from "@/components/spinner";
import { Text } from "@/components/text";
import { RecipeCard } from "@/recipes/recipe-card";
import { usePantry } from "@/pantry/use-pantry";
import { buildDrinkIdeaGeneratedEvent, GenerateDrinkIdeaError } from "@bartendingapp/shared";
import { track } from "@/analytics/posthog-client";
import { useDrinkIdeas } from "./use-drink-ideas";
import { useGenerateDrinkIdea } from "./use-generate-drink-idea";
import { GeneratedRecipeCard } from "./generated-recipe-card";

const MIN_PANTRY_INGREDIENTS_FOR_GENERATION = 2;

function generateErrorMessage(reason: GenerateDrinkIdeaError["reason"], resetsAt?: string): string {
  switch (reason) {
    case "no_session":
      return "We couldn't verify your session. Check your connection and try again.";
    case "quota_exceeded":
      return resetsAt
        ? `You've reached today's generation limit. Try again after ${new Date(resetsAt).toLocaleString()}.`
        : "You've reached today's generation limit. Try again tomorrow.";
    case "pantry_too_small":
      return "Add a couple more pantry ingredients to generate an idea.";
    default:
      return "We couldn't generate a drink idea. Try again.";
  }
}

export function DrinkIdeasPageClient() {
  const { data, error, isPending, isFetchingNextPage, hasNextPage, fetchNextPage, refetch } =
    useDrinkIdeas();
  const { data: pantryItems } = usePantry();
  const generateDrinkIdea = useGenerateDrinkIdea();

  const matches = useMemo(() => data?.pages.flat() ?? [], [data]);
  const canMakeNow = useMemo(() => matches.filter((match) => match.missingRatio === 0), [matches]);
  const almostThere = useMemo(() => matches.filter((match) => match.missingRatio > 0), [matches]);
  const canGenerate = (pantryItems?.length ?? 0) >= MIN_PANTRY_INGREDIENTS_FOR_GENERATION;

  const firstPage = data?.pages[0];
  const firedMatchedRef = useRef(false);

  useEffect(() => {
    if (!firstPage || firstPage.length === 0 || firedMatchedRef.current) {
      return;
    }

    firedMatchedRef.current = true;
    const event = buildDrinkIdeaGeneratedEvent({
      source: "matched",
      pantry_size: pantryItems?.length ?? 0,
      match_count: firstPage.length,
    });
    track(event.name, event.properties);
  }, [firstPage, pantryItems]);

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

  const generateSection = canGenerate && (
    <section className="flex flex-col gap-three">
      <Text variant="heading" as="h2">
        Something new
      </Text>
      {generateDrinkIdea.data ? (
        <GeneratedRecipeCard idea={generateDrinkIdea.data} />
      ) : generateDrinkIdea.error ? (
        <EmptyState
          title="Couldn't generate an idea"
          description={
            generateDrinkIdea.error instanceof GenerateDrinkIdeaError
              ? generateErrorMessage(
                  generateDrinkIdea.error.reason,
                  generateDrinkIdea.error.resetsAt,
                )
              : generateErrorMessage("generation_failed")
          }
          action={<Button onClick={() => generateDrinkIdea.mutate()}>Retry</Button>}
        />
      ) : (
        <Button
          variant="secondary"
          onClick={() => generateDrinkIdea.mutate()}
          disabled={generateDrinkIdea.isPending}
        >
          {generateDrinkIdea.isPending ? "Generating…" : "Generate a new idea"}
        </Button>
      )}
    </section>
  );

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
        <>
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
          {generateSection}
        </>
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

          {generateSection}

          <div ref={sentinelRef} className="flex justify-center py-four">
            {isFetchingNextPage && <Spinner label="Loading more drink ideas" />}
          </div>
        </>
      )}
    </div>
  );
}
