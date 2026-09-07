import { useMemo } from "react";
import { SafeAreaView, StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";

import { Button } from "@/components/button";
import { EmptyState } from "@/components/empty-state";
import { Spinner } from "@/components/spinner";
import { Text } from "@/components/text";
import { Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";
import { RecipeCard } from "@/recipes/recipe-card";
import { useDrinkIdeas } from "@/drink-ideas/use-drink-ideas";

export default function DrinkIdeasScreen() {
  const theme = useTheme();
  const router = useRouter();

  const { data, error, isPending, isFetchingNextPage, hasNextPage, fetchNextPage, refetch } =
    useDrinkIdeas();

  const matches = useMemo(() => data?.pages.flat() ?? [], [data]);
  const canMakeNow = useMemo(() => matches.filter((match) => match.missingRatio === 0), [matches]);
  const almostThere = useMemo(() => matches.filter((match) => match.missingRatio > 0), [matches]);

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
        <EmptyState
          title="No drink ideas yet"
          description="Add a few ingredients to your pantry and we'll show you what you can make."
          action={<Button onPress={() => router.push("/pantry")}>Go to pantry</Button>}
        />
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
