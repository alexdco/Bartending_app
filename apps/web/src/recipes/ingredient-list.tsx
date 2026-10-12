"use client";

import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/button";
import { Chip } from "@/components/chip";
import { Text } from "@/components/text";
import {
  CONVERTIBLE_UNITS,
  formatAmountInUnit,
  hasVolumeIngredient,
  unitLabel,
  type ConvertibleUnit,
  type Locale,
  type RecipeIngredientDetail,
} from "@bartendingapp/shared";
import { usePantry } from "@/pantry/use-pantry";
import { useAddPantryItem } from "@/pantry/use-pantry-mutations";
import { useShoppingList } from "@/shopping-list/use-shopping-list";
import { useAddShoppingListItem } from "@/shopping-list/use-shopping-list-mutations";

export interface IngredientListProps {
  ingredients: RecipeIngredientDetail[];
  /** The single serving toggle unit, held by the recipe page so the batch panel can follow it (spec 0035 AC-6). */
  unit: ConvertibleUnit;
  onUnitChange: (unit: ConvertibleUnit) => void;
}

function displayAmount(
  ingredient: RecipeIngredientDetail,
  unit: ConvertibleUnit,
  locale: Locale,
): string | null {
  // oz selected and the source is already oz: show the original measure text
  // verbatim (preserves "1 1/2" exactly), never re-derived (spec 0021 AC-2).
  if (unit === "oz" && ingredient.amountUnit === "oz") {
    return ingredient.measure;
  }
  // Null for an unparsed or part line, which then shows its measure text (spec 0035 AC-4).
  const amount = formatAmountInUnit(ingredient.amountValue, ingredient.amountUnit, unit);
  return amount === null ? null : `${amount} ${unitLabel(unit, locale)}`;
}

export function IngredientList({ ingredients, unit, onUnitChange }: IngredientListProps) {
  const t = useTranslations("recipe");
  const locale = useLocale() as Locale;
  const pantry = usePantry();
  const addPantryItem = useAddPantryItem();
  const pantryIds = new Set((pantry.data ?? []).map((item) => item.ingredientId));
  const shoppingList = useShoppingList();
  const addShoppingListItem = useAddShoppingListItem();
  const shoppingListIds = new Set((shoppingList.data ?? []).map((item) => item.ingredientId));

  // A recipe written only in parts has nothing to convert, so no toggle (spec 0035 AC-4).
  const hasConvertible = hasVolumeIngredient(ingredients);

  return (
    <div className="flex flex-col gap-two">
      {hasConvertible && (
        <div className="flex gap-one" role="group" aria-label={t("unit")}>
          {CONVERTIBLE_UNITS.map((candidate) => (
            <Chip
              key={candidate}
              selected={unit === candidate}
              onSelectedChange={() => onUnitChange(candidate)}
            >
              {unitLabel(candidate, locale)}
            </Chip>
          ))}
        </div>
      )}
      <ul className="flex flex-col gap-one">
        {ingredients.map((ingredient) => {
          const inPantry = pantryIds.has(ingredient.ingredientId);
          const onShoppingList = shoppingListIds.has(ingredient.ingredientId);
          // Falls back to the already coalesced (possibly translated) measure
          // text for any unparseable or part line, unaffected by the toggle.
          const amount = displayAmount(ingredient, unit, locale) ?? ingredient.measure;
          return (
            <li key={ingredient.ingredientId} className="flex items-center justify-between gap-two">
              <Text variant="body">
                {amount ? `${amount} ` : ""}
                {ingredient.name}
              </Text>
              <div className="flex items-center gap-two">
                <Button
                  variant={inPantry ? "secondary" : "primary"}
                  disabled={inPantry}
                  onClick={() =>
                    addPantryItem.mutate({
                      ingredientId: ingredient.ingredientId,
                      name: ingredient.name,
                    })
                  }
                >
                  {inPantry ? t("inPantry") : t("addToPantry")}
                </Button>
                {!inPantry && (
                  <Button
                    variant="secondary"
                    disabled={onShoppingList}
                    onClick={() =>
                      addShoppingListItem.mutate({
                        ingredientId: ingredient.ingredientId,
                        name: ingredient.name,
                      })
                    }
                  >
                    {onShoppingList ? t("onList") : t("addToShoppingList")}
                  </Button>
                )}
              </div>
            </li>
          );
        })}
        {addPantryItem.isError && (
          <Text variant="bodySmall" className="text-danger" role="alert">
            {t("addPantryFailed")}
          </Text>
        )}
        {addShoppingListItem.isError && (
          <Text variant="bodySmall" className="text-danger" role="alert">
            {t("addShoppingListFailed")}
          </Text>
        )}
      </ul>
    </div>
  );
}
