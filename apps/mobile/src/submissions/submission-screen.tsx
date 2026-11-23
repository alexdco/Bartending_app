import type { ReactNode } from "react";
import { SafeAreaView, ScrollView, StyleSheet, View } from "react-native";
import { useTranslation } from "react-i18next";

import { useSession } from "@/auth/use-session";
import { BackButton } from "@/components/back-button";
import { Spinner } from "@/components/spinner";
import { Text } from "@/components/text";
import { Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";
import { SubmissionSignInPrompt } from "./submission-prompts";

/**
 * The shell of the submit and edit screens: back, title, then the form for a
 * signed in (not anonymous) user, or the sign in prompt (spec 0064 AC-4).
 */
export function SubmissionScreen({ title, children }: { title: string; children: ReactNode }) {
  const theme = useTheme();
  const { t } = useTranslation();
  const { isLinked, isLoading } = useSession();

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.bg }]}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <BackButton />
        <Text variant="display">{title}</Text>
        {isLoading ? (
          <View style={styles.centered}>
            <Spinner label={t("submissions.loadingForm")} />
          </View>
        ) : isLinked ? (
          children
        ) : (
          <SubmissionSignInPrompt />
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    gap: Spacing.four,
    padding: Spacing.four,
  },
  centered: {
    alignItems: "center",
    paddingVertical: Spacing.six,
  },
});
