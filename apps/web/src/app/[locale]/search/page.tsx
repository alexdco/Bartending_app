import type { Metadata } from "next";
import { buildOpenGraph } from "@/lib/open-graph";
import { Suspense } from "react";
import { getLocale, getTranslations } from "next-intl/server";
import {
  localizedPath,
  parseSearchSort,
  searchRecipes,
  RECIPE_SEARCH_PAGE_SIZE,
  type Locale,
} from "@bartendingapp/shared";
import { supabasePublic } from "@/lib/supabase-public";
import { SearchPageClient } from "@/recipes/search-page-client";

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}): Promise<Metadata> {
  const { q } = await searchParams;
  const query = q?.trim() ?? "";

  const t = await getTranslations("search");
  const locale = (await getLocale()) as Locale;
  const title = query ? t("metaTitleQuery", { query }) : t("metaTitle");
  const description = query ? t("metaDescriptionQuery", { query }) : t("metaDescription");

  return {
    title,
    description,
    robots: { index: false, follow: true },
    openGraph: await buildOpenGraph(locale, {
      title,
      description,
      url: localizedPath(locale, query ? `/search?q=${encodeURIComponent(query)}` : "/search"),
    }),
  };
}

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ sort?: string | string[] }>;
}) {
  const locale = (await getLocale()) as Locale;
  // Spec 0061 AC-8: /search?sort=az renders A to Z in the first server render.
  const initialSort = parseSearchSort((await searchParams).sort);
  const initialResults = await searchRecipes(supabasePublic, {
    query: "",
    statusFilter: null,
    pageLimit: RECIPE_SEARCH_PAGE_SIZE,
    pageOffset: 0,
    locale,
    sort: initialSort,
  });

  return (
    <main className="flex flex-1 flex-col">
      <Suspense>
        <SearchPageClient initialResults={initialResults} initialSort={initialSort} />
      </Suspense>
    </main>
  );
}
