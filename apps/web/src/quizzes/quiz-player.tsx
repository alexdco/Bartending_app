"use client";

import { useState, useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";
import {
  buildLearnArticleSlugPath,
  buildQuizSourceLinkClickedEvent,
  buildRecipeSlugPath,
  restoreQuizAnswers,
  splitExplanationAtAnchor,
  submitQuizAttempt,
  type QuizAnswers,
  type QuizAttempt,
  type QuizDetail,
  type QuizQuestion,
  type QuizQuestionSource,
} from "@bartendingapp/shared";
import { track } from "@/analytics/posthog-client";
import { Button } from "@/components/button";
import { Card } from "@/components/card";
import { Chip } from "@/components/chip";
import { Text } from "@/components/text";
import { Link } from "@/i18n/navigation";
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

// The kept result (spec 0042 AC-5): only the answers are stored, the score
// is always recomputed from them, so a stale or tampered entry can never show
// a wrong score.
function resultStorageKey(quizId: string): string {
  return `quiz-result:${quizId}`;
}

function readKeptRaw(quizId: string): string | null {
  try {
    return window.sessionStorage.getItem(resultStorageKey(quizId));
  } catch {
    return null;
  }
}

function parseKeptAnswers(raw: string | null, quiz: QuizDetail): QuizAnswers | null {
  if (raw === null) {
    return null;
  }
  try {
    return restoreQuizAnswers(JSON.parse(raw), quiz.questions);
  } catch {
    return null;
  }
}

// The kept result is read once, so there is nothing to subscribe to.
function subscribeToNothing(): () => void {
  return () => {};
}

function writeKeptAnswers(quizId: string, answers: QuizAnswers): void {
  try {
    window.sessionStorage.setItem(resultStorageKey(quizId), JSON.stringify(answers));
  } catch {
    // Storage unavailable (private mode, quota): the result just won't survive Back.
  }
}

function clearKeptAnswers(quizId: string): void {
  try {
    window.sessionStorage.removeItem(resultStorageKey(quizId));
  } catch {
    // Nothing kept to clear.
  }
}

function scoreAnswers(quiz: QuizDetail, answers: QuizAnswers): number {
  return quiz.questions.reduce(
    (total, question) => (answers[question.id] === question.correctOptionIndex ? total + 1 : total),
    0,
  );
}

function sourceHref(source: QuizQuestionSource): string {
  return source.kind === "article"
    ? `/learn/${source.category}/${buildLearnArticleSlugPath(source.id, source.title)}`
    : `/recipes/${buildRecipeSlugPath(source.id, source.name)}`;
}

const SOURCE_LINK_CLASS = "text-text underline decoration-accent decoration-2 underline-offset-2";

interface QuizExplanationProps {
  question: QuizQuestion;
  onSourceClick: (source: QuizQuestionSource) => void;
}

// Spec 0042 AC-1 to AC-3: the anchor phrase inside the explanation becomes
// the source link; with no usable anchor a "Read more" line carries it; with
// no viewable source the explanation renders exactly as before.
function QuizExplanation({ question, onSourceClick }: QuizExplanationProps) {
  const t = useTranslations("quizzes");
  const { source, explanation } = question;

  if (!source) {
    return explanation ? (
      <Text variant="bodySmall" muted>
        {explanation}
      </Text>
    ) : null;
  }

  const href = sourceHref(source);
  const handleClick = () => onSourceClick(source);
  const split = splitExplanationAtAnchor(explanation, question.sourceAnchor);

  if (split) {
    return (
      <Text variant="bodySmall" muted>
        {split.before}
        <Link href={href} onClick={handleClick} className={SOURCE_LINK_CLASS}>
          {split.match}
        </Link>
        {split.after}
      </Text>
    );
  }

  return (
    <>
      {explanation && (
        <Text variant="bodySmall" muted>
          {explanation}
        </Text>
      )}
      <Text variant="bodySmall" muted>
        {t.rich("readMore", {
          name: source.kind === "article" ? source.title : source.name,
          link: (chunks) => (
            <Link href={href} onClick={handleClick} className={SOURCE_LINK_CLASS}>
              {chunks}
            </Link>
          ),
        })}
      </Text>
    </>
  );
}

export function QuizPlayer({ quiz, initialBestScore }: QuizPlayerProps) {
  const t = useTranslations("quizzes");
  const [answers, setAnswers] = useState<QuizAnswers>({});
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<ScoredResult | null>(null);
  const [bestScore, setBestScore] = useState(initialBestScore);
  // undefined on the server and during hydration (so the first render
  // matches the server HTML), then the raw sessionStorage value. Until it has
  // been checked the player renders nothing, so the answering form never
  // flashes before a restored result (spec 0042 AC-5).
  const keptRaw = useSyncExternalStore(
    subscribeToNothing,
    () => readKeptRaw(quiz.id),
    () => undefined,
  );
  const [restored, setRestored] = useState(false);

  if (!restored && keptRaw !== undefined) {
    setRestored(true);
    const kept = parseKeptAnswers(keptRaw, quiz);
    if (kept) {
      setAnswers(kept);
      setResult({
        score: scoreAnswers(quiz, kept),
        total: quiz.questions.length,
        saveNotice: null,
      });
    }
  }

  const allAnswered = quiz.questions.every((question) => answers[question.id] !== undefined);

  async function handleSubmit() {
    setSubmitting(true);

    const score = scoreAnswers(quiz, answers);
    const total = quiz.questions.length;
    writeKeptAnswers(quiz.id, answers);

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

  function handleTakeAgain() {
    clearKeptAnswers(quiz.id);
    setAnswers({});
    setResult(null);
    window.scrollTo({ top: 0 });
  }

  if (!restored) {
    return null;
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
          <Button
            type="button"
            variant="secondary"
            onClick={handleTakeAgain}
            className="self-start"
          >
            {t("takeAgain")}
          </Button>
        </Card>

        <div className="flex flex-col gap-three">
          {quiz.questions.map((question, index) => {
            const userAnswerIndex = answers[question.id] ?? -1;
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
                <QuizExplanation
                  question={question}
                  onSourceClick={(source) => {
                    const event = buildQuizSourceLinkClickedEvent({
                      quiz_id: quiz.id,
                      question_id: question.id,
                      target_kind: source.kind,
                      was_correct: wasCorrect,
                    });
                    track(event.name, event.properties);
                  }}
                />
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
