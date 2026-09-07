import { View, StyleSheet, type ViewProps } from "react-native";

import { Radii, Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";

export interface CardProps extends ViewProps {
  selected?: boolean;
}

export function Card({ selected = false, style, ...rest }: CardProps) {
  const theme = useTheme();

  return (
    <View
      style={[
        styles.base,
        {
          backgroundColor: selected ? theme.surfaceSelected : theme.surface,
          borderColor: theme.border,
        },
        style,
      ]}
      {...rest}
    />
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: Radii.medium,
    borderWidth: 1,
    padding: Spacing.four,
  },
});
