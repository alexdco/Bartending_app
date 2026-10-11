"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
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
  const t = useTranslations("service");
  const [query, setQuery] = useState("");
  const ingredientSearch = useIngredientSearch(query.trim());

  return (
    <div className="flex flex-col gap-two">
      <Input
        label={t("addIngredient")}
        placeholder={t("addIngredientPlaceholder")}
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
  const t = useTranslations("service");
  const tCommon = useTranslations("common");
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
      <Text variant="display">{t("addHouseRecipe")}</Text>

      {!isOwner ? (
        <EmptyState title={t("noBarSelected")} description={t("noBarForRecipeDescription")} />
      ) : (
        <div className="flex flex-col gap-three">
          <Input
            label={t("recipeName")}
            placeholder={t("recipeNamePlaceholder")}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <Input
            label={t("methodOptional")}
            placeholder={t("methodPlaceholder")}
            value={method}
            onChange={(e) => setMethod(e.target.value)}
          />
          <Input
            label={t("strainingOptional")}
            placeholder={t("strainingPlaceholder")}
            value={straining}
            onChange={(e) => setStraining(e.target.value)}
          />
          <Input
            label={t("glassOptional")}
            placeholder={t("glassPlaceholder")}
            value={glass}
            onChange={(e) => setGlass(e.target.value)}
          />
          <Input
            label={t("iceOptional")}
            placeholder={t("icePlaceholder")}
            value={ice}
            onChange={(e) => setIce(e.target.value)}
          />
          <Input
            label={t("garnishOptional")}
            placeholder={t("garnishPlaceholder")}
            value={garnish}
            onChange={(e) => setGarnish(e.target.value)}
          />

          <Text variant="subheading">{t("ingredients")}</Text>
          {ingredients.map((ingredient, index) => (
            <Card key={`${ingredient.ingredientId}-${index}`} className="flex flex-col gap-two">
              <Text variant="body" className="font-semibold">
                {ingredient.name}
              </Text>
              <Input
                label={t("amount")}
                inputMode="decimal"
                value={ingredient.amountValue}
                onChange={(e) => updateIngredient(index, { amountValue: e.target.value })}
                className="max-w-32"
              />
              <div className="flex flex-wrap gap-one" role="group" aria-label={t("unit")}>
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
                {tCommon("remove")}
              </Button>
            </Card>
          ))}

          <AddIngredientRow
            onAdd={(ingredient) => setIngredients((current) => [...current, ingredient])}
          />

          <Button disabled={!canSave || createBarRecipe.isPending} onClick={handleSave}>
            {createBarRecipe.isPending ? t("saving") : t("saveHouseRecipe")}
          </Button>
          {createBarRecipe.isError && (
            <Text variant="bodySmall" className="text-danger">
              {t("saveHouseRecipeFailed")}
            </Text>
          )}
        </div>
      )}
    </div>
  );
}
