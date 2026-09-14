import type { Metadata } from "next";
import { Suspense } from "react";
import { searchRecipes, RECIPE_SEARCH_PAGE_SIZE } from "@bartendingapp/shared";
import { supabase } from "@/lib/supabase";
import { SearchPageClient } from "@/recipes/search-page-client";

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}): Promise<Metadata> {
  const { q } = await searchParams;
  const query = q?.trim() ?? "";

  const title = query ? `${query} recipes` : "Search recipes";
  const description = query
    ? `Recipes matching "${query}": find the drink you're looking for.`
    : "Search cocktail and mocktail recipes by name or ingredient, with full instructions and images.";

  return {
    title,
    description,
    robots: { index: false, follow: true },
    openGraph: {
      title,
      description,
      url: query ? `/search?q=${encodeURIComponent(query)}` : "/search",
    },
  };
}

export default async function SearchPage() {
  const initialResults = await searchRecipes(supabase, {
    query: "",
    statusFilter: null,
    pageLimit: RECIPE_SEARCH_PAGE_SIZE,
    pageOffset: 0,
  });

  return (
    <main className="flex flex-1 flex-col">
      <Suspense>
        <SearchPageClient initialResults={initialResults} />
      </Suspense>
    </main>
  );
}
