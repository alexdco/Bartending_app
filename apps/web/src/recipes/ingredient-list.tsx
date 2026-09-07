"use client";

import { Button } from "@/components/button";
import { Text } from "@/components/text";
import type { RecipeIngredientDetail } from "@bartendingapp/shared";
import { usePantry } from "@/pantry/use-pantry";
import { useAddPantryItem } from "@/pantry/use-pantry-mutations";

export interface IngredientListProps {
  ingredients: RecipeIngredientDetail[];
}

export function IngredientList({ ingredients }: IngredientListProps) {
  const pantry = usePantry();
  const addPantryItem = useAddPantryItem();
  const pantryIds = new Set((pantry.data ?? []).map((item) => item.ingredientId));

  return (
    <ul className="flex flex-col gap-one">
      {ingredients.map((ingredient) => {
        const inPantry = pantryIds.has(ingredient.ingredientId);
        return (
          <li key={ingredient.ingredientId} className="flex items-center justify-between gap-two">
            <Text variant="body">
              {ingredient.measure ? `${ingredient.measure} ` : ""}
              {ingredient.name}
            </Text>
            <Button
              variant="secondary"
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
  );
}
