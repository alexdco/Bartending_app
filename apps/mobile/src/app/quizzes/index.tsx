import { useRouter } from "expo-router";
import { SafeAreaView, ScrollView, StyleSheet, TouchableOpacity, View } from "react-native";

import { BackButton } from "@/components/back-button";
import { Card } from "@/components/card";
import { EmptyState } from "@/components/empty-state";
import { Spinner } from "@/components/spinner";
import { Text } from "@/components/text";
import { Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";
import { useQuizzes } from "@/quizzes/use-quizzes";

export default function QuizzesScreen() {
  const theme = useTheme();
  const router = useRouter();
  const quizzesQuery = useQuizzes();
  const quizzes = quizzesQuery.data ?? [];

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.bg }]}>
      <ScrollView contentContainerStyle={styles.list}>
        <View style={styles.header}>
          <BackButton />
          <Text variant="display">Quizzes</Text>
          <Text variant="body" muted>
            Short quizzes on Learn topics and recipes, so you can check what stuck.
          </Text>
        </View>

        {quizzesQuery.error ? (
          <EmptyState
            title="Something went wrong"
            description="We couldn't load quizzes. Check your connection and try again."
          />
        ) : quizzesQuery.isPending ? (
          <View style={styles.centered}>
            <Spinner label="Loading quizzes" />
          </View>
        ) : quizzes.length === 0 ? (
          <EmptyState
            title="No quizzes yet"
            description="Check back soon for quizzes to test your knowledge."
          />
        ) : (
          <View style={styles.quizList}>
            {quizzes.map((quiz) => (
              <TouchableOpacity
                key={quiz.id}
                onPress={() => router.push(`/quizzes/${quiz.id}` as never)}
                accessibilityRole="button"
                accessibilityLabel={quiz.title}
                style={styles.row}
              >
                <Card>
                  <Text variant="subheading">{quiz.title}</Text>
                </Card>
              </TouchableOpacity>
            ))}
          </View>
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
  quizList: {
    gap: Spacing.three,
  },
  centered: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: Spacing.four,
  },
});
