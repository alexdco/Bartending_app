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
import { useFavoriteRecipes } from "@/favorites/use-favorites";

export default function FavoritesScreen() {
  const theme = useTheme();
  const router = useRouter();

  const { data, error, isPending, isFetchingNextPage, hasNextPage, fetchNextPage, refetch } =
    useFavoriteRecipes();

  const recipes = useMemo(() => data?.pages.flat() ?? [], [data]);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.bg }]}>
      <View style={styles.header}>
        <Text variant="display">Favorites</Text>
      </View>

      {error ? (
        <EmptyState
          title="Something went wrong"
          description="We couldn't load your favorites. Check your connection and try again."
          action={<Button onPress={() => refetch()}>Retry</Button>}
        />
      ) : isPending ? (
        <View style={styles.centered}>
          <Spinner label="Loading favorites" />
        </View>
      ) : recipes.length === 0 ? (
        <View style={styles.list}>
          <EmptyState
            title="No favorites yet"
            description="Favorite a recipe from its card or detail page to see it here."
            action={<Button onPress={() => router.push("/")}>Browse recipes</Button>}
          />
        </View>
      ) : (
        <View style={styles.list}>
          <View style={styles.grid}>
            {recipes.map((recipe) => (
              <View key={recipe.id} style={styles.gridItem}>
                <RecipeCard recipe={recipe} />
              </View>
            ))}
          </View>

          {hasNextPage && (
            <View style={styles.centered}>
              {isFetchingNextPage ? (
                <Spinner label="Loading more favorites" />
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
