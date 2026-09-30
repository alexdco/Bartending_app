import type { Metadata } from "next";
import Link from "next/link";
import { buildQuizSlugPath, fetchQuizAttempt, fetchQuizzes } from "@bartendingapp/shared";
import { BackButton } from "@/components/back-button";
import { Card } from "@/components/card";
import { EmptyState } from "@/components/empty-state";
import { Text } from "@/components/text";
import { supabase } from "@/lib/supabase";

export const metadata: Metadata = {
  title: "Quizzes",
  description: "Test what you've learned with short quizzes on bartending topics and recipes.",
};

export default async function QuizzesPage() {
  const quizzes = await fetchQuizzes(supabase);
  const bestScores = await Promise.all(quizzes.map((quiz) => fetchQuizAttempt(supabase, quiz.id)));

  return (
    <main className="flex flex-1 flex-col gap-four p-six">
      <BackButton />
      <Text variant="display" as="h1">
        Quizzes
      </Text>
      <Text variant="body" muted>
        Short quizzes on Learn topics and recipes, so you can check what stuck.
      </Text>

      {quizzes.length === 0 ? (
        <EmptyState
          title="No quizzes yet"
          description="Check back soon for quizzes to test your knowledge."
        />
      ) : (
        <div className="flex flex-col gap-three">
          {quizzes.map((quiz, index) => {
            const bestScore = bestScores[index];
            return (
              <Link key={quiz.id} href={`/quizzes/${buildQuizSlugPath(quiz.id, quiz.title)}`}>
                <Card className="flex items-center justify-between gap-three">
                  <Text variant="subheading" as="h2">
                    {quiz.title}
                  </Text>
                  {bestScore && (
                    <Text variant="label" muted>
                      Best: {bestScore.score}/{bestScore.total}
                    </Text>
                  )}
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </main>
  );
}
