import { useRouter } from "expo-router";
import { Pressable, StyleSheet, View } from "react-native";

import { Spacing } from "@/constants/theme";
import { Card } from "@/components/card";
import { Chip } from "@/components/chip";
import { Text } from "@/components/text";
import { FavoriteToggle } from "@/favorites/favorite-toggle";
import { useFavoriteRecipeIds } from "@/favorites/use-favorites";
import { useToggleFavorite } from "@/favorites/use-favorite-mutations";
import {
  formatMissingIngredients,
  recipeImageUrl,
  type RecipeSearchResult,
} from "@bartendingapp/shared";
import { alcoholicStatusLabel } from "./format";
import { RecipeImage } from "./recipe-image";

export interface RecipeCardProps {
  recipe: RecipeSearchResult;
  missingIngredientNames?: string[];
}

export function RecipeCard({ recipe, missingIngredientNames }: RecipeCardProps) {
  const router = useRouter();
  const { data: favoriteIds } = useFavoriteRecipeIds();
  const { toggle, isPending } = useToggleFavorite();
  const isFavorited = favoriteIds?.includes(recipe.id) ?? false;

  // Spec 0038 AC-10: the favorite toggle is a sibling of the card pressable,
  // never nested in it, so each is its own screen reader element and touch
  // target; the toggle floats over the image corner.
  return (
    <View style={styles.pressable}>
      <Pressable
        onPress={() => router.push({ pathname: "/recipe/[id]", params: { id: recipe.id } })}
        accessibilityRole="button"
        accessibilityLabel={recipe.name}
        style={styles.pressable}
      >
        <Card style={styles.card}>
          <View style={styles.imageWrapper}>
            <RecipeImage uri={recipeImageUrl(recipe.imageUrl, "card")} style={styles.image} />
          </View>
          <Text variant="subheading" numberOfLines={1}>
            {recipe.name}
          </Text>
          <Chip>{alcoholicStatusLabel(recipe.alcoholicStatus)}</Chip>
          {missingIngredientNames && missingIngredientNames.length > 0 && (
            <Text variant="bodySmall" muted numberOfLines={1}>
              Missing: {formatMissingIngredients(missingIngredientNames)}
            </Text>
          )}
        </Card>
      </Pressable>
      <View style={styles.toggleOverlay}>
        <FavoriteToggle
          recipeName={recipe.name}
          isFavorited={isFavorited}
          disabled={isPending}
          onToggle={() => toggle(recipe.id, isFavorited)}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  pressable: {
    flex: 1,
  },
  card: {
    gap: Spacing.two,
  },
  imageWrapper: {
    width: "100%",
    aspectRatio: 1,
  },
  image: {
    width: "100%",
    aspectRatio: 1,
  },
  // Card padding (Spacing.four) plus the old inset over the image (Spacing.two).
  toggleOverlay: {
    position: "absolute",
    top: Spacing.five,
    right: Spacing.five,
  },
});
