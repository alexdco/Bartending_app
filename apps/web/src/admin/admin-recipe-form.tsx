"use client";

import { useId, useState } from "react";
import { useTranslations } from "next-intl";
import {
  ADMIN_ALCOHOLIC_STATUSES,
  saveAdminRecipe,
  setRecipeImage,
  splitIngredientLines,
  splitNameList,
  uploadRecipeImage,
  type AdminAlcoholicStatus,
  type AdminRecipeDetail,
  type AdminRecipeFormIngredient,
  type AdminRecipeFormTag,
  type AdminRecipeValidationError,
  type SetRecipeImageError,
  type UploadRecipeImageError,
} from "@bartendingapp/shared";
import { useRouter } from "@/i18n/navigation";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/button";
import { Input } from "@/components/input";
import { Text } from "@/components/text";
import { alcoholicStatusKey } from "@/recipes/format";
import {
  useAdminFlavorNames,
  useAdminGlassNames,
  useAdminIngredientSuggestions,
  useAdminTagNames,
} from "./use-admin-recipe-suggestions";
import { RecipeImageField, type RecipeImageChange } from "./recipe-image-field";

type AdminTranslator = ReturnType<typeof useTranslations<"admin">>;

function errorFor(
  t: AdminTranslator,
  errors: AdminRecipeValidationError[],
  field: AdminRecipeValidationError["field"],
): string | undefined {
  const match = errors.find((error) => error.field === field);

  if (!match) return undefined;

  switch (match.reason) {
    case "required":
      return t("errorRequired");
    case "too_long":
      return field === "name" ? t("errorNameTooLong") : t("errorInstructionsTooLong");
    case "invalid":
      return t("errorInvalidStatus");
    default:
      return t("errorNoIngredients");
  }
}

function uploadErrorMessage(
  t: AdminTranslator,
  reason: Exclude<UploadRecipeImageError["reason"], "request_failed">,
): string {
  switch (reason) {
    case "forbidden":
      return t("imageErrorNotAdmin");
    case "too_large":
      return t("imageErrorEncodedTooLarge");
    case "wrong_type":
      return t("imageErrorWebpUnsupported");
  }
}

function setErrorMessage(
  t: AdminTranslator,
  reason: Exclude<SetRecipeImageError["reason"], "request_failed">,
): string {
  switch (reason) {
    case "not admin":
      return t("imageErrorNotAdmin");
    case "recipe not found":
      return t("imageErrorRecipeNotFound");
    case "invalid image url":
    case "image files missing":
      return t("imageErrorFilesMissing");
  }
}

function flavorKey(flavors: readonly AdminRecipeFormTag[]): string {
  const names = flavors.map((f) => f.name.trim().toLowerCase()).filter((n) => n.length > 0);
  return [...new Set(names)].sort().join("|");
}

function sameFlavorNames(
  a: readonly AdminRecipeFormTag[],
  b: readonly AdminRecipeFormTag[],
): boolean {
  return flavorKey(a) === flavorKey(b);
}

export interface AdminRecipeFormProps {
  /** Pass an existing recipe to pre fill the form for editing; omit to create. */
  existingRecipe?: AdminRecipeDetail;
}

