"use client";

import { useState, type ReactNode } from "react";
import { Text } from "@/components/text";
import type { BatchUnit, ConvertibleUnit, RecipeIngredientDetail } from "@bartendingapp/shared";
import { BatchPanel } from "@/recipes/batch-panel";
import { IngredientList } from "@/recipes/ingredient-list";

export interface RecipeMeasuresProps {
  ingredients: RecipeIngredientDetail[];
  ingredientsHeading: string;
  /** Rendered between the ingredient list and the batch panel, as the page lays them out. */
  instructions: ReactNode;
}

/**
 * Holds the recipe page's unit state (spec 0035 AC-6): the single serving
 * toggle unit (oz on every mount, spec 0021 AC-4) and the batch unit, which
 * follows the toggle until the bartender picks one. The page renders this
 * keyed by recipe id, so opening a different recipe resets both, and the
 * batch panel's part size with them.
 */
export function RecipeMeasures({
  ingredients,
  ingredientsHeading,
  instructions,
}: RecipeMeasuresProps) {
  const [toggleUnit, setToggleUnit] = useState<ConvertibleUnit>("oz");
  const [pickedBatchUnit, setPickedBatchUnit] = useState<BatchUnit | null>(null);

  return (
    <>
      <section className="flex flex-col gap-two">
        <Text variant="heading" as="h2">
          {ingredientsHeading}
        </Text>
        <IngredientList ingredients={ingredients} unit={toggleUnit} onUnitChange={setToggleUnit} />
      </section>

      {instructions}

      <BatchPanel
        ingredients={ingredients}
        unit={pickedBatchUnit ?? toggleUnit}
        onUnitChange={setPickedBatchUnit}
      />
    </>
  );
}
