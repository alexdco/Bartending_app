import { ActivityIndicator } from "react-native";

import { useTheme } from "@/hooks/use-theme";

export interface SpinnerProps {
  label?: string;
  size?: "small" | "large";
}

export function Spinner({ label = "Loading", size = "small" }: SpinnerProps) {
  const theme = useTheme();

  return (
    <ActivityIndicator
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      size={size}
      color={theme.accent}
    />
  );
}
