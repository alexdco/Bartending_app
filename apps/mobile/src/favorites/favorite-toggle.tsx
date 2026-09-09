import { Pressable, StyleSheet, Text } from "react-native";

import { useTheme } from "@/hooks/use-theme";

export interface FavoriteToggleProps {
  isFavorited: boolean;
  onToggle: () => void;
  disabled?: boolean;
}

export function FavoriteToggle({ isFavorited, onToggle, disabled }: FavoriteToggleProps) {
  const theme = useTheme();

  return (
    <Pressable
      accessibilityRole="togglebutton"
      accessibilityState={{ selected: isFavorited, disabled }}
      accessibilityLabel={isFavorited ? "Remove from favorites" : "Add to favorites"}
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
