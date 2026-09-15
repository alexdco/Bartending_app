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
  DILUTION_LEVELS,
  batchUnitLabel,
  computeBatch,
  hasConvertibleIngredient,
  isSupportedLocale,
  validateCustomDilutionPercent,
  validateServings,
  type BatchScope,
  type BatchUnit,
  type DilutionLevel,
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
  const theme = useTheme();
  const { i18n } = useTranslation();
  const locale = isSupportedLocale(i18n.language) ? i18n.language : "en";

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
              onSelectedChange={() => setUnit(candidate)}
            >
              {batchUnitLabel(candidate, locale)}
            </Chip>
          ))}
        </View>
      </View>

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

          {result.noAlcoholNote && (
            <Text variant="bodySmall" muted>
              No alcohol in this batch, no dilution added.
            </Text>
          )}

          <View style={[styles.row, styles.totalRow, { borderTopColor: theme.border }]}>
            <Text variant="label">Total</Text>
            <Text variant="label">{result.totalDisplayAmount}</Text>
          </View>
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
