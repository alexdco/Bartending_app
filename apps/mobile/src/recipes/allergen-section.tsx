import { useMemo } from "react";
import { StyleSheet, View } from "react-native";
import { useTranslation } from "react-i18next";
import { summarizeRecipeAllergens, type AllergenIngredient } from "@bartendingapp/shared";

import { Text } from "@/components/text";
import { Spacing } from "@/constants/theme";

export interface AllergenSectionProps {
  /** In recipe order, names already localized by the RPC. */
  ingredients: readonly AllergenIngredient[];
}

/**
 * Allergen Information (spec 0043, AC-6). Always shown: each allergen with
 * the ingredients it comes from, a "none" line only when every ingredient is
 * reviewed, an incomplete line otherwise, and the disclaimer.
 */
export function AllergenSection({ ingredients }: AllergenSectionProps) {
  const { t } = useTranslation();
  const summary = useMemo(() => summarizeRecipeAllergens(ingredients), [ingredients]);

  return (
    <View style={styles.section}>
      <Text variant="heading" accessibilityRole="header">
        {t("recipe.allergens")}
      </Text>

      {summary.entries.length > 0 ? (
        <View style={styles.list} accessibilityRole="list">
          {summary.entries.map((entry) => (
            <Text key={entry.allergen} variant="body">
              <Text variant="body" style={styles.allergen}>
                {t(`recipe.allergenLabels.${entry.allergen}`)}
              </Text>{" "}
              ({entry.ingredientNames.join(", ")})
            </Text>
          ))}
        </View>
      ) : summary.isComplete ? (
        <Text variant="body">{t("recipe.allergensNone")}</Text>
      ) : null}

      {summary.isComplete ? null : <Text variant="body">{t("recipe.allergensIncomplete")}</Text>}

      <Text variant="bodySmall" muted>
        {t("recipe.allergensDisclaimer")}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: Spacing.two,
  },
  list: {
    gap: Spacing.one,
  },
  allergen: {
    fontWeight: "500",
  },
});
