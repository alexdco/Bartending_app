import { Pressable, StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/button";
import { EmptyState } from "@/components/empty-state";
import { Text } from "@/components/text";
import { Spacing } from "@/constants/theme";
import { useSession } from "@/auth/use-session";

/** Guests and anonymous sessions see this instead of the form or list (spec 0064 AC-4). */
export function SubmissionSignInPrompt() {
  const { t } = useTranslation();
  const router = useRouter();
  return (
    <EmptyState
      title={t("submissions.signInTitle")}
      description={t("submissions.signInDescription")}
      action={
        <Button onPress={() => router.push("/account")}>{t("submissions.signInAction")}</Button>
      }
    />
  );
}

/**
 * "Can't find it? Submit your recipe" at the end of search results and on the
 * empty state (AC-21). Guests get the same prompt, leading to sign in. The
 * caller hides it in mocktails only mode (AC-20).
 */
export function SubmitRecipePrompt() {
  const { t } = useTranslation();
  const router = useRouter();
  const { isLinked } = useSession();

  return (
    <View style={styles.prompt}>
      <Text variant="bodySmall" muted>
        {t("submissions.searchPrompt")}
      </Text>
      <Pressable
        accessibilityRole="link"
        hitSlop={8}
        onPress={() =>
          isLinked
            ? router.push({ pathname: "/my-recipes/new", params: { from: "search" } })
            : router.push("/account")
        }
      >
        <Text variant="label" style={styles.link}>
          {t("submissions.searchPromptAction")}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  prompt: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    alignItems: "center",
    gap: Spacing.one,
    paddingVertical: Spacing.four,
  },
  link: {
    textDecorationLine: "underline",
  },
});
