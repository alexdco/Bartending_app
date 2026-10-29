import { useState } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView, ScrollView, StyleSheet, View } from "react-native";
import {
  buildQuizSourceLinkClickedEvent,
  submitQuizAttempt,
  type QuizAnswers,
  type QuizAttempt,
  type QuizDetail,
  type QuizQuestionSource,
} from "@bartendingapp/shared";

import { track } from "@/analytics/posthog-client";

import { BackButton } from "@/components/back-button";
import { Button } from "@/components/button";
import { Card } from "@/components/card";
import { Chip } from "@/components/chip";
import { EmptyState } from "@/components/empty-state";
import { Spinner } from "@/components/spinner";
import { Text } from "@/components/text";
import { Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";
import { supabase } from "@/lib/supabase";
import { clearKeptQuizAnswers, keepQuizAnswers, readKeptQuizAnswers } from "@/quizzes/kept-results";
import { QuizExplanation } from "@/quizzes/quiz-explanation";
import { useQuizAttempt, useQuizDetail } from "@/quizzes/use-quizzes";

interface ScoredResult {
  score: number;
  total: number;
  saveNotice: string | null;
}

function scoreAnswers(quiz: QuizDetail, answers: QuizAnswers): number {
  return quiz.questions.reduce(
    (total, question) => (answers[question.id] === question.correctOptionIndex ? total + 1 : total),
    0,
  );
}

export default function QuizDetailScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: quiz, error, isPending } = useQuizDetail(id);
  const attemptQuery = useQuizAttempt(id);

  const [answers, setAnswers] = useState<QuizAnswers>({});
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<ScoredResult | null>(null);
  const [bestScore, setBestScore] = useState<QuizAttempt | null>(null);
  // The quiz whose kept result has been checked (spec 0042 AC-5). Checked in
  // the same render the quiz arrives in, so the answering form never flashes
  // before a restored result.
  const [restoredQuizId, setRestoredQuizId] = useState<string | null>(null);

  if (quiz && restoredQuizId !== quiz.id) {
    setRestoredQuizId(quiz.id);
    const kept = readKeptQuizAnswers(quiz.id, quiz.questions);
    if (kept) {
      setAnswers(kept);
      setResult({
        score: scoreAnswers(quiz, kept),
        total: quiz.questions.length,
        saveNotice: null,
      });
    }
  }

  const displayedBestScore = bestScore ?? attemptQuery.data ?? null;

  if (isPending) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: theme.bg }]}>
        <BackButton />
        <View style={styles.centered}>
          <Spinner label="Loading quiz" />
        </View>
      </SafeAreaView>
    );
  }

  if (error || !quiz) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: theme.bg }]}>
        <BackButton />
        <View style={styles.centered}>
          <EmptyState title="Not found" description="This quiz isn't available." />
        </View>
      </SafeAreaView>
    );
  }

  const allAnswered = quiz.questions.every((question) => answers[question.id] !== undefined);

  async function handleSubmit() {
    setSubmitting(true);

    const score = scoreAnswers(quiz!, answers);
    const total = quiz!.questions.length;
    keepQuizAnswers(quiz!.id, answers);

    const outcome = await submitQuizAttempt(supabase, quiz!.id, score, total);

    if (outcome.saved) {
      setBestScore((current) =>
        !current || outcome.attempt.score > current.score ? outcome.attempt : current,
      );
    }

    setResult({
      score,
      total,
      saveNotice: outcome.saved ? null : "Your score could not be saved, but here's how you did.",
    });
    setSubmitting(false);
  }

  function handleTakeAgain() {
    clearKeptQuizAnswers(quiz!.id);
    setAnswers({});
    setResult(null);
  }

  function handleSourcePress(source: QuizQuestionSource, questionId: string, wasCorrect: boolean) {
    const event = buildQuizSourceLinkClickedEvent({
      quiz_id: quiz!.id,
      question_id: questionId,
      target_kind: source.kind,
      was_correct: wasCorrect,
    });
    track(event.name, event.properties);

    if (source.kind === "article") {
      router.push({
        pathname: "/learn/[category]/[id]",
        params: { category: source.category, id: source.id },
      });
    } else {
      router.push({ pathname: "/recipe/[id]", params: { id: source.id } });
    }
  }

  if (result) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: theme.bg }]}>
        <ScrollView contentContainerStyle={styles.list}>
          <BackButton />
          <Text variant="display">{quiz.title}</Text>

          <Card style={styles.resultCard}>
            <Text variant="heading">
              Score: {result.score}/{result.total}
            </Text>
            {result.saveNotice && (
              <Text variant="label" style={{ color: theme.danger }}>
                {result.saveNotice}
              </Text>
            )}
            {displayedBestScore && (
              <Text variant="label" muted>
                Best: {displayedBestScore.score}/{displayedBestScore.total}
              </Text>
            )}
            <Button variant="secondary" onPress={handleTakeAgain}>
              Take again
            </Button>
          </Card>

          {quiz.questions.map((question, index) => {
            const userAnswerIndex = answers[question.id] ?? -1;
            const wasCorrect = userAnswerIndex === question.correctOptionIndex;
            return (
              <Card key={question.id} style={styles.questionCard}>
                <Text variant="label" muted>
                  Question {index + 1}
                </Text>
                <Text variant="subheading">{question.prompt}</Text>
                <Text variant="body">
                  Your answer: {question.options[userAnswerIndex]}{" "}
                  {wasCorrect ? "(correct)" : "(incorrect)"}
                </Text>
                {!wasCorrect && (
                  <Text variant="body">
                    Correct answer: {question.options[question.correctOptionIndex]}
                  </Text>
                )}
                <QuizExplanation
                  question={question}
                  onSourcePress={(source) => handleSourcePress(source, question.id, wasCorrect)}
                />
              </Card>
            );
          })}
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.bg }]}>
      <ScrollView contentContainerStyle={styles.list}>
        <BackButton />
        <Text variant="display">{quiz.title}</Text>
        {displayedBestScore && (
          <Text variant="label" muted>
            Best: {displayedBestScore.score}/{displayedBestScore.total}
          </Text>
        )}

        {quiz.questions.map((question, index) => (
          <Card key={question.id} style={styles.questionCard}>
            <Text variant="label" muted>
              Question {index + 1} of {quiz.questions.length}
            </Text>
            <Text variant="subheading">{question.prompt}</Text>
            <View style={styles.optionRow}>
              {question.options.map((option, optionIndex) => (
                <Chip
                  key={optionIndex}
                  selected={answers[question.id] === optionIndex}
                  onSelectedChange={(selected) => {
                    if (!selected) {
                      return;
                    }
                    setAnswers((current) => ({ ...current, [question.id]: optionIndex }));
                  }}
                >
                  {option}
                </Chip>
              ))}
            </View>
          </Card>
        ))}

        <Button disabled={!allAnswered || submitting} onPress={handleSubmit}>
          {submitting ? "Submitting…" : "Submit"}
        </Button>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  list: {
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.four,
    gap: Spacing.three,
  },
  resultCard: {
    gap: Spacing.two,
  },
  questionCard: {
    gap: Spacing.two,
  },
  optionRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.two,
  },
  centered: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: Spacing.four,
  },
});
