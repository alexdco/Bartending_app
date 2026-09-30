import { useLocalSearchParams } from "expo-router";
import { ScrollView, SafeAreaView, StyleSheet, View } from "react-native";

import { BackButton } from "@/components/back-button";
import { Button } from "@/components/button";
import { EmptyState } from "@/components/empty-state";
import { Spinner } from "@/components/spinner";
import { Text } from "@/components/text";
import { Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";
import { BatchPanel } from "@/recipes/batch-panel";
import { CommentSection } from "@/comments/comment-section";
import { IngredientList } from "@/recipes/ingredient-list";
import { RecipeDetailHeader } from "@/recipes/recipe-detail-header";
import { useRecipeDetail } from "@/recipes/use-recipe-detail";
import { RecommendationsSection } from "@/recipe-recommendations/recommendations-section";

export default function RecipeDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const theme = useTheme();
  const { data: recipe, error, isPending, refetch } = useRecipeDetail(id);

  if (isPending) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: theme.bg }]}>
        <BackButton />
        <View style={styles.centered}>
          <Spinner label="Loading recipe" />
        </View>
      </SafeAreaView>
    );
  }

  if (error) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: theme.bg }]}>
        <BackButton />
        <View style={styles.centered}>
          <EmptyState
            title="Something went wrong"
            description="We couldn't load this recipe. Check your connection and try again."
            action={<Button onPress={() => refetch()}>Retry</Button>}
          />
        </View>
      </SafeAreaView>
    );
  }

  if (!recipe) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: theme.bg }]}>
        <BackButton />
        <View style={styles.centered}>
          <EmptyState title="Recipe not found" description="This recipe may have been removed." />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.bg }]}>
      <ScrollView contentContainerStyle={styles.content}>
        <BackButton />
        <RecipeDetailHeader recipe={recipe} />

        <View style={styles.section}>
          <Text variant="heading">Ingredients</Text>
          <IngredientList ingredients={recipe.ingredients} />
        </View>

        <BatchPanel ingredients={recipe.ingredients} />

        <View style={styles.section}>
          <Text variant="heading">Instructions</Text>
          <Text variant="body">{recipe.instructions}</Text>
        </View>

        <RecommendationsSection recipeId={recipe.id} />

        <CommentSection recipeId={recipe.id} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    gap: Spacing.four,
    padding: Spacing.four,
  },
  section: {
    gap: Spacing.two,
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
});
