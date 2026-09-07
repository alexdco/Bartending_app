import { StyleSheet, View } from "react-native";

import { Button } from "@/components/button";
import { Text } from "@/components/text";
import { Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";
import type { RecipeIngredientDetail } from "@bartendingapp/shared";
import { usePantry } from "@/pantry/use-pantry";
import { useAddPantryItem } from "@/pantry/use-pantry-mutations";

export interface IngredientListProps {
  ingredients: RecipeIngredientDetail[];
}

export function IngredientList({ ingredients }: IngredientListProps) {
  const theme = useTheme();
  const pantry = usePantry();
  const addPantryItem = useAddPantryItem();
  const pantryIds = new Set((pantry.data ?? []).map((item) => item.ingredientId));

  return (
    <View style={styles.list}>
      {ingredients.map((ingredient) => {
        const inPantry = pantryIds.has(ingredient.ingredientId);
        return (
          <View key={ingredient.ingredientId} style={styles.row}>
            <Text variant="body">
              {ingredient.measure ? `${ingredient.measure} ` : ""}
              {ingredient.name}
            </Text>
            <Button
              variant="secondary"
              disabled={inPantry}
              onPress={() =>
                addPantryItem.mutate({
                  ingredientId: ingredient.ingredientId,
                  name: ingredient.name,
                })
              }
            >
              {inPantry ? "In pantry" : "Add to pantry"}
            </Button>
          </View>
        );
      })}
      {addPantryItem.isError && (
        <Text variant="bodySmall" style={{ color: theme.danger }}>
          Couldn&apos;t add that ingredient. Check your connection and try again.
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  list: {
    gap: Spacing.one,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
});
