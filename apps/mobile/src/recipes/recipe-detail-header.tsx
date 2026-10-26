import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { useTranslation } from "react-i18next";

import { Spacing } from "@/constants/theme";
import { Chip } from "@/components/chip";
import { Text } from "@/components/text";
import { FavoriteToggle } from "@/favorites/favorite-toggle";
import { useAddFavorite, useRemoveFavorite } from "@/favorites/use-favorite-mutations";
import { RecipeRating } from "@/ratings/recipe-rating";
import { THECOCKTAILDB_CREDIT_URL, type RecipeDetail } from "@bartendingapp/shared";
import { ExternalLink } from "@/components/external-link";
import { alcoholicStatusLabel } from "./format";
import { RecipeImage } from "./recipe-image";

export interface RecipeDetailHeaderProps {
  recipe: RecipeDetail;
}

export function RecipeDetailHeader({ recipe }: RecipeDetailHeaderProps) {
  const { t } = useTranslation();
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
        <RecipeImage uri={recipe.imageUrl} style={styles.image} accessibilityLabel={recipe.name} />
        <View style={styles.toggleOverlay}>
          <FavoriteToggle
            recipeName={recipe.name}
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
      <RecipeRating recipeId={recipe.id} />
      {recipe.isCocktailDbRecipe && (
        <ExternalLink href={THECOCKTAILDB_CREDIT_URL} accessibilityRole="link">
          <Text variant="bodySmall" muted style={styles.credit}>
            {t("recipe.cocktailDbCredit")}
          </Text>
        </ExternalLink>
      )}
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
  credit: {
    textDecorationLine: "underline",
  },
  chips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.two,
  },
});
