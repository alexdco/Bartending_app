import { useTranslation } from "react-i18next";
import { Pressable, StyleSheet, Text } from "react-native";

import { useTheme } from "@/hooks/use-theme";

export interface FavoriteToggleProps {
  /** Names the control: "Favorite {name}" (spec 0038 AC-10). */
  recipeName: string;
  isFavorited: boolean;
  onToggle: () => void;
  disabled?: boolean;
}

export function FavoriteToggle({
  recipeName,
  isFavorited,
  onToggle,
  disabled,
}: FavoriteToggleProps) {
  const theme = useTheme();
  const { t } = useTranslation();

  return (
    <Pressable
      accessibilityRole="togglebutton"
      // Fixed name; the on/off state lives only in checked (spec 0038 AC-10).
      accessibilityState={{ checked: isFavorited, disabled }}
      accessibilityLabel={t("favorites.toggleLabel", { name: recipeName })}
      disabled={disabled}
      hitSlop={8}
      onPress={onToggle}
      style={(state) => [
        styles.base,
        {
          backgroundColor: theme.surface,
          opacity: disabled ? 0.5 : state.pressed ? 0.85 : 1,
        },
      ]}
    >
      <Text style={[styles.glyph, { color: isFavorited ? theme.danger : theme.text }]}>
        {isFavorited ? "♥" : "♡"}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  glyph: {
    fontSize: 20,
  },
});
