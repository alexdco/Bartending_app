import type { ReactNode } from "react";
import { Pressable, StyleSheet, Text, type PressableProps } from "react-native";

import { Radii, Spacing, TypeScale } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";

export interface ButtonProps extends Omit<PressableProps, "children"> {
  children: ReactNode;
  variant?: "primary" | "secondary";
}

export function Button({ children, variant = "primary", disabled, style, ...rest }: ButtonProps) {
  const theme = useTheme();

  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      hitSlop={8}
      style={(state) => [
        styles.base,
        {
          minHeight: 44,
          minWidth: 44,
          backgroundColor: variant === "primary" ? theme.accent : theme.surface,
          borderColor: variant === "secondary" ? theme.border : "transparent",
          borderWidth: variant === "secondary" ? 1 : 0,
          opacity: disabled ? 0.5 : state.pressed ? 0.85 : 1,
        },
        typeof style === "function" ? style(state) : style,
      ]}
      {...rest}
    >
      <Text
        style={[styles.label, { color: variant === "primary" ? theme.accentText : theme.text }]}
      >
        {children}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: Spacing.two,
    borderRadius: Radii.medium,
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.two,
  },
  label: {
    fontSize: TypeScale.label.size,
    lineHeight: TypeScale.label.size * TypeScale.label.lineHeight,
    fontWeight: "600",
  },
});
