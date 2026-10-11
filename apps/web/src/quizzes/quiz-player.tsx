"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { submitQuizAttempt, type QuizAttempt, type QuizDetail } from "@bartendingapp/shared";
import { Button } from "@/components/button";
import { Card } from "@/components/card";
import { Chip } from "@/components/chip";
import { Text } from "@/components/text";
import { supabase } from "@/lib/supabase";

export interface QuizPlayerProps {
  quiz: QuizDetail;
  initialBestScore: QuizAttempt | null;
}

interface ScoredResult {
  score: number;
  total: number;
  saveNotice: string | null;
}

export function QuizPlayer({ quiz, initialBestScore }: QuizPlayerProps) {
  const t = useTranslations("quizzes");
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<ScoredResult | null>(null);
  const [bestScore, setBestScore] = useState(initialBestScore);

  const allAnswered = quiz.questions.every((question) => answers[question.id] !== undefined);

  async function handleSubmit() {
    setSubmitting(true);

    const score = quiz.questions.reduce(
      (total, question) =>
        answers[question.id] === question.correctOptionIndex ? total + 1 : total,
      0,
    );
    const total = quiz.questions.length;

    const outcome = await submitQuizAttempt(supabase, quiz.id, score, total);

    if (outcome.saved) {
      setBestScore((current) =>
        !current || outcome.attempt.score > current.score ? outcome.attempt : current,
      );
    }

    setResult({
      score,
      total,
      saveNotice: outcome.saved ? null : t("saveFailed"),
    });
    setSubmitting(false);
  }

  if (result) {
    return (
      <div className="flex flex-col gap-four">
        <Card className="flex flex-col gap-two">
          <Text variant="heading" as="h2">
            {t("score", { score: result.score, total: result.total })}
          </Text>
          {result.saveNotice && (
            <Text variant="label" className="text-danger">
              {result.saveNotice}
            </Text>
          )}
          {bestScore && (
            <Text variant="label" muted>
              {t("best", { score: bestScore.score, total: bestScore.total })}
            </Text>
          )}
        </Card>

        <div className="flex flex-col gap-three">
          {quiz.questions.map((question, index) => {
            const userAnswerIndex = answers[question.id];
            const wasCorrect = userAnswerIndex === question.correctOptionIndex;
            return (
              <Card key={question.id} className="flex flex-col gap-two">
                <Text variant="label" muted>
                  {t("question", { number: index + 1 })}
                </Text>
                <Text variant="subheading" as="h3">
                  {question.prompt}
                </Text>
                <Text variant="body">
                  {wasCorrect
                    ? t("yourAnswerCorrect", { answer: question.options[userAnswerIndex] ?? "" })
                    : t("yourAnswerIncorrect", { answer: question.options[userAnswerIndex] ?? "" })}
                </Text>
                {!wasCorrect && (
                  <Text variant="body">
                    {t("correctAnswer", {
                      answer: question.options[question.correctOptionIndex] ?? "",
                    })}
                  </Text>
                )}
                {question.explanation && (
                  <Text variant="bodySmall" muted>
                    {question.explanation}
                  </Text>
                )}
              </Card>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-four">
      {bestScore && (
        <Text variant="label" muted>
          {t("best", { score: bestScore.score, total: bestScore.total })}
        </Text>
      )}

      <div className="flex flex-col gap-three">
        {quiz.questions.map((question, index) => (
          <Card key={question.id} className="flex flex-col gap-two">
            <Text variant="label" muted>
              {t("questionOf", { number: index + 1, total: quiz.questions.length })}
            </Text>
            <Text variant="subheading" as="h3">
              {question.prompt}
            </Text>
            <div className="flex flex-wrap gap-two">
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
            </div>
          </Card>
        ))}
      </div>

      <Button
        type="button"
        disabled={!allAnswered || submitting}
        onClick={handleSubmit}
        className="self-start"
      >
        {submitting ? t("submitting") : t("submit")}
      </Button>
    </div>
  );
}
