import { useEffect } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ScrollView, SafeAreaView, StyleSheet, View } from "react-native";

import { BackButton } from "@/components/back-button";
import { Button } from "@/components/button";
import { EmptyState } from "@/components/empty-state";
import { Spinner } from "@/components/spinner";
import { Text } from "@/components/text";
import { Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";
import { CommentSection } from "@/comments/comment-section";
import { FlavorProfileSection } from "@/recipes/flavor-profile-section";
import { RecipeDetailHeader } from "@/recipes/recipe-detail-header";
import { RecipeMeasures } from "@/recipes/recipe-measures";
import { useRecipeDetail } from "@/recipes/use-recipe-detail";
import { useRecipeRedirect } from "@/recipes/use-recipe-redirect";
import { RecommendationsSection } from "@/recipe-recommendations/recommendations-section";

export default function RecipeDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const theme = useTheme();
  const router = useRouter();
  const { data: recipe, error, isPending, refetch } = useRecipeDetail(id);
  // A hidden duplicate opens its kept recipe instead (spec 0036, AC-2). One
  // hop: the target is live, so its own lookup never redirects again.
  const redirect = useRecipeRedirect(id, recipe === null);
  const redirectTarget = redirect.data ?? null;

  useEffect(() => {
    if (redirectTarget) {
      router.replace({ pathname: "/recipe/[id]", params: { id: redirectTarget } });
    }
  }, [redirectTarget, router]);

  if (isPending || (recipe === null && (redirect.isPending || redirectTarget))) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: theme.bg }]}>
        <BackButton />
        <View style={styles.centered}>
          <Spinner label="Loading recipe" />
        </View>
      </SafeAreaView>
    );
  }

  if (error || redirect.error) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: theme.bg }]}>
        <BackButton />
        <View style={styles.centered}>
          <EmptyState
            title="Something went wrong"
            description="We couldn't load this recipe. Check your connection and try again."
            action={<Button onPress={() => (error ? refetch() : redirect.refetch())}>Retry</Button>}
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

        <FlavorProfileSection flavors={recipe.flavorProfile} />

        <RecipeMeasures key={recipe.id} ingredients={recipe.ingredients} />

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
