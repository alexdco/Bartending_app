import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { buildQuizSlugPath, fetchQuizAttempt, fetchQuizzes } from "@bartendingapp/shared";
import { BackButton } from "@/components/back-button";
import { Card } from "@/components/card";
import { EmptyState } from "@/components/empty-state";
import { Text } from "@/components/text";
import { supabasePublic } from "@/lib/supabase-public";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("quizzes");
  return { title: t("title"), description: t("metaDescription") };
}

export default async function QuizzesPage() {
  const t = await getTranslations("quizzes");
  const quizzes = await fetchQuizzes(supabasePublic);
  const bestScores = await Promise.all(
    quizzes.map((quiz) => fetchQuizAttempt(supabasePublic, quiz.id)),
  );

  return (
    <main className="flex flex-1 flex-col gap-four p-six">
      <BackButton fallbackHref="/learn" />
      <Text variant="display" as="h1">
        {t("title")}
      </Text>
      <Text variant="body" muted>
        {t("intro")}
      </Text>

      {quizzes.length === 0 ? (
        <EmptyState title={t("emptyTitle")} description={t("emptyDescription")} />
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
                      {t("best", { score: bestScore.score, total: bestScore.total })}
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
