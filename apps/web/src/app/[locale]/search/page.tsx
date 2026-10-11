import type { Metadata } from "next";
import { Suspense } from "react";
import { getLocale, getTranslations } from "next-intl/server";
import {
  localizedPath,
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
  const title = query ? t("metaTitleQuery", { query }) : t("metaTitle");
  const description = query ? t("metaDescriptionQuery", { query }) : t("metaDescription");

  return {
    title,
    description,
    robots: { index: false, follow: true },
    openGraph: {
      title,
      description,
      url: localizedPath(
        (await getLocale()) as Locale,
        query ? `/search?q=${encodeURIComponent(query)}` : "/search",
      ),
    },
  };
}

export default async function SearchPage() {
  const locale = (await getLocale()) as Locale;
  const initialResults = await searchRecipes(supabasePublic, {
    query: "",
    statusFilter: null,
    pageLimit: RECIPE_SEARCH_PAGE_SIZE,
    pageOffset: 0,
    locale,
  });

  return (
    <main className="flex flex-1 flex-col">
      <Suspense>
        <SearchPageClient initialResults={initialResults} />
      </Suspense>
    </main>
  );
}
