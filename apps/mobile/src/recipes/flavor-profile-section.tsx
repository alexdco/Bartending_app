import { StyleSheet, Text as RNText, View } from "react-native";

import { Text } from "@/components/text";
import { Radii, Spacing, TypeScale } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";

export interface FlavorProfileSectionProps {
  flavors: readonly string[];
}

/**
 * The recipe's taste tags as read only pills. Plain views, not Chips: Chip is
 * a toggle button, and these labels aren't interactive. Renders nothing until
 * the recipe has been classified.
 */
export function FlavorProfileSection({ flavors }: FlavorProfileSectionProps) {
  const theme = useTheme();

  if (flavors.length === 0) {
    return null;
  }

  return (
    <View style={styles.section}>
      <Text variant="heading">Flavor profile</Text>
      <View style={styles.row} accessibilityRole="list">
        {flavors.map((flavor) => (
          <View
            key={flavor}
            style={[styles.pill, { backgroundColor: theme.surface, borderColor: theme.border }]}
          >
            <RNText style={[styles.label, { color: theme.text }]}>{flavor}</RNText>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: Spacing.two,
  },
  row: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.two,
  },
  pill: {
    borderRadius: Radii.full,
    borderWidth: 1,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one,
  },
  label: {
    fontSize: TypeScale.label.size,
    lineHeight: TypeScale.label.size * TypeScale.label.lineHeight,
    fontWeight: "500",
    textTransform: "capitalize",
  },
});
