import { useTranslation } from "react-i18next";
import { StyleSheet, View } from "react-native";

import { Button } from "@/components/button";
import { Chip } from "@/components/chip";
import { Text } from "@/components/text";
import { Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";
import {
  CONVERTIBLE_UNITS,
  formatAmountInUnit,
  hasVolumeIngredient,
  isSupportedLocale,
  unitLabel,
  type ConvertibleUnit,
  type RecipeIngredientDetail,
} from "@bartendingapp/shared";
import { usePantry } from "@/pantry/use-pantry";
import { useAddPantryItem } from "@/pantry/use-pantry-mutations";
import { useShoppingList } from "@/shopping-list/use-shopping-list";
import { useAddShoppingListItem } from "@/shopping-list/use-shopping-list-mutations";

export interface IngredientListProps {
  ingredients: RecipeIngredientDetail[];
  /** The single serving toggle unit, held by the recipe screen so the batch panel can follow it (spec 0035 AC-6). */
  unit: ConvertibleUnit;
  onUnitChange: (unit: ConvertibleUnit) => void;
}

export function IngredientList({ ingredients, unit, onUnitChange }: IngredientListProps) {
  const theme = useTheme();
  const { i18n } = useTranslation();
  const locale = isSupportedLocale(i18n.language) ? i18n.language : "en";
  const pantry = usePantry();
  const addPantryItem = useAddPantryItem();
  const pantryIds = new Set((pantry.data ?? []).map((item) => item.ingredientId));
  const shoppingList = useShoppingList();
  const addShoppingListItem = useAddShoppingListItem();
  const shoppingListIds = new Set((shoppingList.data ?? []).map((item) => item.ingredientId));

  // A recipe written only in parts has nothing to convert, so no toggle (spec 0035 AC-4).
  const hasConvertible = hasVolumeIngredient(ingredients);

  function amountFor(ingredient: RecipeIngredientDetail): string | null {
    // oz selected and the source is already oz: show the original measure
    // text verbatim (preserves "1 1/2" exactly), never re-derived (spec 0021 AC-2).
    if (unit === "oz" && ingredient.amountUnit === "oz") {
      return ingredient.measure;
    }
    // Falls back to the already coalesced (possibly translated) measure
    // text for any unparseable or part line, unaffected by the toggle.
    const amount = formatAmountInUnit(ingredient.amountValue, ingredient.amountUnit, unit);
    return amount === null ? ingredient.measure : `${amount} ${unitLabel(unit, locale)}`;
  }

  return (
    <View style={styles.list}>
      {hasConvertible && (
        <View style={styles.unitRow} accessibilityRole="tablist">
          {CONVERTIBLE_UNITS.map((candidate) => (
            <Chip
              key={candidate}
              selected={unit === candidate}
              onSelectedChange={() => onUnitChange(candidate)}
            >
              {unitLabel(candidate, locale)}
            </Chip>
          ))}
        </View>
      )}
      {ingredients.map((ingredient) => {
        const inPantry = pantryIds.has(ingredient.ingredientId);
        const onShoppingList = shoppingListIds.has(ingredient.ingredientId);
        const amount = amountFor(ingredient);
        return (
          <View key={ingredient.ingredientId} style={styles.row}>
            <Text variant="body">
              {amount ? `${amount} ` : ""}
              {ingredient.name}
            </Text>
            {/* A staple (Ice, Water) is always on hand: no pantry or shopping list actions (spec 0036, AC-10). */}
            {!ingredient.isStaple && (
              <View style={styles.actions}>
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
                {!inPantry && (
                  <Button
                    variant="secondary"
                    disabled={onShoppingList}
                    onPress={() =>
                      addShoppingListItem.mutate({
                        ingredientId: ingredient.ingredientId,
                        name: ingredient.name,
                      })
                    }
                  >
                    {onShoppingList ? "On list" : "Add to shopping list"}
                  </Button>
                )}
              </View>
            )}
          </View>
        );
      })}
      {addPantryItem.isError && (
        <Text variant="bodySmall" style={{ color: theme.danger }}>
          Couldn&apos;t add that ingredient. Check your connection and try again.
        </Text>
      )}
      {addShoppingListItem.isError && (
        <Text variant="bodySmall" style={{ color: theme.danger }}>
          Couldn&apos;t add that ingredient to your shopping list. Check your connection and try
          again.
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
  actions: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.one,
  },
});
