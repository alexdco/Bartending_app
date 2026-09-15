import { useState } from "react";
import { useTranslation } from "react-i18next";
import { StyleSheet, View } from "react-native";

import { Button } from "@/components/button";
import { Chip } from "@/components/chip";
import { Text } from "@/components/text";
import { Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";
import {
  CONVERTIBLE_UNITS,
  convertAmount,
  formatConvertedAmount,
  isSupportedLocale,
  unitLabel,
  type ConvertibleUnit,
  type RecipeIngredientDetail,
} from "@bartendingapp/shared";
import { usePantry } from "@/pantry/use-pantry";
import { useAddPantryItem } from "@/pantry/use-pantry-mutations";

export interface IngredientListProps {
  ingredients: RecipeIngredientDetail[];
}

export function IngredientList({ ingredients }: IngredientListProps) {
  const theme = useTheme();
  const { i18n } = useTranslation();
  const locale = isSupportedLocale(i18n.language) ? i18n.language : "en";
  const pantry = usePantry();
  const addPantryItem = useAddPantryItem();
  const pantryIds = new Set((pantry.data ?? []).map((item) => item.ingredientId));

  // Defaults to oz on every mount, no persistence across visits or recipes (AC-4).
  const [unit, setUnit] = useState<ConvertibleUnit>("oz");
  const hasConvertible = ingredients.some(
    (ingredient) => ingredient.amountValue !== null && ingredient.amountUnit !== null,
  );

  function amountFor(ingredient: RecipeIngredientDetail): string | null {
    if (ingredient.amountValue === null || ingredient.amountUnit === null) {
      // Falls back to the already coalesced (possibly translated) measure
      // text for any unparseable line, unaffected by the toggle (AC-3).
      return ingredient.measure;
    }
    // oz selected and the source is already oz: show the original measure
    // text verbatim (preserves "1 1/2" exactly), never re-derived (AC-2).
    if (unit === "oz" && ingredient.amountUnit === "oz") {
      return ingredient.measure;
    }
    const converted = convertAmount(ingredient.amountValue, ingredient.amountUnit, unit);
    return `${formatConvertedAmount(converted, unit)} ${unitLabel(unit, locale)}`;
  }

  return (
    <View style={styles.list}>
      {hasConvertible && (
        <View style={styles.unitRow} accessibilityRole="tablist">
          {CONVERTIBLE_UNITS.map((candidate) => (
            <Chip
              key={candidate}
              selected={unit === candidate}
              onSelectedChange={() => setUnit(candidate)}
            >
              {unitLabel(candidate, locale)}
            </Chip>
          ))}
        </View>
      )}
      {ingredients.map((ingredient) => {
        const inPantry = pantryIds.has(ingredient.ingredientId);
        const amount = amountFor(ingredient);
        return (
          <View key={ingredient.ingredientId} style={styles.row}>
            <Text variant="body">
              {amount ? `${amount} ` : ""}
              {ingredient.name}
            </Text>
            <Button
              variant={inPantry ? "secondary" : "primary"}
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
  unitRow: {
    flexDirection: "row",
    gap: Spacing.one,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
});
