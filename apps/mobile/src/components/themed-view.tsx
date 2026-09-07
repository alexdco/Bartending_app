import { View, type ViewProps } from "react-native";

import { useLegacyTheme } from "@/hooks/use-theme";
import type { LegacyThemeColor } from "@/constants/theme";

export type ThemedViewProps = ViewProps & {
  lightColor?: string;
  darkColor?: string;
  type?: LegacyThemeColor;
};

export function ThemedView({ style, lightColor, darkColor, type, ...otherProps }: ThemedViewProps) {
  const theme = useLegacyTheme();

  return <View style={[{ backgroundColor: theme[type ?? "background"] }, style]} {...otherProps} />;
}
