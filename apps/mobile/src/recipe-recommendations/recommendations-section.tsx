import { useRouter } from "expo-router";
import { StyleSheet, View } from "react-native";

import { Button } from "@/components/button";
import { EmptyState } from "@/components/empty-state";
import { Spinner } from "@/components/spinner";
import { Text } from "@/components/text";
import { Spacing } from "@/constants/theme";
import { RecipeCard } from "@/recipes/recipe-card";
import {
  useRecipeRecommendations,
  useRecordRecentlyViewedRecipe,
} from "./use-recipe-recommendations";

const MAX_VISIBLE_RECOMMENDATIONS = 8;

export function RecommendationsSection({ recipeId }: { recipeId: string }) {
  const router = useRouter();
  useRecordRecentlyViewedRecipe(recipeId);
  const { data: recommendations, error, isPending, refetch } = useRecipeRecommendations(recipeId);
  const data = recommendations ?? [];

  return (
    <View style={styles.section}>
      <Text variant="heading">You may also like</Text>

      {error ? (
        <EmptyState
          title="Something went wrong"
          description="We couldn't load recommendations. Check your connection and try again."
          action={<Button onPress={() => refetch()}>Retry</Button>}
        />
      ) : isPending ? (
        <View style={styles.centered}>
          <Spinner label="Loading recommendations" />
        </View>
      ) : data.length === 0 ? (
        <Text variant="body" muted>
          No recommendations available right now.
        </Text>
      ) : (
        <>
          <View style={styles.grid}>
            {data.slice(0, MAX_VISIBLE_RECOMMENDATIONS).map((recipe) => (
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
          <Button
            variant="secondary"
            onPress={() =>
              router.push({ pathname: "/recipe/[id]/more-like-this", params: { id: recipeId } })
            }
          >
            See more
          </Button>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
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
