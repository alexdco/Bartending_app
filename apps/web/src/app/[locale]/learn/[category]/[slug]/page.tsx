import type { Metadata } from "next";
import { buildOpenGraph } from "@/lib/open-graph";
import { notFound } from "next/navigation";
import ReactMarkdown from "react-markdown";
import {
  buildLearnArticleSlugPath,
  extractIdFromRecipeSlug,
  fetchArticleDetail,
  hreflangAlternates,
  isLearnCategory,
  localizedPath,
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

  // Spec 0033 AC-6: the article's own summary, never the site description.
  // Bodies are English only, so /es and /pt show the English summary too.
  return {
    title: article.title,
    description: article.summary,
    alternates: {
      canonical: canonicalPath,
      languages: hreflangAlternates(locale, (candidate) => localizedPath(candidate, articlePath)),
    },
    openGraph: await buildOpenGraph(locale, {
      title: article.title,
      description: article.summary,
      url: canonicalPath,
    }),
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
      <BackButton fallbackHref={`/learn/${category}`} />
      <Text variant="display" as="h1">
        {article.title}
      </Text>
      <div className="learn-article-body flex flex-col gap-three text-text">
        <ReactMarkdown>{article.bodyMarkdown}</ReactMarkdown>
      </div>
    </article>
  );
}
