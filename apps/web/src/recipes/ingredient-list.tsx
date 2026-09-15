"use client";

import { useState } from "react";
import { useLocale } from "next-intl";
import { Button } from "@/components/button";
import { Chip } from "@/components/chip";
import { Text } from "@/components/text";
import {
  CONVERTIBLE_UNITS,
  convertAmount,
  formatConvertedAmount,
  unitLabel,
  type ConvertibleUnit,
  type Locale,
  type RecipeIngredientDetail,
} from "@bartendingapp/shared";
import { usePantry } from "@/pantry/use-pantry";
import { useAddPantryItem } from "@/pantry/use-pantry-mutations";

export interface IngredientListProps {
  ingredients: RecipeIngredientDetail[];
}

function displayAmount(
  ingredient: RecipeIngredientDetail,
  unit: ConvertibleUnit,
  locale: Locale,
): string | null {
  if (ingredient.amountValue === null || ingredient.amountUnit === null) {
    return null;
  }
  // oz selected and the source is already oz: show the original measure text
  // verbatim (preserves "1 1/2" exactly), never re-derived (AC-2).
  if (unit === "oz" && ingredient.amountUnit === "oz") {
    return ingredient.measure;
  }
  const converted = convertAmount(ingredient.amountValue, ingredient.amountUnit, unit);
  return `${formatConvertedAmount(converted, unit)} ${unitLabel(unit, locale)}`;
}

export function IngredientList({ ingredients }: IngredientListProps) {
  const locale = useLocale() as Locale;
  const pantry = usePantry();
  const addPantryItem = useAddPantryItem();
  const pantryIds = new Set((pantry.data ?? []).map((item) => item.ingredientId));

  // Defaults to oz on every mount, no persistence across visits or recipes (AC-4).
  const [unit, setUnit] = useState<ConvertibleUnit>("oz");
  const hasConvertible = ingredients.some(
    (ingredient) => ingredient.amountValue !== null && ingredient.amountUnit !== null,
  );

  return (
    <div className="flex flex-col gap-two">
      {hasConvertible && (
        <div className="flex gap-one" role="group" aria-label="Unit">
          {CONVERTIBLE_UNITS.map((candidate) => (
            <Chip
              key={candidate}
              selected={unit === candidate}
              onSelectedChange={() => setUnit(candidate)}
            >
              {unitLabel(candidate, locale)}
            </Chip>
          ))}
        </div>
      )}
      <ul className="flex flex-col gap-one">
        {ingredients.map((ingredient) => {
          const inPantry = pantryIds.has(ingredient.ingredientId);
          // Falls back to the already coalesced (possibly translated) measure
          // text for any unparseable line, unaffected by the toggle (AC-3).
          const amount = displayAmount(ingredient, unit, locale) ?? ingredient.measure;
          return (
            <li key={ingredient.ingredientId} className="flex items-center justify-between gap-two">
              <Text variant="body">
                {amount ? `${amount} ` : ""}
                {ingredient.name}
              </Text>
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
                {inPantry ? "In pantry" : "Add to pantry"}
              </Button>
            </li>
          );
        })}
        {addPantryItem.isError && (
          <Text variant="bodySmall" className="text-danger" role="alert">
            Couldn&apos;t add that ingredient. Check your connection and try again.
          </Text>
        )}
      </ul>
    </div>
  );
}
