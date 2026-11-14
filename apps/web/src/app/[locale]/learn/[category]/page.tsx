import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { notFound } from "next/navigation";
import {
  buildLearnArticleSlugPath,
  buildQuizSlugPath,
  fetchArticlesByCategory,
  fetchQuizBySource,
  isLearnCategory,
  LEARN_CATEGORIES,
} from "@bartendingapp/shared";
import type { Locale } from "@bartendingapp/shared";
import { BackButton } from "@/components/back-button";
import { Card } from "@/components/card";
import { EmptyState } from "@/components/empty-state";
import { Text } from "@/components/text";
import { supabasePublic } from "@/lib/supabase-public";

// Spec 0053: prebuilt at deploy for every locale × category, then rebuilt at
// most every 60 seconds. Must stay a literal (Next reads it statically). Nothing
// on this page may read cookies or headers, or the route turns dynamic again.
// A Supabase error throws, so a build fails rather than shipping an empty list,
// and a failed background rebuild keeps the last good page (AC-9).
export const revalidate = 60;

// Next combines these with the parent [locale] params from the layout.
export function generateStaticParams(): { category: string }[] {
  return LEARN_CATEGORIES.map((category) => ({ category }));
}

interface LearnCategoryParams {
  locale: string;
  category: string;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<LearnCategoryParams>;
}): Promise<Metadata> {
  const { locale, category } = await params;

  if (!isLearnCategory(category)) {
    return {};
  }

  // Spec 0033 AC-8: hand written per category, never a template.
  const t = await getTranslations({ locale: locale as Locale, namespace: "learn" });
  return {
    title: t(`categoryTitles.${category}`),
    description: t(`categoryDescriptions.${category}`),
  };
}

export default async function LearnCategoryPage({
  params,
}: {
  params: Promise<LearnCategoryParams>;
}) {
  const { locale, category } = await params;
  setRequestLocale(locale as Locale);

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
              <Card className="flex flex-col gap-one">
                <Text variant="subheading" as="h2">
                  {article.title}
                </Text>
                <Text variant="body" muted>
                  {article.summary}
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
