import { StyleSheet, View } from "react-native";
import { useTranslation } from "react-i18next";

import { Text } from "@/components/text";
import { Radii, Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";
import { useMocktailsOnly } from "./mocktails-context";

// "Mocktails only" pill at the top of Home (spec 0063 AC-15). Plain text, not
// a control, drawn from theme tokens so it reads in light and dark.
export function MocktailsBadge() {
  const { t } = useTranslation();
  const theme = useTheme();

  if (!useMocktailsOnly()) return null;

  return (
    <View
      style={[styles.pill, { backgroundColor: theme.surface, borderColor: theme.border }]}
      testID="mocktails-badge"
    >
      <Text variant="label">{t("mocktails.badge")}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    alignSelf: "flex-start",
    marginHorizontal: Spacing.four,
    marginTop: Spacing.three,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one,
    borderRadius: Radii.full,
    borderWidth: 1,
  },
});
