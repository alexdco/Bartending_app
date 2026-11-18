import { useTranslation } from "react-i18next";
import { StyleSheet, View } from "react-native";

import { Spacing } from "@/constants/theme";
import { Card } from "@/components/card";
import { Chip } from "@/components/chip";
import { Text } from "@/components/text";
import {
  isSupportedLocale,
  localizeDecimalText,
  type GeneratedDrinkIdea,
} from "@bartendingapp/shared";

export interface GeneratedRecipeCardProps {
  idea: GeneratedDrinkIdea;
}

export function GeneratedRecipeCard({ idea }: GeneratedRecipeCardProps) {
  const { t, i18n } = useTranslation();
  const locale = isSupportedLocale(i18n.language) ? i18n.language : "en";

  return (
    <Card style={styles.card}>
      <View style={styles.header}>
        <Text variant="subheading" style={styles.title}>
          {idea.name}
        </Text>
        <Chip selected>AI generated</Chip>
      </View>

      <View style={styles.section}>
        <Text variant="label" muted>
          Ingredients
        </Text>
        {idea.ingredients.map((ingredient) => (
          <Text key={ingredient.name} variant="bodySmall">
            {/* The model's amount text, decimal separator localized; steps stay as written (spec 0055 AC-5). */}
            {localizeDecimalText(ingredient.amount, locale)} {ingredient.name}
          </Text>
        ))}
        {idea.garnish !== null && (
          // The server decides in_pantry; a garnish you don't own reads as optional (spec 0059 AC-2).
          <Text variant="bodySmall">
            {idea.garnish.in_pantry
              ? t("drinkIdeas.garnish", { name: idea.garnish.name })
              : t("drinkIdeas.optionalGarnish", { name: idea.garnish.name })}
          </Text>
        )}
      </View>

      <View style={styles.section}>
        <Text variant="label" muted>
          Steps
        </Text>
        {idea.steps.map((step, index) => (
          <Text key={index} variant="bodySmall">
            {index + 1}. {step}
          </Text>
        ))}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: Spacing.three,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: Spacing.two,
  },
  title: {
    flex: 1,
  },
  section: {
    gap: Spacing.half,
  },
});
