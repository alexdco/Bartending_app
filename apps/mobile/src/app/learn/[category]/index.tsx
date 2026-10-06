import { useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView, ScrollView, StyleSheet, TouchableOpacity, View } from "react-native";
import { isLearnCategory, type LearnCategory } from "@bartendingapp/shared";

import { BackButton } from "@/components/back-button";
import { Card } from "@/components/card";
import { EmptyState } from "@/components/empty-state";
import { Spinner } from "@/components/spinner";
import { Text } from "@/components/text";
import { Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";
import { useLearnArticles } from "@/learn/use-learn-articles";
import { useQuizBySource } from "@/quizzes/use-quizzes";

const CATEGORY_LABELS: Record<LearnCategory, string> = {
  tools: "Tools",
  spirits: "Spirits",
  wine: "Wine",
  beer: "Beer",
  other: "Other",
};

export default function LearnCategoryScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { category: categoryParam } = useLocalSearchParams<{ category: string }>();
  const category = isLearnCategory(categoryParam) ? categoryParam : null;

  const articlesQuery = useLearnArticles(category ?? "other");
  const articles = category ? (articlesQuery.data ?? []) : [];
  const quizQuery = useQuizBySource("learn_category", category);
  const quiz = category ? (quizQuery.data ?? null) : null;

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

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.bg }]}>
      <ScrollView contentContainerStyle={styles.list}>
        <View style={styles.header}>
          <BackButton />
          <Text variant="display">{CATEGORY_LABELS[category]}</Text>
        </View>

        {articlesQuery.error ? (
          <EmptyState
            title="Something went wrong"
            description="We couldn't load these articles. Check your connection and try again."
          />
        ) : articlesQuery.isPending ? (
          <View style={styles.centered}>
            <Spinner label="Loading articles" />
          </View>
        ) : articles.length === 0 ? (
          <EmptyState
            title="No articles yet"
            description="Check back soon for articles in this category."
          />
        ) : (
          <View style={styles.articleList}>
            {articles.map((article) => (
              <TouchableOpacity
                key={article.id}
                onPress={() => router.push(`/learn/${category}/${article.id}` as never)}
                accessibilityRole="button"
              >
                <Card>
                  <Text variant="subheading">{article.title}</Text>
                </Card>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {quiz && (
          <TouchableOpacity
            onPress={() => router.push(`/quizzes/${quiz.id}` as never)}
            accessibilityRole="button"
          >
            <Card>
              <Text variant="label">Take the quiz: {quiz.title}</Text>
            </Card>
          </TouchableOpacity>
        )}
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
  articleList: {
    gap: Spacing.three,
  },
  centered: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: Spacing.four,
  },
});
