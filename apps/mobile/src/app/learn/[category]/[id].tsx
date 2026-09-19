import { useLocalSearchParams } from "expo-router";
import { ScrollView, SafeAreaView, StyleSheet, View } from "react-native";
import Markdown from "react-native-markdown-display";
import { isLearnCategory } from "@bartendingapp/shared";

import { BackButton } from "@/components/back-button";
import { EmptyState } from "@/components/empty-state";
import { Spinner } from "@/components/spinner";
import { Text } from "@/components/text";
import { Spacing, TypeScale } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";
import { useLearnArticleDetail } from "@/learn/use-learn-articles";

export default function LearnArticleScreen() {
  const theme = useTheme();
  const { category: categoryParam, id } = useLocalSearchParams<{ category: string; id: string }>();
  const category = isLearnCategory(categoryParam) ? categoryParam : null;

  const { data: article, error, isPending } = useLearnArticleDetail(category ?? "other", id);

  if (!category) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: theme.bg }]}>
        <BackButton />
        <View style={styles.centered}>
          <EmptyState title="Not found" description="This category doesn't exist." />
        </View>
      </SafeAreaView>
    );
  }

  if (isPending) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: theme.bg }]}>
        <BackButton />
        <View style={styles.centered}>
          <Spinner label="Loading article" />
        </View>
      </SafeAreaView>
    );
  }

  if (error) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: theme.bg }]}>
        <BackButton />
        <View style={styles.centered}>
          <EmptyState
            title="Something went wrong"
            description="We couldn't load this article. Check your connection and try again."
          />
        </View>
      </SafeAreaView>
    );
  }

  if (!article) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: theme.bg }]}>
        <BackButton />
        <View style={styles.centered}>
          <EmptyState title="Not found" description="This article isn't available." />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.bg }]}>
      <ScrollView contentContainerStyle={styles.content}>
        <BackButton />
        <Text variant="display">{article.title}</Text>
        <Markdown
          style={{
            body: { color: theme.text, fontSize: TypeScale.body.size },
            heading2: { color: theme.text, fontWeight: "600" },
            heading3: { color: theme.text, fontWeight: "600" },
            link: { color: theme.accent },
          }}
        >
          {article.bodyMarkdown}
        </Markdown>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    gap: Spacing.three,
    padding: Spacing.four,
  },
  centered: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: Spacing.four,
  },
});
