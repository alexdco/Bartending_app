import { searchRecipes, RECIPE_SEARCH_PAGE_SIZE } from "@bartendingapp/shared";
import { supabase } from "@/lib/supabase";
import { SearchPageClient } from "@/recipes/search-page-client";

export default async function Home() {
  const initialResults = await searchRecipes(supabase, {
    query: "",
    statusFilter: null,
    pageLimit: RECIPE_SEARCH_PAGE_SIZE,
    pageOffset: 0,
  });

  return (
    <main className="flex flex-1 flex-col">
      <SearchPageClient initialResults={initialResults} />
    </main>
  );
}