export function AdminRecipeForm({ existingRecipe }: AdminRecipeFormProps) {
  const t = useTranslations("admin");
  const tCommon = useTranslations("common");
  const tStatus = useTranslations("alcoholicStatus");
  const router = useRouter();
  const [name, setName] = useState(existingRecipe?.name ?? "");
  const [instructions, setInstructions] = useState(existingRecipe?.instructions ?? "");
  const [imageChange, setImageChange] = useState<RecipeImageChange>({ kind: "keep" });
  // A new recipe whose details saved but whose image did not: a retry saves
  // into this id instead of creating a second recipe.
  const [savedRecipeId, setSavedRecipeId] = useState<string | null>(null);
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
  const [flavorProfile, setFlavorProfile] = useState<AdminRecipeFormTag[]>(
    existingRecipe?.flavorProfile.length ? existingRecipe.flavorProfile : [{ name: "" }],
  );
  const [errors, setErrors] = useState<AdminRecipeValidationError[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [activeIngredientIndex, setActiveIngredientIndex] = useState<number | null>(null);

  const ingredientListId = useId();
  const glassListId = useId();
  const tagListId = useId();
  const flavorListId = useId();
  const activeIngredientQuery =
    activeIngredientIndex === null ? "" : (ingredients[activeIngredientIndex]?.name ?? "");
  const { data: ingredientSuggestions = [] } = useAdminIngredientSuggestions(activeIngredientQuery);
  const { data: glassNames = [] } = useAdminGlassNames();
  const { data: tagNames = [] } = useAdminTagNames();
  const { data: flavorNames = [] } = useAdminFlavorNames();

  /**
   * Pasting a list ("½ oz RumChata" per line) fills one row per line,
   * replacing the row pasted into. A single line fills that row's name and
   * measure only when it has both; anything else pastes as plain text.
   */
  function handleIngredientPaste(index: number, event: React.ClipboardEvent<HTMLInputElement>) {
    const lines = splitIngredientLines(event.clipboardData.getData("text"));
    const fillsRows =
      lines.length > 1 ||
      (lines.length === 1 && lines[0].measure !== null && lines[0].name.length > 0);

    if (!fillsRows) return;

    event.preventDefault();
    const pasted = lines.map((line) => ({ name: line.name, measure: line.measure ?? "" }));
    setIngredients((current) => [
      ...current.slice(0, index),
      ...pasted,
      ...current.slice(index + 1),
    ]);
  }

  /**
   * Pasting a list of names (one per line or comma separated) into a tag or
   * flavor field fills one row per name, replacing the row pasted into. A
   * single name pastes as plain text.
   */
  function handleNameListPaste(
    rows: AdminRecipeFormTag[],
    setRows: (next: AdminRecipeFormTag[]) => void,
    index: number,
    event: React.ClipboardEvent<HTMLInputElement>,
  ) {
    const names = splitNameList(event.clipboardData.getData("text"));

    if (names.length < 2) return;

    event.preventDefault();
    setRows([
      ...rows.slice(0, index),
      ...names.map((name) => ({ name })),
      ...rows.slice(index + 1),
    ]);
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setIsSaving(true);
    setSaveError(null);

    const result = await saveAdminRecipe(supabase, {
      recipeId: existingRecipe?.id ?? savedRecipeId,
      name,
      instructions,
      glass: glass || null,
      alcoholicStatus,
      region: region || null,
      ingredients,
      tags,
      // Unchanged means "leave it to the classifier": null doesn't replace or
      // lock the recipe's flavor profile.
      flavorProfile: sameFlavorNames(flavorProfile, existingRecipe?.flavorProfile ?? [])
        ? null
        : flavorProfile,
    });

    if (result.error) {
      setIsSaving(false);
      if (result.error.reason === "validation") {
        setErrors(result.error.errors);
      } else {
        setSaveError(result.error.message);
      }
      return;
    }

    setErrors([]);
    setSavedRecipeId(result.data.id);

    // The storage path needs the recipe id, so the image goes up only after
    // the details save (spec 0041).
    const imageError = await saveImage(result.data.id);
    setIsSaving(false);

    if (imageError) {
      setSaveError(t("imageSaveFailed", { message: imageError }));
      return;
    }

    router.push("/admin/recipes");
  }

  /** Applies the image change to a saved recipe; returns an error message or null. */
  async function saveImage(recipeId: string): Promise<string | null> {
    if (imageChange.kind === "keep") return null;

    let heroUrl: string | null = null;

    if (imageChange.kind === "replace") {
      const upload = await uploadRecipeImage(supabase, recipeId, imageChange.image);

      if (upload.error) {
        return upload.error.reason === "request_failed"
          ? upload.error.message
          : uploadErrorMessage(t, upload.error.reason);
      }

      heroUrl = upload.data.heroUrl;
    }

    const set = await setRecipeImage(supabase, recipeId, heroUrl);

    if (set.error) {
      return set.error.reason === "request_failed"
        ? set.error.message
        : setErrorMessage(t, set.error.reason);
    }

    setImageChange({ kind: "keep" });
    return null;
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-four">
      <Input
        label={t("name")}
        value={name}
        onChange={(event) => setName(event.target.value)}
        error={errorFor(t, errors, "name")}
        maxLength={200}
        required
      />

      <div className="flex flex-col gap-one">
        <label htmlFor="instructions" className="text-label font-medium text-text">
          {t("instructions")}
        </label>
        <textarea
          id="instructions"
          value={instructions}
          onChange={(event) => setInstructions(event.target.value)}
          maxLength={10000}
          rows={8}
          required
          className={`rounded-small border bg-surface px-three py-two text-body text-text placeholder:text-text-muted ${
            errorFor(t, errors, "instructions") ? "border-danger" : "border-border"
          }`}
        />
        {errorFor(t, errors, "instructions") && (
          <span role="alert" className="text-body-small text-danger">
            {errorFor(t, errors, "instructions")}
          </span>
        )}
      </div>

      <RecipeImageField
        currentUrl={existingRecipe?.imageUrl ?? null}
        change={imageChange}
        onChange={setImageChange}
        disabled={isSaving}
      />

      <Input
        label={t("glass")}
        value={glass}
        onChange={(event) => setGlass(event.target.value)}
        list={glassListId}
        autoComplete="off"
      />
      <datalist id={glassListId}>
        {glassNames.map((glassName) => (
          <option key={glassName} value={glassName} />
        ))}
      </datalist>

      <div className="flex flex-col gap-one">
        <label htmlFor="alcoholicStatus" className="text-label font-medium text-text">
          {t("alcoholicStatus")}
        </label>
        <select
          id="alcoholicStatus"
          value={alcoholicStatus}
          onChange={(event) => setAlcoholicStatus(event.target.value as AdminAlcoholicStatus)}
          className={`rounded-small border bg-surface px-three py-two text-body text-text ${
            errorFor(t, errors, "alcoholicStatus") ? "border-danger" : "border-border"
          }`}
        >
          {ADMIN_ALCOHOLIC_STATUSES.map((status) => (
            <option key={status} value={status}>
              {tStatus(alcoholicStatusKey(status))}
            </option>
          ))}
        </select>
        {errorFor(t, errors, "alcoholicStatus") && (
          <span role="alert" className="text-body-small text-danger">
            {errorFor(t, errors, "alcoholicStatus")}
          </span>
        )}
      </div>

      <Input
        label={t("region")}
        value={region}
        onChange={(event) => setRegion(event.target.value)}
      />

      <div className="flex flex-col gap-two">
        <Text variant="label">{t("ingredients")}</Text>
        <Text variant="bodySmall" muted>
          {t("ingredientsPasteHint")}
        </Text>
        {errorFor(t, errors, "ingredients") && (
          <span role="alert" className="text-body-small text-danger">
            {errorFor(t, errors, "ingredients")}
          </span>
        )}
        {ingredients.map((ingredient, index) => (
          <div key={index} className="flex gap-two">
            <Input
              label={t("ingredientName")}
              value={ingredient.name}
              list={ingredientListId}
              autoComplete="off"
              onFocus={() => setActiveIngredientIndex(index)}
              onPaste={(event) => handleIngredientPaste(index, event)}
              onChange={(event) => {
                const next = [...ingredients];
                next[index] = { ...next[index], name: event.target.value };
                setIngredients(next);
              }}
              className="flex-1"
            />
            <Input
              label={t("measure")}
              value={ingredient.measure ?? ""}
              onPaste={(event) => handleIngredientPaste(index, event)}
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
              {tCommon("remove")}
            </Button>
          </div>
        ))}
        <datalist id={ingredientListId}>
          {ingredientSuggestions.map((suggestion) => (
            <option key={suggestion.id} value={suggestion.name} />
          ))}
        </datalist>
        <Button
          type="button"
          variant="secondary"
          onClick={() => setIngredients([...ingredients, { name: "", measure: "" }])}
          className="self-start"
        >
          {t("addIngredient")}
        </Button>
      </div>

      <div className="flex flex-col gap-two">
        <Text variant="label">{t("flavorProfile")}</Text>
        <Text variant="bodySmall" muted>
          {t("flavorProfileHint")}
        </Text>
        {flavorProfile.map((flavor, index) => (
          <div key={index} className="flex gap-two">
            <Input
              label={t("flavorName")}
              value={flavor.name}
              list={flavorListId}
              onPaste={(event) =>
                handleNameListPaste(flavorProfile, setFlavorProfile, index, event)
              }
              autoComplete="off"
              onChange={(event) => {
                const next = [...flavorProfile];
                next[index] = { name: event.target.value };
                setFlavorProfile(next);
              }}
              className="flex-1"
            />
            <Button
              type="button"
              variant="secondary"
              onClick={() => setFlavorProfile(flavorProfile.filter((_, i) => i !== index))}
            >
              {tCommon("remove")}
            </Button>
          </div>
        ))}
        <datalist id={flavorListId}>
          {flavorNames.map((flavorName) => (
            <option key={flavorName} value={flavorName} />
          ))}
        </datalist>
        <Button
          type="button"
          variant="secondary"
          onClick={() => setFlavorProfile([...flavorProfile, { name: "" }])}
          className="self-start"
        >
          {t("addFlavor")}
        </Button>
      </div>

      <div className="flex flex-col gap-two">
        <Text variant="label">{t("tags")}</Text>
        <Text variant="bodySmall" muted>
          {t("namesPasteHint")}
        </Text>
        {tags.map((tag, index) => (
          <div key={index} className="flex gap-two">
            <Input
              label={t("tagName")}
              value={tag.name}
              list={tagListId}
              onPaste={(event) => handleNameListPaste(tags, setTags, index, event)}
              autoComplete="off"
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
              {tCommon("remove")}
            </Button>
          </div>
        ))}
        <datalist id={tagListId}>
          {tagNames.map((tagName) => (
            <option key={tagName} value={tagName} />
          ))}
        </datalist>
        <Button
          type="button"
          variant="secondary"
          onClick={() => setTags([...tags, { name: "" }])}
          className="self-start"
        >
          {t("addTag")}
        </Button>
      </div>

      {saveError && (
        <Text variant="bodySmall" className="text-danger">
          {saveError}
        </Text>
      )}

      <Button type="submit" disabled={isSaving}>
        {isSaving ? t("saving") : t("saveRecipe")}
      </Button>
    </form>
  );
}
