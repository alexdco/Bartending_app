import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  buildLearnArticleSlugPath,
  buildQuizSlugPath,
  fetchArticlesByCategory,
  fetchQuizBySource,
  isLearnCategory,
  type LearnCategory,
} from "@bartendingapp/shared";
import { BackButton } from "@/components/back-button";
import { Card } from "@/components/card";
import { EmptyState } from "@/components/empty-state";
import { Text } from "@/components/text";
import { supabasePublic } from "@/lib/supabase-public";

const CATEGORY_LABELS: Record<LearnCategory, string> = {
  tools: "Tools",
  spirits: "Spirits",
  wine: "Wine",
  beer: "Beer",
  other: "Other",
};

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

  const label = CATEGORY_LABELS[category];
  return {
    title: `${label} articles`,
    description: `Learn about ${label.toLowerCase()} for home bartending.`,
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

  const articles = await fetchArticlesByCategory(supabasePublic, category);
  const quiz = await fetchQuizBySource(supabasePublic, "learn_category", category);

  return (
    <main className="flex flex-1 flex-col gap-four p-six">
      <BackButton />
      <Text variant="display" as="h1">
        {CATEGORY_LABELS[category]}
      </Text>

      {articles.length === 0 ? (
        <EmptyState
          title="No articles yet"
          description="Check back soon for articles in this category."
        />
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
            <Text variant="label">Take the quiz: {quiz.title}</Text>
          </Card>
        </Link>
      )}
    </main>
  );
}
