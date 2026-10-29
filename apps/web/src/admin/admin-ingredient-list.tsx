"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import {
  ADMIN_INGREDIENTS_PAGE_SIZE,
  ALLERGENS,
  canSaveSelection,
  selectionFromAllergens,
  toggleAllergen,
  toggleNone,
  type AdminIngredient,
} from "@bartendingapp/shared";
import { Button } from "@/components/button";
import { EmptyState } from "@/components/empty-state";
import { Input } from "@/components/input";
import { Spinner } from "@/components/spinner";
import { Text } from "@/components/text";
import { useAdminIngredients, useSetIngredientAllergens } from "./use-admin-ingredients";

/** Ingredient allergen editor (spec 0043 AC-11): search, "not reviewed" filter, pages of 50. */
export function AdminIngredientList() {
  const t = useTranslations("admin");
  const [query, setQuery] = useState("");
  const [notReviewedOnly, setNotReviewedOnly] = useState(false);
  const [page, setPage] = useState(0);
  const { data, error, isPending, isPlaceholderData } = useAdminIngredients(
    query,
    notReviewedOnly,
    page,
  );

  const total = data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / ADMIN_INGREDIENTS_PAGE_SIZE));

  return (
    <div className="flex flex-col gap-four">
      <div className="flex flex-wrap items-end gap-four">
        <Input
          label={t("searchIngredients")}
          placeholder={t("searchByName")}
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setPage(0);
          }}
          className="max-w-sm"
        />
        <label className="flex items-center gap-two py-two text-label text-text">
          <input
            type="checkbox"
            checked={notReviewedOnly}
            onChange={(event) => {
              setNotReviewedOnly(event.target.checked);
              setPage(0);
            }}
          />
          {t("notReviewedOnly")}
        </label>
      </div>

      {error ? (
        <Text variant="bodySmall" muted>
          {t("loadIngredientsFailed")}
        </Text>
      ) : isPending ? (
        <div className="flex justify-center py-four">
          <Spinner label={t("loadingIngredients")} />
        </div>
      ) : data.ingredients.length === 0 ? (
        <EmptyState title={t("noIngredients")} />
      ) : (
        <div className="flex flex-col gap-three">
          <Text variant="bodySmall" muted>
            {t("ingredientCount", { count: total })}
          </Text>
          <ul className={`flex flex-col gap-three ${isPlaceholderData ? "opacity-60" : ""}`}>
            {data.ingredients.map((ingredient) => (
              // Keyed by the stored list too, so fresh data resets the row's state.
              <li key={`${ingredient.id}:${ingredient.allergens?.join(",") ?? "null"}`}>
                <AdminIngredientRow ingredient={ingredient} />
              </li>
            ))}
          </ul>
          <div className="flex items-center justify-center gap-three">
            <Button
              variant="secondary"
              onClick={() => setPage((current) => current - 1)}
              disabled={page === 0}
            >
              {t("previousPage")}
            </Button>
            <Text variant="bodySmall" muted>
              {t("pageOf", { page: page + 1, pages })}
            </Text>
            <Button
              variant="secondary"
              onClick={() => setPage((current) => current + 1)}
              disabled={page + 1 >= pages}
            >
              {t("nextPage")}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function AdminIngredientRow({ ingredient }: { ingredient: AdminIngredient }) {
  const t = useTranslations("admin");
  const tRecipe = useTranslations("recipe");
  const [selection, setSelection] = useState(() => selectionFromAllergens(ingredient.allergens));
  const [isDirty, setIsDirty] = useState(false);
  const save = useSetIngredientAllergens(ingredient.id);

  const result = save.data;
  const status = save.isPending
    ? t("savingAllergens")
    : result?.error
      ? t("saveAllergensFailed", { message: result.error.message })
      : result && !isDirty
        ? t("savedAllergens")
        : null;

  function update(next: typeof selection) {
    setSelection(next);
    setIsDirty(true);
  }

  return (
    <fieldset className="flex flex-col gap-two rounded-medium border border-border p-three">
      <legend className="sr-only">{t("allergensFor", { name: ingredient.name })}</legend>
      <div className="flex items-center gap-two">
        <Text variant="label">{ingredient.name}</Text>
        {ingredient.allergens === null && !result?.data ? (
          <span className="rounded-small bg-surface-selected px-two py-0.5 text-body-small text-text-muted">
            {t("notReviewed")}
          </span>
        ) : null}
      </div>
      <div className="flex flex-wrap gap-x-four gap-y-two">
        <label className="flex items-center gap-one text-body-small text-text">
          <input
            type="checkbox"
            checked={selection.none}
            onChange={() => update(toggleNone(selection))}
          />
          {t("allergensNone")}
        </label>
        {ALLERGENS.map((allergen) => (
          <label key={allergen} className="flex items-center gap-one text-body-small text-text">
            <input
              type="checkbox"
              checked={selection.allergens.includes(allergen)}
              onChange={() => update(toggleAllergen(selection, allergen))}
            />
            {tRecipe(`allergenLabels.${allergen}`)}
          </label>
        ))}
      </div>
      <div className="flex items-center gap-three">
        <Button
          variant="secondary"
          disabled={!canSaveSelection(selection) || save.isPending}
          onClick={() => {
            setIsDirty(false);
            save.mutate(selection);
          }}
        >
          {t("saveAllergens")}
        </Button>
        {status ? (
          <Text
            variant="bodySmall"
            role="status"
            className={result?.error ? "text-danger" : ""}
            muted={!result?.error}
          >
            {status}
          </Text>
        ) : null}
      </div>
    </fieldset>
  );
}
