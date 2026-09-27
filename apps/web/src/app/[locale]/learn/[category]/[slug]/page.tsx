import type { Metadata } from "next";
import { notFound } from "next/navigation";
import ReactMarkdown from "react-markdown";
import {
  buildLearnArticleSlugPath,
  extractIdFromRecipeSlug,
  fetchArticleDetail,
  isLearnCategory,
} from "@bartendingapp/shared";
import { permanentRedirect } from "@/i18n/navigation";
import { getLocale } from "next-intl/server";
import type { Locale } from "@bartendingapp/shared";
import { BackButton } from "@/components/back-button";
import { Text } from "@/components/text";
import { supabase } from "@/lib/supabase";

interface LearnArticleParams {
  category: string;
  slug: string;
}

async function resolveArticle(categoryParam: string, slugParam: string) {
  if (!isLearnCategory(categoryParam)) {
    return null;
  }

  const id = extractIdFromRecipeSlug(slugParam);
  if (!id) {
    return null;
  }

  return fetchArticleDetail(supabase, id, categoryParam);
}

export async function generateMetadata({
  params,
}: {
  params: Promise<LearnArticleParams>;
}): Promise<Metadata> {
  const { category, slug } = await params;
  const article = await resolveArticle(category, slug);

  if (!article) {
    return {};
  }

  return {
    title: article.title,
  };
}

export default async function LearnArticlePage({
  params,
}: {
  params: Promise<LearnArticleParams>;
}) {
  const { category, slug } = await params;

  if (!isLearnCategory(category)) {
    notFound();
  }

  const article = await resolveArticle(category, slug);

  if (!article) {
    notFound();
  }

  const canonicalSlugPath = buildLearnArticleSlugPath(article.id, article.title);
  if (slug !== canonicalSlugPath) {
    const locale = (await getLocale()) as Locale;
    permanentRedirect({ href: `/learn/${category}/${canonicalSlugPath}`, locale });
  }

  return (
    <article className="flex flex-1 flex-col gap-four p-six">
      <BackButton />
      <Text variant="display" as="h1">
        {article.title}
      </Text>
      <div className="learn-article-body flex flex-col gap-three text-text">
        <ReactMarkdown>{article.bodyMarkdown}</ReactMarkdown>
      </div>
    </article>
  );
}
