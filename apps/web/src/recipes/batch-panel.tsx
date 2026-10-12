"use client";

import { useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Card } from "@/components/card";
import { Chip } from "@/components/chip";
import { Input } from "@/components/input";
import { Text } from "@/components/text";
import {
  BATCH_SCOPES,
  BATCH_UNITS,
  DEFAULT_PART_SIZE,
  DILUTION_LEVELS,
  PART_SIZE_RANGE,
  batchUnitLabel,
  computeBatch,
  hasConvertibleIngredient,
  hasPartIngredient,
  partSizeInputForUnit,
  partSizeUnitFor,
  validateCustomDilutionPercent,
  validatePartSize,
  validateServings,
  type BatchScope,
  type BatchUnit,
  type DilutionLevel,
  type Locale,
  type PartSizeUnit,
  type RecipeIngredientDetail,
} from "@bartendingapp/shared";

export interface BatchPanelProps {
  ingredients: RecipeIngredientDetail[];
  /** Follows the single serving toggle until the bartender picks one (spec 0035 AC-6). */
  unit: BatchUnit;
  onUnitChange: (unit: BatchUnit) => void;
}

const SCOPE_KEYS = {
  everything: "scopeEverything",
  alcohol_only: "scopeAlcoholOnly",
  except_citrus: "scopeExceptCitrus",
  custom: "scopeCustom",
} as const satisfies Record<BatchScope, string>;

