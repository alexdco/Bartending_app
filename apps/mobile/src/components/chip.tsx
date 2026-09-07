import type { ReactNode } from "react";
import { Pressable, StyleSheet, Text } from "react-native";

import { Radii, Spacing, TypeScale } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";

export interface ChipProps {
  children: ReactNode;
  selected?: boolean;
  onSelectedChange?: (selected: boolean) => void;
  disabled?: boolean;
}

export function Chip({ children, selected = false, onSelectedChange, disabled }: ChipProps) {
  const theme = useTheme();

  return (
    <Pressable
      accessibilityRole="togglebutton"
      accessibilityState={{ selected, disabled }}
      disabled={disabled}
      hitSlop={8}
      onPress={() => onSelectedChange?.(!selected)}
      style={(state) => [
        styles.base,
        {
          minHeight: 44,
          backgroundColor: selected ? theme.accent : theme.surface,
          borderColor: selected ? "transparent" : theme.border,
          opacity: disabled ? 0.5 : state.pressed ? 0.85 : 1,
        },
      ]}
    >
      <Text style={[styles.label, { color: selected ? theme.accentText : theme.text }]}>
        {children}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    alignItems: "center",
    justifyContent: "center",
    borderRadius: Radii.full,
    borderWidth: 1,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one,
  },
  label: {
    fontSize: TypeScale.label.size,
    lineHeight: TypeScale.label.size * TypeScale.label.lineHeight,
    fontWeight: "500",
  },
});
