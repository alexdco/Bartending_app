import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { StyleSheet, View } from "react-native";

import { Card } from "@/components/card";
import { Chip } from "@/components/chip";
import { Input } from "@/components/input";
import { Text } from "@/components/text";
import { Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";
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
  isSupportedLocale,
  partSizeInputForUnit,
  partSizeUnitFor,
  validateCustomDilutionPercent,
  validatePartSize,
  validateServings,
  type BatchScope,
  type BatchUnit,
  type DilutionLevel,
  type PartSizeUnit,
  type RecipeIngredientDetail,
} from "@bartendingapp/shared";

export interface BatchPanelProps {
  ingredients: RecipeIngredientDetail[];
  /** Follows the single serving toggle until the bartender picks one (spec 0035 AC-6). */
  unit: BatchUnit;
  onUnitChange: (unit: BatchUnit) => void;
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

export function BatchPanel({ ingredients, unit, onUnitChange }: BatchPanelProps) {
  const theme = useTheme();
  const { i18n } = useTranslation();
  const locale = isSupportedLocale(i18n.language) ? i18n.language : "en";

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

  const partSizeValue = hasParts ? validatePartSize(partSize.input, partSize.unit) : null;
  const partSizeRange = PART_SIZE_RANGE[partSize.unit];
  const partSizeError =
    hasParts && partSizeValue === null
      ? `Enter a part size from ${partSizeRange.min} to ${partSizeRange.max} ${partSize.unit}.`
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
    <Card style={styles.card}>
      <Text variant="heading">Batch this recipe</Text>

      <Input
        label="Servings"
        keyboardType="numeric"
        value={servingsInput}
        onChangeText={setServingsInput}
        error={servingsError}
        placeholder="e.g. 50"
      />

      <View style={styles.group}>
        <Text variant="label">Scope</Text>
        <View style={styles.chipRow}>
          {BATCH_SCOPES.map((candidate) => (
            <Chip
              key={candidate}
              selected={scope === candidate}
              onSelectedChange={() => handleScopeChange(candidate)}
            >
              {SCOPE_LABELS[candidate]}
            </Chip>
          ))}
        </View>
      </View>

      {scope === "custom" && (
        <View style={styles.group}>
          <Text variant="label">Include</Text>
          {ingredients
            .filter((i) => i.amountValue !== null && i.amountUnit !== null)
            .map((ingredient) => (
              <Chip
                key={ingredient.ingredientId}
                selected={customSelectedIds.has(ingredient.ingredientId)}
                onSelectedChange={() => toggleCustomIngredient(ingredient.ingredientId)}
              >
                {ingredient.name}
              </Chip>
            ))}
        </View>
      )}

      <View style={styles.group}>
        <Text variant="label">Unit</Text>
        <View style={styles.chipRow}>
          {BATCH_UNITS.map((candidate) => (
            <Chip
              key={candidate}
              selected={unit === candidate}
              onSelectedChange={() => onUnitChange(candidate)}
            >
              {batchUnitLabel(candidate, locale)}
            </Chip>
          ))}
        </View>
      </View>

      {hasParts && (
        <Input
          label={`Size of 1 part (${partSize.unit})`}
          keyboardType="decimal-pad"
          value={partSize.input}
          onChangeText={(input) => setPartSize({ input, unit: partSize.unit })}
          error={partSizeError}
        />
      )}

      <View style={styles.group}>
        <Text variant="label">Dilution</Text>
        <View style={styles.chipRow}>
          {DILUTION_LEVELS.map((candidate) => (
            <Chip
              key={candidate}
              selected={dilutionLevel === candidate}
              onSelectedChange={() => setDilutionLevel(candidate)}
            >
              {DILUTION_LABELS[candidate]}
            </Chip>
          ))}
        </View>
        {dilutionLevel === "custom" && (
          <Input
            label="Custom dilution percent"
            keyboardType="decimal-pad"
            value={customDilutionInput}
            onChangeText={setCustomDilutionInput}
            error={customDilutionError}
            placeholder="e.g. 18"
          />
        )}
      </View>

      {result && (
        <View style={[styles.results, { borderTopColor: theme.border }]}>
          {result.lines.map((line) => {
            if (line.state === "excluded") {
              return null;
            }
            return (
              <View key={line.ingredientId} style={styles.row}>
                <Text variant="body">{line.name}</Text>
                <View style={styles.amountColumn}>
                  <Text variant="body">
                    {line.state === "unscaled" ? line.measure : line.displayAmount}
                  </Text>
                  {line.state === "unscaled" && (
                    <Text variant="bodySmall" muted>
                      not scaled, adjust manually
                    </Text>
                  )}
                  {line.state === "uncategorized" && (
                    <Text variant="bodySmall" muted>
                      uncategorized
                    </Text>
                  )}
                </View>
              </View>
            );
          })}
          {result.waterLine && (
            <View style={styles.row}>
              <Text variant="body">Water</Text>
              <Text variant="body">{result.waterLine.displayAmount}</Text>
            </View>
          )}

          {result.nothingToDiluteNote && (
            <Text variant="bodySmall" muted>
              Nothing to dilute in this batch.
            </Text>
          )}

          {result.totalDisplayAmount !== null && (
            <View style={[styles.row, styles.totalRow, { borderTopColor: theme.border }]}>
              <Text variant="label">Total</Text>
              <Text variant="label">{result.totalDisplayAmount}</Text>
            </View>
          )}
        </View>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: Spacing.three,
  },
  group: {
    gap: Spacing.one,
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.one,
  },
  results: {
    gap: Spacing.two,
    borderTopWidth: 1,
    paddingTop: Spacing.three,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  amountColumn: {
    alignItems: "flex-end",
  },
  totalRow: {
    borderTopWidth: 1,
    paddingTop: Spacing.two,
  },
});
