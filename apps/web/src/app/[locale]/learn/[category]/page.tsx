import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { notFound } from "next/navigation";
import {
  buildLearnArticleSlugPath,
  buildQuizSlugPath,
  fetchArticlesByCategory,
  fetchQuizBySource,
  isLearnCategory,
} from "@bartendingapp/shared";
import { BackButton } from "@/components/back-button";
import { Card } from "@/components/card";
import { EmptyState } from "@/components/empty-state";
import { Text } from "@/components/text";
import { supabasePublic } from "@/lib/supabase-public";

interface LearnCategoryParams {
  category: string;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<LearnCategoryParams>;
}): Promise<Metadata> {
  const { category } = await params;

  if (!isLearnCategory(category)) {
    return {};
  }

  const t = await getTranslations("learn");
  const label = t(`categories.${category}`);
  return {
    title: t("categoryMetaTitle", { label }),
    description: t("categoryMetaDescription", { label: label.toLowerCase() }),
  };
}

export default async function LearnCategoryPage({
  params,
}: {
  params: Promise<LearnCategoryParams>;
}) {
  const { category } = await params;

  if (!isLearnCategory(category)) {
    notFound();
  }

  const t = await getTranslations("learn");
  const articles = await fetchArticlesByCategory(supabasePublic, category);
  const quiz = await fetchQuizBySource(supabasePublic, "learn_category", category);

  return (
    <main className="flex flex-1 flex-col gap-four p-six">
      <BackButton fallbackHref="/learn" />
      <Text variant="display" as="h1">
        {t(`categories.${category}`)}
      </Text>

      {articles.length === 0 ? (
        <EmptyState title={t("emptyTitle")} description={t("emptyDescription")} />
      ) : (
        <div className="flex flex-col gap-three">
          {articles.map((article) => (
            <Link
              key={article.id}
              href={`/learn/${category}/${buildLearnArticleSlugPath(article.id, article.title)}`}
            >
              <Card>
                <Text variant="subheading" as="h2">
                  {article.title}
                </Text>
              </Card>
            </Link>
          ))}
        </div>
      )}

      {quiz && (
        <Link href={`/quizzes/${buildQuizSlugPath(quiz.id, quiz.title)}`}>
          <Card className="border-accent">
            <Text variant="label">{t("takeTheQuiz", { title: quiz.title })}</Text>
          </Card>
        </Link>
      )}
    </main>
  );
}
