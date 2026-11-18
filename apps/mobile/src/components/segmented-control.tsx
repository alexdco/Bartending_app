import { Pressable, StyleSheet, Text, View } from "react-native";

import { Radii, Spacing, TypeScale } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";

export interface SegmentedControlOption<Value extends string> {
  value: Value;
  label: string;
}

export interface SegmentedControlProps<Value extends string> {
  /** Accessible name of the radio group. */
  label: string;
  options: readonly SegmentedControlOption<Value>[];
  value: Value;
  onValueChange: (value: Value) => void;
}

/**
 * A two or three way choice where exactly one option is always selected
 * (spec 0061 AC-2, AC-12): a radiogroup of radios, each at least 44 points.
 * Pressing the selected option again does nothing.
 */
export function SegmentedControl<Value extends string>({
  label,
  options,
  value,
  onValueChange,
}: SegmentedControlProps<Value>) {
  const theme = useTheme();

  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel={label}
      style={[styles.group, { backgroundColor: theme.surface, borderColor: theme.border }]}
    >
      {options.map((option) => {
        const checked = option.value === value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="radio"
            accessibilityState={{ checked }}
            accessibilityLabel={option.label}
            onPress={() => {
              if (!checked) {
                onValueChange(option.value);
              }
            }}
            style={(state) => [
              styles.option,
              {
                backgroundColor: checked ? theme.accent : "transparent",
                opacity: state.pressed && !checked ? 0.85 : 1,
              },
            ]}
          >
            <Text style={[styles.label, { color: checked ? theme.accentText : theme.text }]}>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  group: {
    alignSelf: "flex-start",
    flexDirection: "row",
    borderRadius: Radii.full,
    borderWidth: 1,
    padding: Spacing.half,
  },
  option: {
    minHeight: 44,
    minWidth: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: Radii.full,
    paddingHorizontal: Spacing.three,
  },
  label: {
    fontSize: TypeScale.label.size,
    lineHeight: TypeScale.label.size * TypeScale.label.lineHeight,
    fontWeight: "500",
  },
});
