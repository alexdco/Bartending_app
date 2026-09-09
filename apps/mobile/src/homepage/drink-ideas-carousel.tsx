import { useRouter } from "expo-router";
import { StyleSheet, View } from "react-native";

import { Button } from "@/components/button";
import { Text } from "@/components/text";
import { Spacing } from "@/constants/theme";
import { RecipeCard } from "@/recipes/recipe-card";
import { useDrinkIdeas } from "@/drink-ideas/use-drink-ideas";
import { HOMEPAGE_CAROUSEL_LIMIT, isSessionError } from "@bartendingapp/shared";
import { Carousel, CarouselSkeleton } from "./carousel";

export function DrinkIdeasCarousel({ onSessionError }: { onSessionError: () => void }) {
  const router = useRouter();
  const { data, error, isPending } = useDrinkIdeas();

  if (isPending) {
    return <CarouselSkeleton title="Drink ideas from your pantry" />;
  }

  if (error) {
    if (isSessionError(error)) {
      onSessionError();
    }
    return null;
  }

  const matches = (data?.pages[0] ?? []).slice(0, HOMEPAGE_CAROUSEL_LIMIT);

  if (matches.length === 0) {
    return (
      <View style={styles.section}>
        <Text variant="heading">Drink ideas from your pantry</Text>
        <View style={styles.card}>
          <Text variant="body" muted>
            Add a few ingredients to your pantry and we&apos;ll show you what you can make.
          </Text>
          <Button onPress={() => router.push("/pantry")}>Go to pantry</Button>
        </View>
      </View>
    );
  }

  return (
    <Carousel
      title="Drink ideas from your pantry"
      data={matches}
      keyExtractor={(match) => match.id}
      onSeeMore={() => router.push("/drink-ideas")}
      renderItem={(match) => (
        <RecipeCard
          recipe={{
            id: match.id,
            name: match.name,
            imageUrl: match.imageUrl,
            alcoholicStatus: match.alcoholicStatus,
          }}
          missingIngredientNames={match.missingIngredients.map((ingredient) => ingredient.name)}
        />
      )}
    />
  );
}

const styles = StyleSheet.create({
  section: {
    gap: Spacing.two,
    paddingHorizontal: Spacing.four,
  },
  card: {
    gap: Spacing.three,
    alignItems: "flex-start",
  },
});
