import { useQuery } from "@tanstack/react-query";
import { fetchRecipeDetail, type Locale } from "@bartendingapp/shared";
import { useActiveLocale } from "@/i18n";
import { supabase } from "@/lib/supabase";

export function recipeDetailQueryKey(id: string, locale: Locale) {
  return ["recipes", "detail", id, locale] as const;
}

export function useRecipeDetail(id: string) {
  const locale = useActiveLocale();

  return useQuery({
    queryKey: recipeDetailQueryKey(id, locale),
    queryFn: () => fetchRecipeDetail(supabase, id, locale),
  });
}
