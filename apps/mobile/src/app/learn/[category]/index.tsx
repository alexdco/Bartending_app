import { useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView, ScrollView, StyleSheet, TouchableOpacity, View } from "react-native";
import {
  isLearnCategory,
  isMocktailsHiddenLearnCategory,
  type LearnCategory,
} from "@bartendingapp/shared";

import { BackButton } from "@/components/back-button";
import { Card } from "@/components/card";
import { EmptyState } from "@/components/empty-state";
import { Spinner } from "@/components/spinner";
import { Text } from "@/components/text";
import { Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";
import { useLearnArticles } from "@/learn/use-learn-articles";
import { useQuizBySource } from "@/quizzes/use-quizzes";
import { useMocktailsOnly } from "@/mocktails/mocktails-context";
import { MocktailsUnavailable } from "@/mocktails/mocktails-unavailable";

const CATEGORY_LABELS: Record<LearnCategory, string> = {
  tools: "Tools",
  spirits: "Spirits",
  wine: "Wine",
  beer: "Beer",
  other: "Other",
};

function LearnCategoryContent() {
  const theme = useTheme();
  const router = useRouter();
  const { category: categoryParam } = useLocalSearchParams<{ category: string }>();
  const category = isLearnCategory(categoryParam) ? categoryParam : null;
  const mocktailsOnly = useMocktailsOnly();

  const articlesQuery = useLearnArticles(category ?? "other");
  const articles = category ? (articlesQuery.data ?? []) : [];
  // Quizzes are hidden in mocktails only mode, so the lookup is skipped (spec 0063 AC-10).
  const quizQuery = useQuizBySource("learn_category", mocktailsOnly ? null : category);
  const quiz = category && !mocktailsOnly ? (quizQuery.data ?? null) : null;

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
                accessibilityLabel={article.title}
                accessibilityHint={article.summary}
                style={styles.row}
              >
                <Card style={styles.articleCard}>
                  <Text variant="subheading">{article.title}</Text>
                  <Text variant="body" muted>
                    {article.summary}
                  </Text>
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
  // 44 point minimum touch target (spec 0038 AC-13).
  row: {
    minHeight: 44,
  },
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
  articleCard: {
    gap: Spacing.one,
  },
  centered: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: Spacing.four,
  },
});

// Spirits, wine, and beer show the notice in mocktails only mode, before any
// of their content is fetched (spec 0063 AC-9).
export default function LearnCategoryScreen() {
  const { category } = useLocalSearchParams<{ category: string }>();
  const mocktailsOnly = useMocktailsOnly();
  if (mocktailsOnly && isMocktailsHiddenLearnCategory(category ?? "")) {
    return <MocktailsUnavailable />;
  }
  return <LearnCategoryContent />;
}
