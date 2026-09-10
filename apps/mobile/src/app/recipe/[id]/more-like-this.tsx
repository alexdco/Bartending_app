import { useLocalSearchParams } from "expo-router";
import { useMemo, useState } from "react";
import { SafeAreaView, ScrollView, StyleSheet, View } from "react-native";

import { Button } from "@/components/button";
import { EmptyState } from "@/components/empty-state";
import { Spinner } from "@/components/spinner";
import { Text } from "@/components/text";
import { Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";
import { RecipeCard } from "@/recipes/recipe-card";
import { RECOMMENDATIONS_PAGE_SIZE, type RecommendedRecipe } from "@bartendingapp/shared";
import { useRecipeRecommendations } from "@/recipe-recommendations/use-recipe-recommendations";

export default function MoreLikeThisScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const theme = useTheme();

  const [pages, setPages] = useState<RecommendedRecipe[][]>([]);
  const pageOffset = pages.length * RECOMMENDATIONS_PAGE_SIZE;
  const { data, error, isPending, isFetching, refetch } = useRecipeRecommendations(id, pageOffset);

  const allResults = useMemo(() => pages.flat().concat(data ?? []), [pages, data]);
  const hasMore = (data?.length ?? 0) === RECOMMENDATIONS_PAGE_SIZE;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.bg }]}>
      <View style={styles.header}>
        <Text variant="display">You may also like</Text>
      </View>

      {error ? (
        <EmptyState
          title="Something went wrong"
          description="We couldn't load recommendations. Check your connection and try again."
          action={<Button onPress={() => refetch()}>Retry</Button>}
        />
      ) : isPending && pages.length === 0 ? (
        <View style={styles.centered}>
          <Spinner label="Loading recommendations" />
        </View>
      ) : allResults.length === 0 ? (
        <EmptyState
          title="No recommendations available"
          description="We couldn't find any recommendations right now."
        />
      ) : (
        <ScrollView contentContainerStyle={styles.list}>
          <View style={styles.grid}>
            {allResults.map((recipe) => (
              <View key={recipe.id} style={styles.gridItem}>
                <RecipeCard
                  recipe={{
                    id: recipe.id,
                    name: recipe.name,
                    imageUrl: recipe.imageUrl,
                    alcoholicStatus: recipe.alcoholicStatus,
                  }}
                />
              </View>
            ))}
          </View>

          {hasMore && (
            <View style={styles.centered}>
              <Button
                variant="secondary"
                disabled={isFetching}
                onPress={() => setPages((prev) => [...prev, data ?? []])}
              >
                {isFetching ? "Loading…" : "Load more"}
              </Button>
            </View>
          )}
        </ScrollView>
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
