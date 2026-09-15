"use client";

import { useMemo, useState } from "react";
import { useLocale } from "next-intl";
import { Card } from "@/components/card";
import { Chip } from "@/components/chip";
import { Input } from "@/components/input";
import { Text } from "@/components/text";
import {
  BATCH_SCOPES,
  BATCH_UNITS,
  DILUTION_LEVELS,
  batchUnitLabel,
  computeBatch,
  hasConvertibleIngredient,
  validateCustomDilutionPercent,
  validateServings,
  type BatchScope,
  type BatchUnit,
  type DilutionLevel,
  type Locale,
  type RecipeIngredientDetail,
} from "@bartendingapp/shared";

export interface BatchPanelProps {
  ingredients: RecipeIngredientDetail[];
}

const SCOPE_LABELS: Record<BatchScope, string> = {
  everything: "Everything",
  alcohol_only: "Alcohol only",
  except_citrus: "Everything except citrus",
  custom: "Custom selection",
};

const DILUTION_LABELS: Record<DilutionLevel, string> = {
  none: "None",
  "15": "15%",
  "20": "20%",
  "25": "25%",
  custom: "Custom",
};

export function BatchPanel({ ingredients }: BatchPanelProps) {
  const locale = useLocale() as Locale;

  const [servingsInput, setServingsInput] = useState("");
  const [scope, setScope] = useState<BatchScope>("everything");
  const [unit, setUnit] = useState<BatchUnit>("oz");
  const [dilutionLevel, setDilutionLevel] = useState<DilutionLevel>("none");
  const [customDilutionInput, setCustomDilutionInput] = useState("");
  const [customSelectedIds, setCustomSelectedIds] = useState<Set<string>>(
    () => new Set(ingredients.map((i) => i.ingredientId)),
  );

  const servings = servingsInput === "" ? null : validateServings(servingsInput);
  const servingsError =
    servingsInput !== "" && servings === null
      ? "Enter a whole number of servings from 1 to 500."
      : undefined;

  const customDilutionPercent =
    customDilutionInput === "" ? null : validateCustomDilutionPercent(customDilutionInput);
  const customDilutionError =
    dilutionLevel === "custom" && customDilutionInput !== "" && customDilutionPercent === null
      ? "Enter a percent from 0 to 50."
      : undefined;

  const canCompute =
    servings !== null && (dilutionLevel !== "custom" || customDilutionPercent !== null);

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
        locale,
      },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canCompute, servings, scope, unit, dilutionLevel, customDilutionPercent, customSelectedIds]);

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
        Batch this recipe
      </Text>

      <Input
        label="Servings"
        inputMode="numeric"
        value={servingsInput}
        onChange={(e) => setServingsInput(e.target.value)}
        error={servingsError}
        placeholder="e.g. 50"
      />

      <div className="flex flex-col gap-one">
        <Text variant="label">Scope</Text>
        <div className="flex flex-wrap gap-one" role="group" aria-label="Scope">
          {BATCH_SCOPES.map((candidate) => (
            <Chip
              key={candidate}
              selected={scope === candidate}
              onSelectedChange={() => handleScopeChange(candidate)}
            >
              {SCOPE_LABELS[candidate]}
            </Chip>
          ))}
        </div>
      </div>

      {scope === "custom" && (
        <div className="flex flex-col gap-one">
          <Text variant="label">Include</Text>
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
        <Text variant="label">Unit</Text>
        <div className="flex gap-one" role="group" aria-label="Unit">
          {BATCH_UNITS.map((candidate) => (
            <Chip
              key={candidate}
              selected={unit === candidate}
              onSelectedChange={() => setUnit(candidate)}
            >
              {batchUnitLabel(candidate, locale)}
            </Chip>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-one">
        <Text variant="label">Dilution</Text>
        <div className="flex flex-wrap gap-one" role="group" aria-label="Dilution">
          {DILUTION_LEVELS.map((candidate) => (
            <Chip
              key={candidate}
              selected={dilutionLevel === candidate}
              onSelectedChange={() => setDilutionLevel(candidate)}
            >
              {DILUTION_LABELS[candidate]}
            </Chip>
          ))}
        </div>
        {dilutionLevel === "custom" && (
          <Input
            label="Custom dilution percent"
            inputMode="decimal"
            value={customDilutionInput}
            onChange={(e) => setCustomDilutionInput(e.target.value)}
            error={customDilutionError}
            placeholder="e.g. 18"
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
                        (not scaled, adjust manually)
                      </Text>
                    )}
                    {line.state === "uncategorized" && (
                      <Text variant="bodySmall" as="span" muted className="ml-one">
                        (uncategorized)
                      </Text>
                    )}
                  </Text>
                </li>
              );
            })}
            {result.waterLine && (
              <li className="flex items-center justify-between gap-two">
                <Text variant="body">Water</Text>
                <Text variant="body">{result.waterLine.displayAmount}</Text>
              </li>
            )}
          </ul>

          {result.noAlcoholNote && (
            <Text variant="bodySmall" muted>
              No alcohol in this batch, no dilution added.
            </Text>
          )}

          <div className="flex items-center justify-between gap-two border-t border-border pt-two">
            <Text variant="label">Total</Text>
            <Text variant="label">{result.totalDisplayAmount}</Text>
          </div>
        </div>
      )}
    </Card>
  );
}
