import { useId } from "react";
import { StyleSheet, Text, TextInput, View, type TextInputProps } from "react-native";

import { Radii, Spacing, TypeScale } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";

export interface InputProps extends TextInputProps {
  label: string;
  error?: string;
}

export function Input({ label, error, style, ...rest }: InputProps) {
  const theme = useTheme();
  const inputId = useId();

  return (
    <View style={styles.container}>
      <Text style={[styles.label, { color: theme.text }]} nativeID={`${inputId}-label`}>
        {label}
      </Text>
      <TextInput
        accessibilityLabel={label}
        accessibilityLabelledBy={`${inputId}-label`}
        placeholderTextColor={theme.textMuted}
        style={[
          styles.input,
          {
            minHeight: 44,
            color: theme.text,
            backgroundColor: theme.surface,
            borderColor: error ? theme.danger : theme.border,
          },
          style,
        ]}
        {...rest}
      />
      {error && (
        <Text accessibilityRole="alert" style={[styles.error, { color: theme.danger }]}>
          {error}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: Spacing.one,
  },
  label: {
    fontSize: TypeScale.label.size,
    lineHeight: TypeScale.label.size * TypeScale.label.lineHeight,
    fontWeight: "500",
  },
  input: {
    borderRadius: Radii.small,
    borderWidth: 1,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    fontSize: TypeScale.body.size,
  },
  error: {
    fontSize: TypeScale.bodySmall.size,
    lineHeight: TypeScale.bodySmall.size * TypeScale.bodySmall.lineHeight,
  },
});
