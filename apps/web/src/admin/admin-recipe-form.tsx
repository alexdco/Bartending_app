"use client";

import { useState } from "react";
import {
  ADMIN_ALCOHOLIC_STATUSES,
  saveAdminRecipe,
  type AdminAlcoholicStatus,
  type AdminRecipeDetail,
  type AdminRecipeFormIngredient,
  type AdminRecipeFormTag,
  type AdminRecipeValidationError,
} from "@bartendingapp/shared";
import { useRouter } from "@/i18n/navigation";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/button";
import { Input } from "@/components/input";
import { Text } from "@/components/text";

const alcoholicStatusLabels: Record<AdminAlcoholicStatus, string> = {
  alcoholic: "Alcoholic",
  non_alcoholic: "Non alcoholic",
  optional: "Optional",
  unknown: "Unknown",
};

function errorFor(
  errors: AdminRecipeValidationError[],
  field: AdminRecipeValidationError["field"],
): string | undefined {
  const match = errors.find((error) => error.field === field);

  if (!match) return undefined;

  switch (match.reason) {
    case "required":
      return "This field is required.";
    case "too_long":
      return field === "name"
        ? "Name must be 200 characters or fewer."
        : "Instructions must be 10,000 characters or fewer.";
    case "invalid":
      return "Choose a valid alcoholic status.";
    default:
      return "Add at least one ingredient.";
  }
}

export interface AdminRecipeFormProps {
  /** Pass an existing recipe to pre fill the form for editing; omit to create. */
  existingRecipe?: AdminRecipeDetail;
}

export function AdminRecipeForm({ existingRecipe }: AdminRecipeFormProps) {
  const router = useRouter();
  const [name, setName] = useState(existingRecipe?.name ?? "");
  const [instructions, setInstructions] = useState(existingRecipe?.instructions ?? "");
  const [imageUrl, setImageUrl] = useState(existingRecipe?.imageUrl ?? "");
  const [glass, setGlass] = useState(existingRecipe?.glass ?? "");
  const [alcoholicStatus, setAlcoholicStatus] = useState<AdminAlcoholicStatus>(
    (existingRecipe?.alcoholicStatus as AdminAlcoholicStatus) ?? "unknown",
  );
  const [region, setRegion] = useState(existingRecipe?.region ?? "");
  const [ingredients, setIngredients] = useState<AdminRecipeFormIngredient[]>(
    existingRecipe?.ingredients.length ? existingRecipe.ingredients : [{ name: "", measure: "" }],
  );
  const [tags, setTags] = useState<AdminRecipeFormTag[]>(
    existingRecipe?.tags.length ? existingRecipe.tags : [{ name: "" }],
  );
  const [errors, setErrors] = useState<AdminRecipeValidationError[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setIsSaving(true);
    setSaveError(null);

    const result = await saveAdminRecipe(supabase, {
      recipeId: existingRecipe?.id ?? null,
      name,
      instructions,
      imageUrl: imageUrl || null,
      glass: glass || null,
      alcoholicStatus,
      region: region || null,
      ingredients,
      tags,
    });

    setIsSaving(false);

    if (result.error) {
      if (result.error.reason === "validation") {
        setErrors(result.error.errors);
      } else {
        setSaveError(result.error.message);
      }
      return;
    }

    setErrors([]);
    router.push("/admin/recipes");
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-four">
      <Input
        label="Name"
        value={name}
        onChange={(event) => setName(event.target.value)}
        error={errorFor(errors, "name")}
        maxLength={200}
        required
      />

      <div className="flex flex-col gap-one">
        <label htmlFor="instructions" className="text-label font-medium text-text">
          Instructions
        </label>
        <textarea
          id="instructions"
          value={instructions}
          onChange={(event) => setInstructions(event.target.value)}
          maxLength={10000}
          rows={8}
          required
          className={`rounded-small border bg-surface px-three py-two text-body text-text placeholder:text-text-muted ${
            errorFor(errors, "instructions") ? "border-danger" : "border-border"
          }`}
        />
        {errorFor(errors, "instructions") && (
          <span role="alert" className="text-body-small text-danger">
            {errorFor(errors, "instructions")}
          </span>
        )}
      </div>

      <Input
        label="Image URL"
        value={imageUrl}
        onChange={(event) => setImageUrl(event.target.value)}
      />

      <Input label="Glass" value={glass} onChange={(event) => setGlass(event.target.value)} />

      <div className="flex flex-col gap-one">
        <label htmlFor="alcoholicStatus" className="text-label font-medium text-text">
          Alcoholic status
        </label>
        <select
          id="alcoholicStatus"
          value={alcoholicStatus}
          onChange={(event) => setAlcoholicStatus(event.target.value as AdminAlcoholicStatus)}
          className={`rounded-small border bg-surface px-three py-two text-body text-text ${
            errorFor(errors, "alcoholicStatus") ? "border-danger" : "border-border"
          }`}
        >
          {ADMIN_ALCOHOLIC_STATUSES.map((status) => (
            <option key={status} value={status}>
              {alcoholicStatusLabels[status]}
            </option>
          ))}
        </select>
        {errorFor(errors, "alcoholicStatus") && (
          <span role="alert" className="text-body-small text-danger">
            {errorFor(errors, "alcoholicStatus")}
          </span>
        )}
      </div>

      <Input label="Region" value={region} onChange={(event) => setRegion(event.target.value)} />

      <div className="flex flex-col gap-two">
        <Text variant="label">Ingredients</Text>
        {errorFor(errors, "ingredients") && (
          <span role="alert" className="text-body-small text-danger">
            {errorFor(errors, "ingredients")}
          </span>
        )}
        {ingredients.map((ingredient, index) => (
          <div key={index} className="flex gap-two">
            <Input
              label="Ingredient name"
              value={ingredient.name}
              onChange={(event) => {
                const next = [...ingredients];
                next[index] = { ...next[index], name: event.target.value };
                setIngredients(next);
              }}
              className="flex-1"
            />
            <Input
              label="Measure"
              value={ingredient.measure ?? ""}
              onChange={(event) => {
                const next = [...ingredients];
                next[index] = { ...next[index], measure: event.target.value };
                setIngredients(next);
              }}
              className="flex-1"
            />
            <Button
              type="button"
              variant="secondary"
              onClick={() => setIngredients(ingredients.filter((_, i) => i !== index))}
              disabled={ingredients.length === 1}
            >
              Remove
            </Button>
          </div>
        ))}
        <Button
          type="button"
          variant="secondary"
          onClick={() => setIngredients([...ingredients, { name: "", measure: "" }])}
          className="self-start"
        >
          Add ingredient
        </Button>
      </div>

      <div className="flex flex-col gap-two">
        <Text variant="label">Tags</Text>
        {tags.map((tag, index) => (
          <div key={index} className="flex gap-two">
            <Input
              label="Tag name"
              value={tag.name}
              onChange={(event) => {
                const next = [...tags];
                next[index] = { name: event.target.value };
                setTags(next);
              }}
              className="flex-1"
            />
            <Button
              type="button"
              variant="secondary"
              onClick={() => setTags(tags.filter((_, i) => i !== index))}
            >
              Remove
            </Button>
          </div>
        ))}
        <Button
          type="button"
          variant="secondary"
          onClick={() => setTags([...tags, { name: "" }])}
          className="self-start"
        >
          Add tag
        </Button>
      </div>

      {saveError && (
        <Text variant="bodySmall" className="text-danger">
          {saveError}
        </Text>
      )}

      <Button type="submit" disabled={isSaving}>
        {isSaving ? "Saving..." : "Save recipe"}
      </Button>
    </form>
  );
}
