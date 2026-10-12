import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import {
  buildQuizSlugPath,
  extractIdFromRecipeSlug,
  fetchQuizAttempt,
  fetchQuizDetail,
  type Locale,
} from "@bartendingapp/shared";
import { permanentRedirect } from "@/i18n/navigation";
import { BackButton } from "@/components/back-button";
import { Text } from "@/components/text";
import { supabasePublic } from "@/lib/supabase-public";
import { QuizPlayer } from "@/quizzes/quiz-player";

interface QuizDetailParams {
  slug: string;
}

async function resolveQuiz(slugParam: string) {
  const id = extractIdFromRecipeSlug(slugParam);
  if (!id) {
    return null;
  }
  return fetchQuizDetail(supabasePublic, id);
}

export async function generateMetadata({
  params,
}: {
  params: Promise<QuizDetailParams>;
}): Promise<Metadata> {
  const { slug } = await params;
  const quiz = await resolveQuiz(slug);

  if (!quiz) {
    return {};
  }

  const t = await getTranslations("quizzes");
  return {
    title: quiz.title,
    description: t("detailMetaDescription", { title: quiz.title }),
  };
}

export default async function QuizDetailPage({ params }: { params: Promise<QuizDetailParams> }) {
  const { slug } = await params;
  const quiz = await resolveQuiz(slug);

  if (!quiz) {
    notFound();
  }

  const canonicalSlugPath = buildQuizSlugPath(quiz.id, quiz.title);
  if (slug !== canonicalSlugPath) {
    const locale = (await getLocale()) as Locale;
    permanentRedirect({ href: `/quizzes/${canonicalSlugPath}`, locale });
  }

  const bestScore = await fetchQuizAttempt(supabasePublic, quiz.id);

  return (
    <main className="flex flex-1 flex-col gap-four p-six">
      <BackButton />
      <Text variant="display" as="h1">
        {quiz.title}
      </Text>

      <QuizPlayer quiz={quiz} initialBestScore={bestScore} />
    </main>
  );
}
