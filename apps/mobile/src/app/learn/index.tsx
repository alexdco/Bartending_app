import { useRouter } from "expo-router";
import { SafeAreaView, ScrollView, StyleSheet, TouchableOpacity, View } from "react-native";
import { LEARN_CATEGORIES, type LearnCategory } from "@bartendingapp/shared";

import { BackButton } from "@/components/back-button";
import { Card } from "@/components/card";
import { Text } from "@/components/text";
import { Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";

const CATEGORY_LABELS: Record<LearnCategory, string> = {
  tools: "Tools",
  spirits: "Spirits",
  wine: "Wine",
  beer: "Beer",
  other: "Other",
};

export default function LearnScreen() {
  const theme = useTheme();
  const router = useRouter();

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.bg }]}>
      <ScrollView contentContainerStyle={styles.list}>
        <View style={styles.header}>
          <BackButton />
          <Text variant="display">Learn</Text>
          <Text variant="body" muted>
            Short articles about bar tools, spirits, wine, and beer.
          </Text>
        </View>

        <View style={styles.grid}>
          {LEARN_CATEGORIES.map((category) => (
            <TouchableOpacity
              key={category}
              style={styles.gridItem}
              onPress={() => router.push(`/learn/${category}` as never)}
              accessibilityRole="button"
            >
              <Card>
                <Text variant="subheading">{CATEGORY_LABELS[category]}</Text>
              </Card>
            </TouchableOpacity>
          ))}
        </View>

        <TouchableOpacity
          onPress={() => router.push("/quizzes" as never)}
          accessibilityRole="button"
        >
          <Card>
            <Text variant="label">Take a quiz</Text>
          </Card>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    gap: Spacing.three,
    padding: Spacing.four,
  },
  list: {
    paddingHorizontal: Spacing.four,
    paddingBottom: Spacing.four,
    gap: Spacing.four,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.three,
  },
  gridItem: {
    width: "47%",
  },
});
