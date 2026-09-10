import { StyleSheet, View } from "react-native";

import { Spacing } from "@/constants/theme";
import { Card } from "@/components/card";
import { Chip } from "@/components/chip";
import { Text } from "@/components/text";
import type { GeneratedDrinkIdea } from "@bartendingapp/shared";

export interface GeneratedRecipeCardProps {
  idea: GeneratedDrinkIdea;
}

export function GeneratedRecipeCard({ idea }: GeneratedRecipeCardProps) {
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
            {ingredient.amount} {ingredient.name}
          </Text>
        ))}
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
