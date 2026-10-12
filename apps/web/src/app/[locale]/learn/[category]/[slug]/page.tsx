import type { Metadata } from "next";
import { buildOpenGraph } from "@/lib/open-graph";
import { notFound } from "next/navigation";
import ReactMarkdown from "react-markdown";
import {
  buildLearnArticleSlugPath,
  extractIdFromRecipeSlug,
  fetchArticleDetail,
  isLearnCategory,
  localizedPath,
  SUPPORTED_LOCALES,
} from "@bartendingapp/shared";
import { permanentRedirect } from "@/i18n/navigation";
import { getLocale } from "next-intl/server";
import type { Locale } from "@bartendingapp/shared";
import { BackButton } from "@/components/back-button";
import { Text } from "@/components/text";
import { supabasePublic } from "@/lib/supabase-public";

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

  return fetchArticleDetail(supabasePublic, id, categoryParam);
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

  const articlePath = `/learn/${category}/${buildLearnArticleSlugPath(article.id, article.title)}`;
  const locale = (await getLocale()) as Locale;
  const canonicalPath = localizedPath(locale, articlePath);

  return {
    title: article.title,
    alternates: {
      canonical: canonicalPath,
      languages: Object.fromEntries(
        SUPPORTED_LOCALES.map((locale) => [locale, localizedPath(locale, articlePath)]),
      ),
    },
    openGraph: await buildOpenGraph(locale, { title: article.title, url: canonicalPath }),
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
