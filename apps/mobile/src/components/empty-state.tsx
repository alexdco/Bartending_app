import type { ReactNode } from "react";
import { StyleSheet, View } from "react-native";

import { Spacing } from "@/constants/theme";
import { Text } from "./text";

export interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <View style={styles.container}>
      {icon}
      <Text variant="subheading">{title}</Text>
      {description && (
        <Text variant="body" muted style={styles.description}>
          {description}
        </Text>
      )}
      {action}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.two,
    paddingVertical: Spacing.six,
  },
  description: {
    textAlign: "center",
  },
});
