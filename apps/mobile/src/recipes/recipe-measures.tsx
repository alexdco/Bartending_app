import { useState } from "react";
import { StyleSheet, View } from "react-native";

import { Text } from "@/components/text";
import { Spacing } from "@/constants/theme";
import { BatchPanel } from "@/recipes/batch-panel";
import { IngredientList } from "@/recipes/ingredient-list";
import type { BatchUnit, ConvertibleUnit, RecipeIngredientDetail } from "@bartendingapp/shared";

export interface RecipeMeasuresProps {
  ingredients: RecipeIngredientDetail[];
}

/**
 * Holds the recipe screen's unit state (spec 0035 AC-6): the single serving
 * toggle unit (oz on every mount, spec 0021 AC-4) and the batch unit, which
 * follows the toggle until the bartender picks one. The screen renders this
 * keyed by recipe id, so opening a different recipe resets both, and the
 * batch panel's part size with them.
 */
export function RecipeMeasures({ ingredients }: RecipeMeasuresProps) {
  const [toggleUnit, setToggleUnit] = useState<ConvertibleUnit>("oz");
  const [pickedBatchUnit, setPickedBatchUnit] = useState<BatchUnit | null>(null);

  return (
    <>
      <View style={styles.section}>
        <Text variant="heading">Ingredients</Text>
        <IngredientList ingredients={ingredients} unit={toggleUnit} onUnitChange={setToggleUnit} />
      </View>

      <BatchPanel
        ingredients={ingredients}
        unit={pickedBatchUnit ?? toggleUnit}
        onUnitChange={setPickedBatchUnit}
      />
    </>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: Spacing.two,
  },
});