export function BatchPanel({ ingredients, unit, onUnitChange }: BatchPanelProps) {
  const t = useTranslations("batch");
  const locale = useLocale() as Locale;

  const dilutionLabel = (level: DilutionLevel) => {
    if (level === "none") return t("dilutionNone");
    if (level === "custom") return t("dilutionCustom");
    return t("percent", { value: Number(level) });
  };

  const [servingsInput, setServingsInput] = useState("");
  const [scope, setScope] = useState<BatchScope>("everything");
  const [dilutionLevel, setDilutionLevel] = useState<DilutionLevel>("none");
  const [customDilutionInput, setCustomDilutionInput] = useState("");
  const [customSelectedIds, setCustomSelectedIds] = useState<Set<string>>(
    () => new Set(ingredients.map((i) => i.ingredientId)),
  );

  // The part size input's unit family follows the batch unit; when the
  // family switches, a valid value converts and an invalid one resets
  // (spec 0035 AC-3). Adjusted during render, React's pattern for state
  // derived from a changing prop.
  const partSizeUnit = partSizeUnitFor(unit);
  const [partSize, setPartSize] = useState<{ input: string; unit: PartSizeUnit }>(() => ({
    input: String(DEFAULT_PART_SIZE[partSizeUnit]),
    unit: partSizeUnit,
  }));
  if (partSize.unit !== partSizeUnit) {
    setPartSize({
      input: partSizeInputForUnit(partSize.input, partSize.unit, partSizeUnit),
      unit: partSizeUnit,
    });
  }

  const hasParts = hasPartIngredient(ingredients);

  const servings = servingsInput === "" ? null : validateServings(servingsInput);
  const servingsError = servingsInput !== "" && servings === null ? t("servingsError") : undefined;

  const customDilutionPercent =
    customDilutionInput === "" ? null : validateCustomDilutionPercent(customDilutionInput);
  const customDilutionError =
    dilutionLevel === "custom" && customDilutionInput !== "" && customDilutionPercent === null
      ? t("customDilutionError")
      : undefined;

  const partSizeValue = hasParts ? validatePartSize(partSize.input, partSize.unit) : null;
  const partSizeError =
    hasParts && partSizeValue === null
      ? t("partSizeError", { ...PART_SIZE_RANGE[partSize.unit], unit: partSize.unit })
      : undefined;

  const canCompute =
    servings !== null &&
    (dilutionLevel !== "custom" || customDilutionPercent !== null) &&
    (!hasParts || partSizeValue !== null);

  const result = useMemo(() => {
    if (!canCompute || servings === null) {
      return null;
    }
    return computeBatch(
      ingredients.map((i) => ({
        ingredientId: i.ingredientId,
        name: i.name,
        measure: i.measure,
        amountValue: i.amountValue,
        amountUnit: i.amountUnit,
        category: i.category,
      })),
      {
        servings,
        scope,
        unit,
        dilutionLevel,
        customDilutionPercent,
        customSelectedIds,
        partSize: partSizeValue === null ? null : { value: partSizeValue, unit: partSize.unit },
        locale,
      },
    );
  }, [
    canCompute,
    ingredients,
    servings,
    scope,
    unit,
    dilutionLevel,
    customDilutionPercent,
    customSelectedIds,
    partSizeValue,
    partSize.unit,
    locale,
  ]);

  if (!hasConvertibleIngredient(ingredients)) {
    return null;
  }

  function handleScopeChange(next: BatchScope) {
    setScope(next);
    if (next === "custom") {
      setCustomSelectedIds(new Set(ingredients.map((i) => i.ingredientId)));
    }
  }

  function toggleCustomIngredient(id: string) {
    setCustomSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  return (
    <Card className="flex flex-col gap-three">
      <Text variant="heading" as="h2">
        {t("title")}
      </Text>

      <Input
        label={t("servings")}
        inputMode="numeric"
        value={servingsInput}
        onChange={(e) => setServingsInput(e.target.value)}
        error={servingsError}
        placeholder={t("servingsPlaceholder")}
      />

      <div className="flex flex-col gap-one">
        <Text variant="label">{t("scope")}</Text>
        <div className="flex flex-wrap gap-one" role="group" aria-label={t("scope")}>
          {BATCH_SCOPES.map((candidate) => (
            <Chip
              key={candidate}
              selected={scope === candidate}
              onSelectedChange={() => handleScopeChange(candidate)}
            >
              {t(SCOPE_KEYS[candidate])}
            </Chip>
          ))}
        </div>
      </div>

      {scope === "custom" && (
        <div className="flex flex-col gap-one">
          <Text variant="label">{t("include")}</Text>
          <ul className="flex flex-col gap-one">
            {ingredients
              .filter((i) => i.amountValue !== null && i.amountUnit !== null)
              .map((ingredient) => (
                <li key={ingredient.ingredientId}>
                  <Chip
                    selected={customSelectedIds.has(ingredient.ingredientId)}
                    onSelectedChange={() => toggleCustomIngredient(ingredient.ingredientId)}
                  >
                    {ingredient.name}
                  </Chip>
                </li>
              ))}
          </ul>
        </div>
      )}

      <div className="flex flex-col gap-one">
        <Text variant="label">{t("unit")}</Text>
        <div className="flex gap-one" role="group" aria-label={t("unit")}>
          {BATCH_UNITS.map((candidate) => (
            <Chip
              key={candidate}
              selected={unit === candidate}
              onSelectedChange={() => onUnitChange(candidate)}
            >
              {batchUnitLabel(candidate, locale)}
            </Chip>
          ))}
        </div>
      </div>

      {hasParts && (
        <Input
          label={t("partSize", { unit: partSize.unit })}
          inputMode="decimal"
          value={partSize.input}
          onChange={(e) => setPartSize({ input: e.target.value, unit: partSize.unit })}
          error={partSizeError}
        />
      )}

      <div className="flex flex-col gap-one">
        <Text variant="label">{t("dilution")}</Text>
        <div className="flex flex-wrap gap-one" role="group" aria-label={t("dilution")}>
          {DILUTION_LEVELS.map((candidate) => (
            <Chip
              key={candidate}
              selected={dilutionLevel === candidate}
              onSelectedChange={() => setDilutionLevel(candidate)}
            >
              {dilutionLabel(candidate)}
            </Chip>
          ))}
        </div>
        {dilutionLevel === "custom" && (
          <Input
            label={t("customDilutionLabel")}
            inputMode="decimal"
            value={customDilutionInput}
            onChange={(e) => setCustomDilutionInput(e.target.value)}
            error={customDilutionError}
            placeholder={t("customDilutionPlaceholder")}
          />
        )}
      </div>

      {result && (
        <div className="flex flex-col gap-two border-t border-border pt-three">
          <ul className="flex flex-col gap-one">
            {result.lines.map((line) => {
              if (line.state === "excluded") {
                return null;
              }
              return (
                <li key={line.ingredientId} className="flex items-center justify-between gap-two">
                  <Text variant="body">{line.name}</Text>
                  <Text variant="body">
                    {line.state === "unscaled" ? line.measure : line.displayAmount}
                    {line.state === "unscaled" && (
                      <Text variant="bodySmall" as="span" muted className="ml-one">
                        {t("notScaled")}
                      </Text>
                    )}
                    {line.state === "uncategorized" && (
                      <Text variant="bodySmall" as="span" muted className="ml-one">
                        {t("uncategorized")}
                      </Text>
                    )}
                  </Text>
                </li>
              );
            })}
            {result.waterLine && (
              <li className="flex items-center justify-between gap-two">
                <Text variant="body">{t("water")}</Text>
                <Text variant="body">{result.waterLine.displayAmount}</Text>
              </li>
            )}
          </ul>

          {result.nothingToDiluteNote && (
            <Text variant="bodySmall" muted>
              {t("nothingToDiluteNote")}
            </Text>
          )}

          {result.totalDisplayAmount !== null && (
            <div className="flex items-center justify-between gap-two border-t border-border pt-two">
              <Text variant="label">{t("total")}</Text>
              <Text variant="label">{result.totalDisplayAmount}</Text>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
