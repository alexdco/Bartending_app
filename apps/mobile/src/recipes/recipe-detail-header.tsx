import { StyleSheet, View } from "react-native";

import { Spacing } from "@/constants/theme";
import { Chip } from "@/components/chip";
import { Text } from "@/components/text";
import type { RecipeDetail } from "@bartendingapp/shared";
import { alcoholicStatusLabel } from "./format";
import { RecipeImage } from "./recipe-image";

export interface RecipeDetailHeaderProps {
  recipe: RecipeDetail;
}

export function RecipeDetailHeader({ recipe }: RecipeDetailHeaderProps) {
  return (
    <View style={styles.container}>
      <RecipeImage uri={recipe.imageUrl} style={styles.image} />
      <Text variant="display">{recipe.name}</Text>
      <View style={styles.chips}>
        <Chip>{alcoholicStatusLabel(recipe.alcoholicStatus)}</Chip>
        {recipe.glass && <Chip>{recipe.glass}</Chip>}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: Spacing.three,
  },
  image: {
    width: "100%",
    aspectRatio: 16 / 9,
  },
  chips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.two,
  },
});
