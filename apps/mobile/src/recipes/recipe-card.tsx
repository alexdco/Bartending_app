import { useRouter } from "expo-router";
import { Pressable, StyleSheet } from "react-native";

import { Spacing } from "@/constants/theme";
import { Card } from "@/components/card";
import { Chip } from "@/components/chip";
import { Text } from "@/components/text";
import type { RecipeSearchResult } from "@bartendingapp/shared";
import { alcoholicStatusLabel } from "./format";
import { RecipeImage } from "./recipe-image";

export interface RecipeCardProps {
  recipe: RecipeSearchResult;
}

export function RecipeCard({ recipe }: RecipeCardProps) {
  const router = useRouter();

  return (
    <Pressable
      onPress={() => router.push({ pathname: "/recipe/[id]", params: { id: recipe.id } })}
      accessibilityRole="button"
      accessibilityLabel={recipe.name}
      style={styles.pressable}
    >
      <Card style={styles.card}>
        <RecipeImage uri={recipe.imageUrl} style={styles.image} />
        <Text variant="subheading" numberOfLines={1}>
          {recipe.name}
        </Text>
        <Chip>{alcoholicStatusLabel(recipe.alcoholicStatus)}</Chip>
      </Card>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pressable: {
    flex: 1,
  },
  card: {
    gap: Spacing.two,
  },
  image: {
    width: "100%",
    aspectRatio: 1,
  },
});
