import { useEffect, useMemo, useRef } from "react";
import { SafeAreaView, StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";

import { Button } from "@/components/button";
import { EmptyState } from "@/components/empty-state";
import { Spinner } from "@/components/spinner";
import { Text } from "@/components/text";
import { Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";
import { RecipeCard } from "@/recipes/recipe-card";
import { usePantry } from "@/pantry/use-pantry";
import { buildDrinkIdeaGeneratedEvent, GenerateDrinkIdeaError } from "@bartendingapp/shared";
import { track } from "@/analytics/posthog-client";
import { useDrinkIdeas } from "@/drink-ideas/use-drink-ideas";
import { useGenerateDrinkIdea } from "@/drink-ideas/use-generate-drink-idea";
import { GeneratedRecipeCard } from "@/drink-ideas/generated-recipe-card";

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

export default function DrinkIdeasScreen() {
  const theme = useTheme();
  const router = useRouter();

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

  const generateSection = canGenerate && (
    <View style={styles.section}>
      <Text variant="heading">Something new</Text>
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
          action={<Button onPress={() => generateDrinkIdea.mutate()}>Retry</Button>}
        />
      ) : (
        <Button
          variant="secondary"
          onPress={() => generateDrinkIdea.mutate()}
          disabled={generateDrinkIdea.isPending}
        >
          {generateDrinkIdea.isPending ? "Generating…" : "Generate a new idea"}
        </Button>
      )}
    </View>
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.bg }]}>
      <View style={styles.header}>
        <Text variant="display">Drink ideas</Text>
      </View>

      {error ? (
        <EmptyState
          title="Something went wrong"
          description="We couldn't load your drink ideas. Check your connection and try again."
          action={<Button onPress={() => refetch()}>Retry</Button>}
        />
      ) : isPending ? (
        <View style={styles.centered}>
          <Spinner label="Loading drink ideas" />
        </View>
      ) : matches.length === 0 ? (
        <View style={styles.list}>
          <EmptyState
            title="No drink ideas yet"
            description="Add a few ingredients to your pantry and we'll show you what you can make."
            action={<Button onPress={() => router.push("/pantry")}>Go to pantry</Button>}
          />
          {generateSection}
        </View>
      ) : (
        <View style={styles.list}>
          {canMakeNow.length > 0 && (
            <View style={styles.section}>
              <Text variant="heading">You can make now</Text>
              <View style={styles.grid}>
                {canMakeNow.map((match) => (
                  <View key={match.id} style={styles.gridItem}>
                    <RecipeCard
                      recipe={{
                        id: match.id,
                        name: match.name,
                        imageUrl: match.imageUrl,
                        alcoholicStatus: match.alcoholicStatus,
                      }}
                    />
                  </View>
                ))}
              </View>
            </View>
          )}

          {almostThere.length > 0 && (
            <View style={styles.section}>
              <Text variant="heading">Almost there</Text>
              <View style={styles.grid}>
                {almostThere.map((match) => (
                  <View key={match.id} style={styles.gridItem}>
                    <RecipeCard
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
                  </View>
                ))}
              </View>
            </View>
          )}

          {generateSection}

          {hasNextPage && (
            <View style={styles.centered}>
              {isFetchingNextPage ? (
                <Spinner label="Loading more drink ideas" />
              ) : (
                <Button variant="secondary" onPress={() => fetchNextPage()}>
                  Load more
                </Button>
              )}
            </View>
          )}
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    gap: Spacing.three,
    padding: Spacing.four,
  },
  list: {
    paddingHorizontal: Spacing.four,
    paddingBottom: Spacing.four,
    gap: Spacing.four,
  },
  section: {
    gap: Spacing.two,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.three,
  },
  gridItem: {
    width: "47%",
  },
  centered: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: Spacing.four,
  },
});
