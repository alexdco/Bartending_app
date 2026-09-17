import { Pressable, StyleSheet, Text, View } from "react-native";

import { useTheme } from "@/hooks/use-theme";

export interface StarRatingProps {
  value: number;
  onRate?: (score: 1 | 2 | 3 | 4 | 5) => void;
  disabled?: boolean;
  size?: "small" | "large";
}

const SCORES = [1, 2, 3, 4, 5] as const;

export function StarRating({ value, onRate, disabled = false, size = "large" }: StarRatingProps) {
  const theme = useTheme();
  const interactive = Boolean(onRate) && !disabled;
  const fontSize = size === "large" ? 28 : 16;

  return (
    <View style={styles.row} accessibilityRole={interactive ? "radiogroup" : undefined}>
      {SCORES.map((score) => {
        const filled = score <= value;
        const color = filled ? theme.accent : `${theme.text}4D`;

        if (!interactive) {
          return (
            <Text key={score} style={{ fontSize, color }}>
              ★
            </Text>
          );
        }

        return (
          <Pressable
            key={score}
            accessibilityRole="radio"
            accessibilityState={{ checked: score === value, disabled }}
            accessibilityLabel={`Rate ${score} star${score === 1 ? "" : "s"}`}
            disabled={disabled}
            hitSlop={4}
            onPress={() => onRate?.(score)}
            style={(state) => ({ opacity: disabled ? 0.5 : state.pressed ? 0.85 : 1 })}
          >
            <Text style={{ fontSize, color }}>★</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
});
