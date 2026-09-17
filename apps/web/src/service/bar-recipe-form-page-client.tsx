"use client";

import { useState } from "react";
import { RECOGNIZED_UNITS, type RecognizedUnit } from "@bartendingapp/shared";
import { BackButton } from "@/components/back-button";
import { Button } from "@/components/button";
import { Card } from "@/components/card";
import { Chip } from "@/components/chip";
import { EmptyState } from "@/components/empty-state";
import { Input } from "@/components/input";
import { Text } from "@/components/text";
import { useIngredientSearch } from "@/pantry/use-ingredient-search";
import { useCurrentBar } from "@/service/use-current-bar";
import { useCreateBarRecipe } from "@/service/use-bar-mutations";

const UNITS = RECOGNIZED_UNITS;

interface DraftIngredient {
  ingredientId: string;
  name: string;
  amountValue: string;
  amountUnit: RecognizedUnit;
}

function AddIngredientRow({ onAdd }: { onAdd: (ingredient: DraftIngredient) => void }) {
  const [query, setQuery] = useState("");
  const ingredientSearch = useIngredientSearch(query.trim());

  return (
    <div className="flex flex-col gap-two">
      <Input
        label="Add an ingredient"
        placeholder="Bourbon, Aperol, lemon juice..."
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      {query.trim() !== "" && (ingredientSearch.data ?? []).length > 0 && (
        <Card className="flex flex-col gap-one">
          {(ingredientSearch.data ?? []).map((ingredient) => (
            <Button
              key={ingredient.id}
              variant="secondary"
              className="w-full justify-start"
              onClick={() => {
                onAdd({
                  ingredientId: ingredient.id,
                  name: ingredient.name,
                  amountValue: "",
                  amountUnit: "oz",
                });
                setQuery("");
              }}
            >
              {ingredient.name}
            </Button>
          ))}
        </Card>
      )}
    </div>
  );
}

// House recipe creation (AC-4). base_recipe_id is left unset for MVP: the
// form always creates a standalone bar_recipe rather than offering to
// override a catalog recipe, mirroring mobile's same deferred scope (see
// spec 0023-bar-data-model.md's build plan step 6 note).
export function BarRecipeFormPageClient() {
  const currentBar = useCurrentBar();
  const barId = currentBar.currentBar?.id;
  const createBarRecipe = useCreateBarRecipe(barId ?? "");

  const [name, setName] = useState("");
  const [method, setMethod] = useState("");
  const [straining, setStraining] = useState("");
  const [glass, setGlass] = useState("");
  const [ice, setIce] = useState("");
  const [garnish, setGarnish] = useState("");
  const [ingredients, setIngredients] = useState<DraftIngredient[]>([]);

  const isOwner = barId !== undefined;
  const canSave = isOwner && name.trim() !== "" && ingredients.length > 0;

  const updateIngredient = (index: number, patch: Partial<DraftIngredient>) => {
    setIngredients((current) =>
      current.map((ingredient, i) => (i === index ? { ...ingredient, ...patch } : ingredient)),
    );
  };

  const removeIngredient = (index: number) => {
    setIngredients((current) => current.filter((_, i) => i !== index));
  };

  const handleSave = () => {
    if (!barId) {
      return;
    }

    createBarRecipe.mutate({
      barId,
      name: name.trim(),
      method: method.trim() || null,
      straining: straining.trim() || null,
      glass: glass.trim() || null,
      ice: ice.trim() || null,
      garnish: garnish.trim() || null,
      ingredients: ingredients.map((ingredient, index) => ({
        ingredientId: ingredient.ingredientId,
        amountValue: ingredient.amountValue.trim() === "" ? null : Number(ingredient.amountValue),
        amountUnit: ingredient.amountValue.trim() === "" ? null : ingredient.amountUnit,
        sortOrder: index,
      })),
    });
  };

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-four px-four py-six">
      <BackButton />
      <Text variant="display">Add house recipe</Text>

      {!isOwner ? (
        <EmptyState
          title="No bar selected"
          description="Create or select a bar first, then add a house recipe."
        />
      ) : (
        <div className="flex flex-col gap-three">
          <Input
            label="Name"
            placeholder="Paper Plane"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <Input
            label="Method (optional)"
            placeholder="Shake"
            value={method}
            onChange={(e) => setMethod(e.target.value)}
          />
          <Input
            label="Straining (optional)"
            placeholder="Double strain"
            value={straining}
            onChange={(e) => setStraining(e.target.value)}
          />
          <Input
            label="Glass (optional)"
            placeholder="Coupe"
            value={glass}
            onChange={(e) => setGlass(e.target.value)}
          />
          <Input
            label="Ice (optional)"
            placeholder="None"
            value={ice}
            onChange={(e) => setIce(e.target.value)}
          />
          <Input
            label="Garnish (optional)"
            placeholder="Lemon twist"
            value={garnish}
            onChange={(e) => setGarnish(e.target.value)}
          />

          <Text variant="subheading">Ingredients</Text>
          {ingredients.map((ingredient, index) => (
            <Card key={`${ingredient.ingredientId}-${index}`} className="flex flex-col gap-two">
              <Text variant="body" className="font-semibold">
                {ingredient.name}
              </Text>
              <Input
                label="Amount"
                inputMode="decimal"
                value={ingredient.amountValue}
                onChange={(e) => updateIngredient(index, { amountValue: e.target.value })}
                className="max-w-32"
              />
              <div className="flex flex-wrap gap-one" role="group" aria-label="Unit">
                {UNITS.map((unit) => (
                  <Chip
                    key={unit}
                    selected={ingredient.amountUnit === unit}
                    onSelectedChange={() => updateIngredient(index, { amountUnit: unit })}
                  >
                    {unit}
                  </Chip>
                ))}
              </div>
              <Button variant="secondary" onClick={() => removeIngredient(index)}>
                Remove
              </Button>
            </Card>
          ))}

          <AddIngredientRow
            onAdd={(ingredient) => setIngredients((current) => [...current, ingredient])}
          />

          <Button disabled={!canSave || createBarRecipe.isPending} onClick={handleSave}>
            {createBarRecipe.isPending ? "Saving..." : "Save house recipe"}
          </Button>
          {createBarRecipe.isError && (
            <Text variant="bodySmall" className="text-danger">
              Couldn&apos;t save that recipe. A house recipe with this name may already exist, or
              you may not be this bar&apos;s owner.
            </Text>
          )}
        </div>
      )}
    </div>
  );
}
