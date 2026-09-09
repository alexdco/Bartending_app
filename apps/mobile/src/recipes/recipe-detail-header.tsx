import { useState } from "react";
import { StyleSheet, View } from "react-native";

import { Spacing } from "@/constants/theme";
import { Chip } from "@/components/chip";
import { Text } from "@/components/text";
import { FavoriteToggle } from "@/favorites/favorite-toggle";
import { useAddFavorite, useRemoveFavorite } from "@/favorites/use-favorite-mutations";
import type { RecipeDetail } from "@bartendingapp/shared";
import { alcoholicStatusLabel } from "./format";
import { RecipeImage } from "./recipe-image";

export interface RecipeDetailHeaderProps {
  recipe: RecipeDetail;
}

export function RecipeDetailHeader({ recipe }: RecipeDetailHeaderProps) {
  const addFavorite = useAddFavorite();
  const removeFavorite = useRemoveFavorite();
  const [isFavorited, setIsFavorited] = useState(recipe.isFavorited);

  const handleToggle = () => {
    const nextIsFavorited = !isFavorited;
    setIsFavorited(nextIsFavorited);

    const mutation = nextIsFavorited ? addFavorite : removeFavorite;
    mutation.mutate({ recipeId: recipe.id }, { onError: () => setIsFavorited(!nextIsFavorited) });
  };

  return (
    <View style={styles.container}>
      <View style={styles.imageWrapper}>
        <RecipeImage uri={recipe.imageUrl} style={styles.image} />
        <View style={styles.toggleOverlay}>
          <FavoriteToggle
            isFavorited={isFavorited}
            disabled={addFavorite.isPending || removeFavorite.isPending}
            onToggle={handleToggle}
          />
        </View>
      </View>
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
  imageWrapper: {
    width: "100%",
    aspectRatio: 16 / 9,
  },
  image: {
    width: "100%",
    aspectRatio: 16 / 9,
  },
  toggleOverlay: {
    position: "absolute",
    top: Spacing.two,
    right: Spacing.two,
  },
  chips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.two,
  },
});
