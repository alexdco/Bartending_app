import type { ReactNode } from "react";
import { SafeAreaView, StyleSheet, View } from "react-native";

import { BackButton } from "@/components/back-button";
import { Spinner } from "@/components/spinner";
import { useTheme } from "@/hooks/use-theme";
import { useRecipeDetail } from "@/recipes/use-recipe-detail";
import { useMocktailsOnly } from "./mocktails-context";
import { MocktailsUnavailable } from "./mocktails-unavailable";

// For a screen about one recipe that does not load its detail itself (more
// like this). In mocktails only mode it renders only a loading state until the
// recipe's mocktailSafe flag is known, then the screen or the notice (spec
// 0063 AC-6). A failed or missing lookup shows the notice, so it fails closed.
// Everyone else gets the screen straight away.
export function RecipeMocktailsGate({
  recipeId,
  children,
}: {
  readonly recipeId: string;
  readonly children: ReactNode;
}) {
  return useMocktailsOnly() ? (
    <SafeCheck recipeId={recipeId}>{children}</SafeCheck>
  ) : (
    <>{children}</>
  );
}

function SafeCheck({ recipeId, children }: { recipeId: string; children: ReactNode }) {
  const theme = useTheme();
  const { data: recipe, isPending } = useRecipeDetail(recipeId);

  if (isPending) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: theme.bg }]}>
        <BackButton />
        <View style={styles.centered}>
          <Spinner label="Loading" />
        </View>
      </SafeAreaView>
    );
  }

  return recipe?.mocktailSafe ? <>{children}</> : <MocktailsUnavailable />;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
});
