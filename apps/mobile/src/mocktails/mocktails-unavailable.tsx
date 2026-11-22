import { useEffect, useRef } from "react";
import {
  AccessibilityInfo,
  SafeAreaView,
  StyleSheet,
  View,
  findNodeHandle,
  type Text as RNText,
} from "react-native";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";

import { BackButton } from "@/components/back-button";
import { Button } from "@/components/button";
import { Text } from "@/components/text";
import { Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";

// The notice shown in mocktails only mode in place of a screen that is not
// mocktail safe (spec 0063, AC-6, AC-9 to AC-12, AC-18): a recipe that is not
// mocktail safe, Learn spirits, wine, and beer, quizzes, service, bartender,
// bar, and account screens. Screen reader focus moves to the title when it
// replaces the content.
export function MocktailsUnavailable() {
  const { t } = useTranslation();
  const theme = useTheme();
  const router = useRouter();
  const titleRef = useRef<RNText>(null);

  useEffect(() => {
    const node = findNodeHandle(titleRef.current);
    if (node !== null) AccessibilityInfo.setAccessibilityFocus(node);
  }, []);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.bg }]}>
      <View style={styles.header}>
        <BackButton />
      </View>
      <View style={styles.body} testID="mocktails-unavailable">
        <Text ref={titleRef} variant="display" accessibilityRole="header">
          {t("mocktails.unavailableTitle")}
        </Text>
        <Text variant="body">{t("mocktails.unavailableBody")}</Text>
        <View style={styles.action}>
          <Button accessibilityRole="link" onPress={() => router.replace("/search")}>
            {t("mocktails.browseLink")}
          </Button>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.four,
  },
  body: {
    gap: Spacing.three,
    padding: Spacing.six,
  },
  action: {
    flexDirection: "row",
  },
});
