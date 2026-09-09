import { useRouter } from "expo-router";
import { Pressable, StyleSheet, View } from "react-native";

import { Text } from "@/components/text";
import { Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";

export function RegionShortcutRow({ regions }: { regions: string[] }) {
  const router = useRouter();
  const theme = useTheme();

  if (regions.length === 0) {
    return null;
  }

  return (
    <View style={styles.row} accessibilityRole="none">
      {regions.map((region) => (
        <Pressable
          key={region}
          accessibilityRole="button"
          accessibilityLabel={`Popular in ${region}`}
          hitSlop={8}
          onPress={() => router.push({ pathname: "/popular", params: { region } })}
          style={[styles.pill, { backgroundColor: theme.surface, borderColor: theme.border }]}
        >
          <Text variant="label">{region}</Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.two,
    paddingHorizontal: Spacing.four,
  },
  pill: {
    minHeight: 44,
    justifyContent: "center",
    borderRadius: Spacing.five,
    borderWidth: 1,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one,
  },
});
