import { SafeAreaView, StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";

import { useSession } from "@/auth/use-session";
import { BackButton } from "@/components/back-button";
import { Button } from "@/components/button";
import { Spinner } from "@/components/spinner";
import { Text } from "@/components/text";
import { Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";
import { withMocktailsHidden } from "@/mocktails/with-mocktails-hidden";
import { MyRecipesList } from "@/submissions/my-recipes-list";
import { SubmissionSignInPrompt } from "@/submissions/submission-prompts";

// Spec 0064 AC-6: the author's submissions.
function MyRecipesScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { t } = useTranslation();
  const { isLinked, isLoading } = useSession();

  const header = (
    <View style={styles.header}>
      <BackButton />
      <Text variant="display">{t("submissions.myRecipesTitle")}</Text>
      {isLinked && (
        <Button onPress={() => router.push("/my-recipes/new")}>{t("submissions.submitCta")}</Button>
      )}
    </View>
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.bg }]}>
      {isLinked ? (
        <MyRecipesList header={header} />
      ) : (
        <View style={styles.signedOut}>
          {header}
          {isLoading ? (
            <View style={styles.centered}>
              <Spinner label={t("submissions.loading")} />
            </View>
          ) : (
            <SubmissionSignInPrompt />
          )}
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    gap: Spacing.three,
    paddingBottom: Spacing.two,
  },
  signedOut: {
    gap: Spacing.four,
    padding: Spacing.four,
  },
  centered: {
    alignItems: "center",
    paddingVertical: Spacing.six,
  },
});

// Hidden in mocktails only mode (spec 0064 AC-20).
export default withMocktailsHidden(MyRecipesScreen);
